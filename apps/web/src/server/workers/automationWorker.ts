import { Worker } from "bullmq";
import cron from "node-cron";
import { db } from "../db";
import { agents, automations, automationRuns, chatSessions, messages as messagesTable } from "../db/schema";
import { eq } from "drizzle-orm";
import { AgentRuntime } from "@agenthub/agent-runtime";
import { createQueue, jobProgressPublisher, queueConnection, queuePrefix } from "../queues";
import { deadLetterQueue } from "../queues/dead-letter";
import { buildAutomationWorkflowPrompt } from "@/lib/workflow-designer";

export const automationQueue = createQueue<{ automationId: string; runId: string }>("automations");

function hasReachedExecutionLimit(auto: typeof automations.$inferSelect) {
  return auto.maxExecutions !== null && auto.executionCount >= auto.maxExecutions;
}

async function sendNotification(
  auto: typeof automations.$inferSelect,
  runId: string,
  status: "success" | "error",
  output: string,
  error: string | null,
  sessionId: string | null,
) {
  const url = auto.notificationWebhookUrl ?? auto.webhookUrl;
  if (!url) {
    await db.update(automationRuns).set({ notificationStatus: "skipped" }).where(eq(automationRuns.id, runId));
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        automationId: auto.id,
        runId,
        sessionId,
        status,
        output,
        error,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    await db
      .update(automationRuns)
      .set({ notificationStatus: "sent", notificationError: null })
      .where(eq(automationRuns.id, runId));
  } catch (err) {
    await db
      .update(automationRuns)
      .set({
        notificationStatus: "error",
        notificationError: err instanceof Error ? err.message : "Notification failed",
      })
      .where(eq(automationRuns.id, runId));
  }
}

async function runAutomation(automationId: string, runId: string) {
  await db.update(automationRuns).set({ status: "running" }).where(eq(automationRuns.id, runId));

  try {
    const [auto] = await db.select().from(automations).where(eq(automations.id, automationId)).limit(1);
    if (!auto) throw new Error("Automation not found");
    jobProgressPublisher.publish({
      userId: auto.userId,
      queue: "automations",
      jobId: runId,
      progress: 10,
      message: "Automation run started.",
    });
    if (hasReachedExecutionLimit(auto)) {
      await db
        .update(automationRuns)
        .set({ status: "error", error: "Automation maxExecutions limit reached", completedAt: new Date() })
        .where(eq(automationRuns.id, runId));
      await db
        .update(automations)
        .set({ isActive: false, pausedAt: new Date(), pauseReason: "max_executions_reached" })
        .where(eq(automations.id, automationId));
      jobProgressPublisher.publish({
        userId: auto.userId,
        queue: "automations",
        jobId: runId,
        progress: { status: "error" },
        message: "Automation maxExecutions limit reached.",
      });
      return;
    }

    const [agent] = auto.agentId ? await db.select().from(agents).where(eq(agents.id, auto.agentId)).limit(1) : [null];
    const model = agent?.model ?? "ollama:qwen2.5:7b";
    const runPrompt = buildAutomationWorkflowPrompt(auto.prompt, auto.workflowDefinition);
    const [session] = await db
      .insert(chatSessions)
      .values({
        userId: auto.userId,
        agentId: auto.agentId,
        title: `Automation: ${auto.name}`,
        model,
        metadata: { source: "automation", automationId, runId },
      })
      .returning();

    await db.update(automationRuns).set({ sessionId: session.id }).where(eq(automationRuns.id, runId));

    await db.insert(messagesTable).values({
      sessionId: session.id,
      role: "user",
      content: runPrompt,
      metadata: { source: "automation", automationId, runId },
    });

    const runtime = new AgentRuntime({ model, systemPrompt: agent?.systemPrompt ?? "" });
    let output = "";
    const stream = runtime.run({
      sessionId: session.id,
      messages: [{ role: "user", content: runPrompt }],
    });
    for await (const chunk of stream) {
      if (chunk.type === "content") output += chunk.content;
    }

    await db
      .update(automationRuns)
      .set({ status: "success", output, completedAt: new Date() })
      .where(eq(automationRuns.id, runId));
    await db.insert(messagesTable).values({
      sessionId: session.id,
      role: "assistant",
      content: output || "Automation completed without output.",
      model,
      metadata: { source: "automation", automationId, runId },
    });
    await db
      .update(automations)
      .set({
        lastRunAt: new Date(),
        executionCount: auto.executionCount + 1,
        ...(auto.maxExecutions !== null && auto.executionCount + 1 >= auto.maxExecutions
          ? { isActive: false, pausedAt: new Date(), pauseReason: "max_executions_reached" }
          : {}),
      })
      .where(eq(automations.id, automationId));
    jobProgressPublisher.publish({
      userId: auto.userId,
      queue: "automations",
      jobId: runId,
      progress: 100,
      message: "Automation run completed.",
    });
    await sendNotification(auto, runId, "success", output, null, session.id);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    await db
      .update(automationRuns)
      .set({ status: "error", error, completedAt: new Date() })
      .where(eq(automationRuns.id, runId));
    await deadLetterQueue.record({
      queueName: "automations",
      jobId: runId,
      threadId: sessionIdFromRun(runId),
      failedNode: "automation_run",
      errorMessage: error,
      finalState: { automationId, runId, status: "error" },
      failureCategory: "llm_error",
      retryCount: 0,
    });
    const [auto] = await db.select().from(automations).where(eq(automations.id, automationId)).limit(1);
    if (auto) {
      jobProgressPublisher.publish({
        userId: auto.userId,
        queue: "automations",
        jobId: runId,
        progress: { status: "error" },
        message: error,
      });
      await sendNotification(auto, runId, "error", "", error, null);
    }
  }
}

function sessionIdFromRun(runId: string) {
  return `automation:${runId}`;
}

const scheduledTasks = new Map<string, ReturnType<typeof cron.schedule>>();

async function refreshSchedules() {
  const active = await db
    .select({
      id: automations.id,
      cronExpression: automations.cronExpression,
      timezone: automations.timezone,
      maxExecutions: automations.maxExecutions,
      executionCount: automations.executionCount,
    })
    .from(automations)
    .where(eq(automations.isActive, true));

  const activeIds = new Set(active.map((a) => a.id));

  for (const [id, task] of scheduledTasks) {
    if (!activeIds.has(id)) {
      task.stop();
      scheduledTasks.delete(id);
    }
  }

  for (const auto of active) {
    if (scheduledTasks.has(auto.id)) continue;
    if (auto.maxExecutions !== null && auto.executionCount >= auto.maxExecutions) continue;
    if (!cron.validate(auto.cronExpression)) continue;
    const task = cron.schedule(
      auto.cronExpression,
      () => {
        void (async () => {
          if (auto.maxExecutions !== null && auto.executionCount >= auto.maxExecutions) return;
          const [run] = await db
            .insert(automationRuns)
            .values({ automationId: auto.id, status: "pending", startedAt: new Date() })
            .returning();
          await automationQueue.add("run", { automationId: auto.id, runId: run.id });
        })();
      },
      { timezone: auto.timezone },
    );
    scheduledTasks.set(auto.id, task);
  }
}

export function startAutomationWorker() {
  const worker = new Worker(
    "automations",
    async (job) => {
      const { automationId, runId } = job.data as { automationId: string; runId: string };
      await runAutomation(automationId, runId);
    },
    { connection: queueConnection, prefix: queuePrefix },
  );

  worker.on("error", (err) => {
    console.error("[automation-worker] error:", err.message);
  });

  // Refresh schedules every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    void refreshSchedules();
  });

  // Initial load
  void refreshSchedules();

  return worker;
}

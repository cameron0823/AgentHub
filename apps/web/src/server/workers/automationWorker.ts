import { Queue, Worker } from "bullmq";
import cron from "node-cron";
import { db } from "../db";
import { automations, automationRuns } from "../db/schema";
import { eq } from "drizzle-orm";
import { AgentRuntime } from "@agenthub/agent-runtime";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379"),
};

export const automationQueue = new Queue("automations", { connection });

async function runAutomation(automationId: string, runId: string) {
  await db
    .update(automationRuns)
    .set({ status: "running" })
    .where(eq(automationRuns.id, runId));

  try {
    const [auto] = await db
      .select()
      .from(automations)
      .where(eq(automations.id, automationId))
      .limit(1);
    if (!auto) throw new Error("Automation not found");

    const model = "ollama:qwen2.5:7b";
    const runtime = new AgentRuntime({ model, systemPrompt: "" });
    let output = "";
    const stream = runtime.run({
      sessionId: auto.id,
      messages: [{ role: "user", content: auto.prompt }],
    });
    for await (const chunk of stream) {
      if (chunk.type === "content") output += chunk.content;
    }

    await db
      .update(automationRuns)
      .set({ status: "success", output, completedAt: new Date() })
      .where(eq(automationRuns.id, runId));
    await db
      .update(automations)
      .set({ lastRunAt: new Date() })
      .where(eq(automations.id, automationId));
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    await db
      .update(automationRuns)
      .set({ status: "error", error, completedAt: new Date() })
      .where(eq(automationRuns.id, runId));
  }
}

const scheduledTasks = new Map<string, ReturnType<typeof cron.schedule>>();

async function refreshSchedules() {
  const active = await db
    .select({ id: automations.id, cronExpression: automations.cronExpression })
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
    if (!cron.validate(auto.cronExpression)) continue;
    const task = cron.schedule(auto.cronExpression, () => {
      void (async () => {
        const [run] = await db
          .insert(automationRuns)
          .values({ automationId: auto.id, status: "pending", startedAt: new Date() })
          .returning();
        await automationQueue.add("run", { automationId: auto.id, runId: run.id });
      })();
    });
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
    { connection }
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

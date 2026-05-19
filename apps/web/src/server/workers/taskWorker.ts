import { Worker } from "bullmq";
import { db } from "../db";
import { agentTaskComments, agentTasks } from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { AgentRuntime } from "@agenthub/agent-runtime";
import { createQueue, jobProgressPublisher, queueConnection, queuePrefix } from "../queues";
import { deadLetterQueue } from "../queues/dead-letter";

export const taskQueue = createQueue<{ taskId: string }>("agent-tasks");

async function runTask(taskId: string) {
  await db
    .update(agentTasks)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(eq(agentTasks.id, taskId));

  const [task] = await db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).limit(1);
  if (!task) throw new Error("Task not found");
  jobProgressPublisher.publish({
    userId: task.userId,
    queue: "agent-tasks",
    jobId: taskId,
    progress: 10,
    message: "Task execution started.",
  });

  try {
    await db.insert(agentTaskComments).values({
      taskId,
      userId: task.userId,
      agentId: task.agentId,
      authorType: "system",
      body: "Task moved to in progress.",
    });

    const model = "ollama:qwen2.5:7b";
    const runtime = new AgentRuntime({
      model,
      systemPrompt: task.agentId ? `You are executing task: ${task.title}` : "",
    });

    let output = "";
    const stream = runtime.run({
      sessionId: task.id,
      messages: [{ role: "user", content: task.prompt }],
    });
    for await (const chunk of stream) {
      if (chunk.type === "content") output += chunk.content;
    }

    await db
      .update(agentTasks)
      .set({ status: "success", output, completedAt: new Date(), updatedAt: new Date() })
      .where(eq(agentTasks.id, taskId));
    jobProgressPublisher.publish({
      userId: task.userId,
      queue: "agent-tasks",
      jobId: taskId,
      progress: 100,
      message: "Task completed.",
    });

    await db.insert(agentTaskComments).values({
      taskId,
      userId: task.userId,
      agentId: task.agentId,
      authorType: "agent",
      body: output || "Task completed.",
    });

    // Unblock dependents: find tasks whose dependsOn includes this taskId
    await resolveDownstream(taskId);
    await queueReadyChildren(taskId);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    const retryCount = (task.retryCount ?? 0) + 1;

    if (retryCount <= (task.maxRetries ?? 2)) {
      const backoff = Math.pow(2, retryCount) * 1000;
      await db
        .update(agentTasks)
        .set({ status: "pending", retryCount, error, updatedAt: new Date() })
        .where(eq(agentTasks.id, taskId));
      await taskQueue.add("run", { taskId }, { delay: backoff, priority: 3 - (task.priority ?? 0) });
      jobProgressPublisher.publish({
        userId: task.userId,
        queue: "agent-tasks",
        jobId: taskId,
        progress: { status: "retrying", retryCount, nextDelayMs: backoff },
        message: `Task failed; retry ${retryCount} queued.`,
      });
    } else {
      await db
        .update(agentTasks)
        .set({ status: "error", error, retryCount, completedAt: new Date(), updatedAt: new Date() })
        .where(eq(agentTasks.id, taskId));
      jobProgressPublisher.publish({
        userId: task.userId,
        queue: "agent-tasks",
        jobId: taskId,
        progress: { status: "error", retryCount },
        message: error,
      });
      await deadLetterQueue.record({
        queueName: "agent-tasks",
        jobId: taskId,
        threadId: taskId,
        failedNode: "agent_task",
        errorMessage: error,
        finalState: { taskId, status: "error" },
        failureCategory: "llm_error",
        retryCount,
      });
    }

    await db.insert(agentTaskComments).values({
      taskId,
      userId: task.userId,
      agentId: task.agentId,
      authorType: "system",
      body: `Task failed: ${error}`,
    });
  }
}

function normalizeDependsOn(dependsOn: unknown) {
  if (!dependsOn) return [] as string[];
  if (Array.isArray(dependsOn)) return dependsOn.filter((dep): dep is string => typeof dep === "string");
  if (typeof dependsOn !== "string") return [];
  try {
    const parsed = JSON.parse(dependsOn) as unknown;
    return Array.isArray(parsed) ? parsed.filter((dep): dep is string => typeof dep === "string") : [];
  } catch {
    return [];
  }
}

async function dependenciesSatisfied(dependsOn: unknown) {
  const deps = normalizeDependsOn(dependsOn);
  if (deps.length === 0) return true;

  const depRows = await db
    .select({ id: agentTasks.id, status: agentTasks.status })
    .from(agentTasks)
    .where(inArray(agentTasks.id, deps));

  return depRows.length === deps.length && depRows.every((r) => r.status === "success");
}

async function queueCandidate(candidate: { id: string; priority: number }) {
  await db.update(agentTasks).set({ status: "queued", updatedAt: new Date() }).where(eq(agentTasks.id, candidate.id));
  await taskQueue.add("run", { taskId: candidate.id }, { priority: 3 - (candidate.priority ?? 0) });
}

async function queueReadyChildren(parentTaskId: string) {
  const children = await db
    .select()
    .from(agentTasks)
    .where(and(eq(agentTasks.parentTaskId, parentTaskId), eq(agentTasks.status, "pending")));

  for (const child of children) {
    if (await dependenciesSatisfied(child.dependsOn)) {
      await queueCandidate(child);
    }
  }
}

async function resolveDownstream(completedTaskId: string) {
  // Load all pending/queued tasks that might depend on completedTaskId
  const candidates = await db
    .select()
    .from(agentTasks)
    .where(and(inArray(agentTasks.status, ["pending"])));

  for (const candidate of candidates) {
    const deps = normalizeDependsOn(candidate.dependsOn);
    if (!deps.includes(completedTaskId)) continue;

    // Check if ALL deps are now success
    const depRows = await db
      .select({ id: agentTasks.id, status: agentTasks.status })
      .from(agentTasks)
      .where(inArray(agentTasks.id, deps));

    const allDone = depRows.every((r) => r.status === "success");
    if (allDone) {
      await queueCandidate(candidate);
    }
  }
}

export function startTaskWorker() {
  const worker = new Worker(
    "agent-tasks",
    async (job) => {
      const { taskId } = job.data as { taskId: string };
      await runTask(taskId);
    },
    { connection: queueConnection, prefix: queuePrefix },
  );

  worker.on("error", (err) => {
    console.error("[task-worker] error:", err.message);
  });

  return worker;
}

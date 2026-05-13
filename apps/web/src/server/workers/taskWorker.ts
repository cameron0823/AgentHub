import { Queue, Worker } from "bullmq";
import { db } from "../db";
import { agentTasks } from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { AgentRuntime } from "@agenthub/agent-runtime";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379"),
};

export const taskQueue = new Queue("agent-tasks", { connection });

async function runTask(taskId: string) {
  await db
    .update(agentTasks)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(eq(agentTasks.id, taskId));

  const [task] = await db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).limit(1);
  if (!task) throw new Error("Task not found");

  try {
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

    // Unblock dependents: find tasks whose dependsOn includes this taskId
    await resolveDownstream(taskId);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    const retryCount = (task.retryCount ?? 0) + 1;

    if (retryCount <= (task.maxRetries ?? 2)) {
      const backoff = Math.pow(2, retryCount) * 1000;
      await db
        .update(agentTasks)
        .set({ status: "pending", retryCount, error, updatedAt: new Date() })
        .where(eq(agentTasks.id, taskId));
      await taskQueue.add(
        "run",
        { taskId },
        { delay: backoff, priority: 3 - (task.priority ?? 0) }
      );
    } else {
      await db
        .update(agentTasks)
        .set({ status: "error", error, retryCount, completedAt: new Date(), updatedAt: new Date() })
        .where(eq(agentTasks.id, taskId));
    }
  }
}

async function resolveDownstream(completedTaskId: string) {
  // Load all pending/queued tasks that might depend on completedTaskId
  const candidates = await db
    .select()
    .from(agentTasks)
    .where(
      and(
        inArray(agentTasks.status, ["pending"]),
      )
    );

  for (const candidate of candidates) {
    if (!candidate.dependsOn) continue;
    let deps: string[];
    try {
      deps = JSON.parse(candidate.dependsOn) as string[];
    } catch {
      continue;
    }
    if (!deps.includes(completedTaskId)) continue;

    // Check if ALL deps are now success
    const depRows = await db
      .select({ id: agentTasks.id, status: agentTasks.status })
      .from(agentTasks)
      .where(inArray(agentTasks.id, deps));

    const allDone = depRows.every((r) => r.status === "success");
    if (allDone) {
      await db
        .update(agentTasks)
        .set({ status: "queued", updatedAt: new Date() })
        .where(eq(agentTasks.id, candidate.id));
      await taskQueue.add(
        "run",
        { taskId: candidate.id },
        { priority: 3 - (candidate.priority ?? 0) }
      );
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
    { connection }
  );

  worker.on("error", (err) => {
    console.error("[task-worker] error:", err.message);
  });

  return worker;
}

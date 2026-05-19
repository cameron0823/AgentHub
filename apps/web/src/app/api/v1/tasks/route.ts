import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { agentTasks, agents } from "@/server/db/schema";
import { apiError, limitFromRequest, parseJsonBody, requireApiUser } from "@/server/public-api";

export const runtime = "nodejs";

const createTaskSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  agentId: z.string().uuid().optional().nullable(),
  dependsOn: z.array(z.string().uuid()).optional(),
  priority: z.number().int().min(-2).max(2).optional(),
  maxRetries: z.number().int().min(0).max(5).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

async function assertAgentOwned(userId: string, agentId: string) {
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .limit(1);
  return Boolean(agent);
}

async function dependenciesOwned(userId: string, dependsOn: string[]) {
  if (dependsOn.length === 0) return true;
  const rows = await db
    .select({ id: agentTasks.id })
    .from(agentTasks)
    .where(and(inArray(agentTasks.id, dependsOn), eq(agentTasks.userId, userId)));
  return rows.length === dependsOn.length;
}

async function queueTask(taskId: string, priority: number) {
  try {
    const { taskQueue } = await import("@/server/workers/taskWorker");
    await taskQueue.add("run", { taskId }, { priority: 3 - priority });
  } catch {
    // Redis may be offline in local/API-only deployments; the queued status is durable.
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const limit = limitFromRequest(req);

  const items = await db
    .select()
    .from(agentTasks)
    .where(eq(agentTasks.userId, userId))
    .orderBy(desc(agentTasks.createdAt))
    .limit(limit);

  return NextResponse.json({ data: items });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const parsed = await parseJsonBody(req, createTaskSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  const dependsOn = input.dependsOn ?? [];

  if (input.agentId && !(await assertAgentOwned(userId, input.agentId))) {
    return apiError("Agent not found", 404, "agent_not_found");
  }
  if (!(await dependenciesOwned(userId, dependsOn))) {
    return apiError("One or more dependency task IDs not found", 404, "dependency_not_found");
  }

  const shouldQueue = dependsOn.length === 0;
  const [task] = await db
    .insert(agentTasks)
    .values({
      userId,
      agentId: input.agentId ?? null,
      assignedByUserId: userId,
      title: input.title,
      prompt: input.prompt,
      dependsOn,
      priority: input.priority ?? 0,
      maxRetries: input.maxRetries ?? 2,
      metadata: input.metadata ?? {},
      status: shouldQueue ? "queued" : "pending",
    })
    .returning();

  if (shouldQueue) await queueTask(task.id, input.priority ?? 0);

  return NextResponse.json({ data: task }, { status: 201 });
}

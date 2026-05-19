import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { agents, chatSessions } from "@/server/db/schema";
import { apiError, limitFromRequest, parseJsonBody, requireApiUser } from "@/server/public-api";

export const runtime = "nodejs";

const createSessionSchema = z.object({
  agentId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).optional(),
  model: z.string().optional(),
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

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const limit = limitFromRequest(req);

  const items = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId))
    .orderBy(desc(chatSessions.updatedAt))
    .limit(limit);

  return NextResponse.json({ data: items });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const parsed = await parseJsonBody(req, createSessionSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  if (input.agentId && !(await assertAgentOwned(userId, input.agentId))) {
    return apiError("Agent not found", 404, "agent_not_found");
  }

  const [session] = await db
    .insert(chatSessions)
    .values({
      userId,
      agentId: input.agentId ?? null,
      title: input.title ?? "New Chat",
      model: input.model ?? "ollama:qwen2.5:7b",
      metadata: input.metadata ?? null,
    })
    .returning();

  return NextResponse.json({ data: session }, { status: 201 });
}

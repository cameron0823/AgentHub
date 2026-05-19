import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { agents } from "@/server/db/schema";
import { limitFromRequest, parseJsonBody, requireApiUser } from "@/server/public-api";

export const runtime = "nodejs";

const createAgentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  avatar: z.string().optional(),
  systemPrompt: z.string().min(1),
  model: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
  tools: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const limit = limitFromRequest(req);

  const items = await db
    .select()
    .from(agents)
    .where(eq(agents.userId, userId))
    .orderBy(desc(agents.updatedAt))
    .limit(limit);

  return NextResponse.json({ data: items });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const parsed = await parseJsonBody(req, createAgentSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const [agent] = await db
    .insert(agents)
    .values({
      userId,
      name: input.name,
      description: input.description ?? null,
      avatar: input.avatar ?? null,
      systemPrompt: input.systemPrompt,
      model: input.model ?? "ollama:qwen2.5:7b",
      temperature: input.temperature ?? 0.7,
      maxTokens: input.maxTokens ?? 4096,
      tools: JSON.stringify(input.tools ?? []),
      tags: JSON.stringify(input.tags ?? []),
    })
    .returning();

  return NextResponse.json({ data: agent }, { status: 201 });
}

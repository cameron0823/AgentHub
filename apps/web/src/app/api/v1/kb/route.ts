import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { knowledgeBases } from "@/server/db/schema";
import { limitFromRequest, parseJsonBody, requireApiUser } from "@/server/public-api";

export const runtime = "nodejs";

const createKnowledgeBaseSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  embeddingModel: z.string().optional(),
  chunkSize: z.number().int().positive().optional(),
  chunkOverlap: z.number().int().min(0).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const limit = limitFromRequest(req);

  const items = await db
    .select()
    .from(knowledgeBases)
    .where(eq(knowledgeBases.userId, userId))
    .orderBy(desc(knowledgeBases.updatedAt))
    .limit(limit);

  return NextResponse.json({ data: items });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const parsed = await parseJsonBody(req, createKnowledgeBaseSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const [kb] = await db
    .insert(knowledgeBases)
    .values({
      userId,
      name: input.name,
      description: input.description ?? null,
      embeddingModel: input.embeddingModel ?? "nomic-embed-text",
      chunkSize: input.chunkSize ?? 1000,
      chunkOverlap: input.chunkOverlap ?? 200,
    })
    .returning();

  return NextResponse.json({ data: kb }, { status: 201 });
}

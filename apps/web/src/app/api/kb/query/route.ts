import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { documentChunks } from "@/server/db/schema";
import { sql } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { query, knowledgeBaseId, limit = 5 } = await req.json();
  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  const embedRes = await fetch(`${ollamaUrl}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text", prompt: query }),
  });
  const embedData = await embedRes.json();
  const queryVector = embedData.embedding;

  if (!queryVector) {
    return NextResponse.json({ error: "Failed to generate embedding" }, { status: 500 });
  }

  const results = await db
    .select({
      id: documentChunks.id,
      content: documentChunks.content,
      metadata: documentChunks.metadata,
      similarity: sql<number>`1 - (${documentChunks.embedding} <=> ${JSON.stringify(queryVector)}::vector)`,
    })
    .from(documentChunks)
    .where(
      knowledgeBaseId
        ? sql`${documentChunks.metadata}->>'knowledgeBaseId' = ${knowledgeBaseId}`
        : sql`true`
    )
    .orderBy(sql`${documentChunks.embedding} <=> ${JSON.stringify(queryVector)}::vector`)
    .limit(limit);

  return NextResponse.json({ results });
}

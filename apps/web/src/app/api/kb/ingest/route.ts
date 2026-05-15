import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { documents, documentChunks, knowledgeBases } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/server/auth";

export const runtime = "nodejs";

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
    if (start >= text.length) break;
  }
  return chunks;
}

async function generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  const embeddings: number[][] = [];

  for (const text of texts) {
    const res = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
    });

    if (!res.ok) {
      throw new Error(`Embedding failed: ${await res.text()}`);
    }

    const data = (await res.json()) as { embedding?: number[] };
    if (!data.embedding) {
      throw new Error("No embedding returned from Ollama");
    }
    embeddings.push(data.embedding);
  }

  return embeddings;
}

export async function POST(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { documentId } = await req.json();
  if (!documentId) {
    return new Response(JSON.stringify({ error: "documentId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [doc] = await db.select().from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, session.user.id)))
    .limit(1);

  if (!doc) {
    return new Response(JSON.stringify({ error: "Document not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get knowledge base config
  const kbConfig = doc.knowledgeBaseId
    ? await db.select().from(knowledgeBases)
        .where(and(eq(knowledgeBases.id, doc.knowledgeBaseId), eq(knowledgeBases.userId, session.user.id)))
        .limit(1)
    : [];

  const kb = kbConfig[0];
  const chunkSize = kb?.chunkSize || 1000;
  const chunkOverlap = kb?.chunkOverlap || 200;
  const embeddingModel = kb?.embeddingModel || "nomic-embed-text";

  // Update status to processing
  await db.update(documents).set({ status: "processing" }).where(eq(documents.id, documentId));

  try {
    // Get document content
    let content = doc.content;
    if (!content && doc.s3Url) {
      const res = await fetch(doc.s3Url);
      if (res.ok) {
        content = await res.text();
      }
    }

    if (!content) {
      throw new Error("Document content is empty");
    }

    // Clean content
    content = content.replace(/\s+/g, " ").trim();

    // Chunk content
    const chunks = chunkText(content, chunkSize, chunkOverlap);

    // Generate embeddings
    const embeddings = await generateEmbeddings(chunks, embeddingModel);

    // Store chunks
    for (let i = 0; i < chunks.length; i++) {
      await db.insert(documentChunks).values({
        documentId,
        content: chunks[i],
        embedding: embeddings[i],
        metadata: { index: i, knowledgeBaseId: doc.knowledgeBaseId },
      });
    }

    // Update document status
    await db.update(documents).set({
      status: "indexed",
      content,
    }).where(eq(documents.id, documentId));

    return new Response(JSON.stringify({
      success: true,
      chunks: chunks.length,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.update(documents).set({
      status: "error",
      errorMessage: error,
    }).where(eq(documents.id, documentId));

    return new Response(JSON.stringify({ error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

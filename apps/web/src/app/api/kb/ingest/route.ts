import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { documents, documentChunks, knowledgeBases } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/server/auth";
import { fetchWithOutboundGuard, validateProviderBaseUrl } from "@/server/security/outbound";
import { chunkParsedDocument, parseKnowledgeDocument } from "@/server/kb-ingestion";
import { indexVectorChunks, resolveVectorBackendConfig, type VectorChunkRecord } from "@/server/vector-backends";

export const runtime = "nodejs";

async function generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
  const ollamaUrl = validateProviderBaseUrl(process.env.OLLAMA_URL, "http://localhost:11434");
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
    if (
      !Array.isArray(data.embedding) ||
      !data.embedding.every((value) => typeof value === "number" && isFinite(value))
    ) {
      throw new Error("Invalid embedding returned from Ollama: non-numeric or non-finite values");
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

  const [doc] = await db
    .select()
    .from(documents)
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
    ? await db
        .select()
        .from(knowledgeBases)
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
    let data: Buffer | undefined;
    if (!content && doc.s3Url) {
      const res = await fetchWithOutboundGuard(doc.s3Url, undefined, {
        allowedOrigins: [process.env.S3_ENDPOINT].filter((value): value is string => Boolean(value)),
        purpose: "Knowledge base document",
      });
      if (res.ok) {
        data = Buffer.from(await res.arrayBuffer());
      }
    }

    if (!content && !data) {
      throw new Error("Document content is empty");
    }

    const parsed = await parseKnowledgeDocument({
      name: doc.name,
      mimeType: doc.mimeType,
      content,
      data,
    });

    // Chunk content
    const chunks = chunkParsedDocument(parsed, doc.name, chunkSize, chunkOverlap);
    if (chunks.length === 0) throw new Error("Document produced no indexable chunks");

    // Generate embeddings
    const embeddings = await generateEmbeddings(
      chunks.map((chunk) => chunk.content),
      embeddingModel,
    );

    // Store chunks
    const vectorChunks: VectorChunkRecord[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const metadata = {
        ...chunks[i].metadata,
        index: i,
        knowledgeBaseId: doc.knowledgeBaseId,
        sourceName: doc.name,
        sourceType: parsed.kind,
        mimeType: doc.mimeType,
        sourceUrl: doc.s3Url,
        citation: chunks[i].citation,
      };
      const [storedChunk] = await db
        .insert(documentChunks)
        .values({
          documentId,
          content: chunks[i].content,
          embedding: embeddings[i],
          metadata,
        })
        .returning();
      vectorChunks.push({
        id: storedChunk.id,
        documentId,
        content: chunks[i].content,
        embedding: embeddings[i],
        metadata,
      });
    }
    await indexVectorChunks(resolveVectorBackendConfig(), vectorChunks);

    // Update document status
    await db
      .update(documents)
      .set({
        status: "indexed",
        content: parsed.text,
        metadata: {
          ...((doc.metadata as Record<string, unknown> | null) ?? {}),
          sourceType: parsed.kind,
          chunks: chunks.length,
        },
      })
      .where(eq(documents.id, documentId));

    return new Response(
      JSON.stringify({
        success: true,
        chunks: chunks.length,
        sourceType: parsed.kind,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db
      .update(documents)
      .set({
        status: "error",
        errorMessage: error,
      })
      .where(eq(documents.id, documentId));

    return new Response(JSON.stringify({ error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

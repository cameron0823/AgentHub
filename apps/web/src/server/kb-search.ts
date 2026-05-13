import { db } from "./db";
import { documentChunks, documents } from "./db/schema";
import { sql, eq, and } from "drizzle-orm";

const RRF_K = 60;

export interface KbSearchResult {
  id: string;
  documentId: string;
  content: string;
  similarity: number;
}

function validateOllamaUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return "http://localhost:11434";
    return raw;
  } catch {
    return "http://localhost:11434";
  }
}

async function embedQuery(query: string, ollamaUrl: string, model: string): Promise<number[]> {
  const safeUrl = validateOllamaUrl(ollamaUrl);
  const res = await fetch(`${safeUrl}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: query }),
  });
  if (!res.ok) throw new Error(`Embedding request failed: ${res.status}`);
  const data = await res.json();
  const rawEmb: unknown = data.embedding;
  if (!Array.isArray(rawEmb) || !rawEmb.every((v) => typeof v === "number" && isFinite(v))) {
    throw new Error("Invalid embedding response from Ollama: non-numeric or non-finite values");
  }
  return rawEmb as number[];
}

async function rerankWithOllama(
  query: string,
  candidates: KbSearchResult[],
  ollamaUrl: string,
  model: string
): Promise<KbSearchResult[]> {
  const scored = await Promise.all(
    candidates.map(async (c) => {
      try {
        const prompt = `Rate the relevance of the following passage to the query on a scale from 0 to 10. Respond with ONLY a single integer.

Query: ${query}

Passage: ${c.content.slice(0, 500)}

Relevance (0-10):`;
        const res = await fetch(`${ollamaUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt, stream: false }),
        });
        if (!res.ok) return { ...c, rerankScore: 0 };
        const data = await res.json();
        const match = String(data.response ?? "").match(/\d+/);
        const score = match ? Math.min(10, Math.max(0, parseInt(match[0], 10))) : 0;
        return { ...c, rerankScore: score };
      } catch {
        return { ...c, rerankScore: 0 };
      }
    })
  );
  scored.sort((a, b) => b.rerankScore - a.rerankScore);
  return scored.map(({ rerankScore: _, ...r }) => r);
}

export async function hybridKbSearch(opts: {
  query: string;
  knowledgeBaseId?: string;
  limit?: number;
  embeddingModel?: string;
  ollamaUrl?: string;
  rerank?: boolean;
}): Promise<KbSearchResult[]> {
  const {
    query,
    knowledgeBaseId,
    limit = 5,
    embeddingModel = "nomic-embed-text",
    ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434",
    rerank = !!process.env.RERANK_MODEL,
  } = opts;

  const queryVector = await embedQuery(query, ollamaUrl, embeddingModel);
  const searchLimit = limit * 3;
  const kbFilter = knowledgeBaseId
    ? sql`dc.metadata->>'knowledgeBaseId' = ${knowledgeBaseId} OR d.knowledge_base_id = ${knowledgeBaseId}::uuid`
    : sql`true`;

  const rows = await db.execute<{
    id: string;
    document_id: string;
    content: string;
    similarity: number;
  }>(sql`
    WITH
      vector_search AS (
        SELECT
          dc.id, dc.document_id, dc.content,
          1 - (dc.embedding <=> ${JSON.stringify(queryVector)}::vector) AS score,
          ROW_NUMBER() OVER (
            ORDER BY dc.embedding <=> ${JSON.stringify(queryVector)}::vector
          ) AS rank
        FROM document_chunks dc
        INNER JOIN documents d ON d.id = dc.document_id
        WHERE ${knowledgeBaseId ? sql`d.knowledge_base_id = ${knowledgeBaseId}::uuid AND d.status = 'indexed'` : sql`d.status = 'indexed'`}
        ORDER BY dc.embedding <=> ${JSON.stringify(queryVector)}::vector
        LIMIT ${searchLimit}
      ),
      fts_search AS (
        SELECT
          dc.id, dc.document_id, dc.content,
          ts_rank(dc.content_tsv, websearch_to_tsquery('english', ${query})) AS score,
          ROW_NUMBER() OVER (
            ORDER BY ts_rank(dc.content_tsv, websearch_to_tsquery('english', ${query})) DESC
          ) AS rank
        FROM document_chunks dc
        INNER JOIN documents d ON d.id = dc.document_id
        WHERE dc.content_tsv @@ websearch_to_tsquery('english', ${query})
          AND ${knowledgeBaseId ? sql`d.knowledge_base_id = ${knowledgeBaseId}::uuid AND d.status = 'indexed'` : sql`d.status = 'indexed'`}
        LIMIT ${searchLimit}
      ),
      rrf AS (
        SELECT
          COALESCE(v.id, f.id) AS id,
          COALESCE(v.document_id, f.document_id) AS document_id,
          COALESCE(v.content, f.content) AS content,
          COALESCE(1.0 / (${RRF_K} + v.rank), 0) +
            COALESCE(1.0 / (${RRF_K} + f.rank), 0) AS similarity
        FROM vector_search v
        FULL OUTER JOIN fts_search f ON v.id = f.id
      )
    SELECT id, document_id, content, similarity
    FROM rrf
    ORDER BY similarity DESC
    LIMIT ${rerank ? searchLimit : limit}
  `);

  const results: KbSearchResult[] = rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    content: r.content,
    similarity: Number(r.similarity),
  }));

  if (!rerank || results.length === 0) return results.slice(0, limit);

  const rerankModel = process.env.RERANK_MODEL || embeddingModel;
  const reranked = await rerankWithOllama(query, results, ollamaUrl, rerankModel);
  return reranked.slice(0, limit);
}

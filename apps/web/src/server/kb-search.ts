import { db } from "./db";
import { sql } from "drizzle-orm";
import { validateProviderBaseUrl } from "./security/outbound";
import { createChunkCitation } from "./kb-ingestion";
import { resolveVectorBackendConfig, searchVectorBackend } from "./vector-backends";
import {
  buildBm25FallbackScore,
  buildKeywordPredicate,
  computeRerankMetrics,
  tokenizeSearchQuery,
  type RerankMetrics,
} from "./kb-relevance";

const RRF_K = 60;

export interface KbSearchResult {
  id: string;
  documentId: string;
  content: string;
  similarity: number;
  sourceName?: string;
  sourceType?: string;
  mimeType?: string;
  sourceUrl?: string;
  citation?: string;
  metadata?: Record<string, unknown>;
  retrieval?: {
    vectorScore?: number;
    textScore?: number;
    bm25Score?: number;
    rrfScore?: number;
    rerankScore?: number;
    metrics?: RerankMetrics;
  };
}

async function embedQuery(query: string, ollamaUrl: string, model: string): Promise<number[]> {
  const safeUrl = validateProviderBaseUrl(ollamaUrl, "http://localhost:11434");
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
  model: string,
): Promise<KbSearchResult[]> {
  const safeUrl = validateProviderBaseUrl(ollamaUrl, "http://localhost:11434");
  const scored = await Promise.all(
    candidates.map(async (c) => {
      try {
        const prompt = `Rate the relevance of the following passage to the query on a scale from 0 to 10. Respond with ONLY a single integer.

Query: ${query}

Passage: ${c.content.slice(0, 500)}

Relevance (0-10):`;
        const res = await fetch(`${safeUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt, stream: false }),
        });
        if (!res.ok) return { ...c, retrieval: { ...c.retrieval, rerankScore: 0 } };
        const data = await res.json();
        const match = String(data.response ?? "").match(/\d+/);
        const score = match ? Math.min(10, Math.max(0, parseInt(match[0], 10))) : 0;
        return { ...c, retrieval: { ...c.retrieval, rerankScore: score } };
      } catch {
        return { ...c, retrieval: { ...c.retrieval, rerankScore: 0 } };
      }
    }),
  );
  scored.sort((a, b) => (b.retrieval?.rerankScore ?? 0) - (a.retrieval?.rerankScore ?? 0));
  return scored;
}

function attachMetrics(results: KbSearchResult[], metrics: RerankMetrics): KbSearchResult[] {
  // Metrics surface exactKeywordHits, semanticHits, candidateCount, and rerankScore coverage to callers.
  return results.map((result) => ({
    ...result,
    retrieval: { ...result.retrieval, metrics },
  }));
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

  const startedAt = Date.now();
  const tokenizedQuery = tokenizeSearchQuery(query);
  const queryVector = await embedQuery(query, ollamaUrl, embeddingModel);
  const searchLimit = limit * 3;
  const vectorBackendConfig = resolveVectorBackendConfig();
  const backendResults = await searchVectorBackend(vectorBackendConfig, {
    queryVector,
    knowledgeBaseId,
    limit: searchLimit,
  });
  if (backendResults.length > 0) {
    const citedResults: KbSearchResult[] = backendResults.map((result) => ({
      ...result,
      citation: result.citation ?? createChunkCitation(result.sourceName ?? result.documentId, result.metadata ?? {}),
      sourceType:
        result.sourceType ?? (typeof result.metadata?.sourceType === "string" ? result.metadata.sourceType : undefined),
      retrieval: {
        vectorScore: result.similarity,
        rrfScore: result.similarity,
      },
    }));
    if (!rerank) {
      const returned = citedResults.slice(0, limit);
      return attachMetrics(returned, computeRerankMetrics(citedResults, returned, startedAt, "external-vector"));
    }
    const reranked = await rerankWithOllama(query, citedResults, ollamaUrl, process.env.RERANK_MODEL || embeddingModel);
    const returned = reranked.slice(0, limit);
    return attachMetrics(returned, computeRerankMetrics(citedResults, returned, startedAt, "external-vector-rerank"));
  }

  const keywordPredicate = buildKeywordPredicate(sql`dc.content`, tokenizedQuery.tokens);
  const pgTrgmTieBreaker = sql`similarity(dc.content, ${query})`;
  const bm25Score = sql`${buildBm25FallbackScore(sql`dc.content`, tokenizedQuery.tokens, tokenizedQuery.normalizedQuery)} + (${pgTrgmTieBreaker} * 0.05)`;

  const rows = await db.execute<{
    id: string;
    document_id: string;
    content: string;
    similarity: number;
    vector_score: number | null;
    text_score: number | null;
    bm25_score: number | null;
    rrf_score: number;
    source_name: string;
    mime_type: string | null;
    source_url: string | null;
    metadata: Record<string, unknown> | null;
  }>(sql`
    WITH
      vector_search AS (
        SELECT
          dc.id, dc.document_id, dc.content, d.name AS source_name, d.mime_type AS mime_type, d.s3_url AS source_url, dc.metadata,
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
          dc.id, dc.document_id, dc.content, d.name AS source_name, d.mime_type AS mime_type, d.s3_url AS source_url, dc.metadata,
          ts_rank_cd(dc.content_tsv, websearch_to_tsquery('english', ${tokenizedQuery.normalizedQuery}), 32) AS score,
          ROW_NUMBER() OVER (
            ORDER BY ts_rank_cd(dc.content_tsv, websearch_to_tsquery('english', ${tokenizedQuery.normalizedQuery}), 32) DESC
          ) AS rank
        FROM document_chunks dc
        INNER JOIN documents d ON d.id = dc.document_id
        WHERE dc.content_tsv @@ websearch_to_tsquery('english', ${tokenizedQuery.normalizedQuery})
          AND ${knowledgeBaseId ? sql`d.knowledge_base_id = ${knowledgeBaseId}::uuid AND d.status = 'indexed'` : sql`d.status = 'indexed'`}
        LIMIT ${searchLimit}
      ),
      bm25_search AS (
        SELECT
          dc.id, dc.document_id, dc.content, d.name AS source_name, d.mime_type AS mime_type, d.s3_url AS source_url, dc.metadata,
          ${bm25Score} AS score,
          ROW_NUMBER() OVER (
            ORDER BY ${bm25Score} DESC
          ) AS rank
        FROM document_chunks dc
        INNER JOIN documents d ON d.id = dc.document_id
        WHERE ${keywordPredicate}
          AND ${knowledgeBaseId ? sql`d.knowledge_base_id = ${knowledgeBaseId}::uuid AND d.status = 'indexed'` : sql`d.status = 'indexed'`}
        LIMIT ${searchLimit}
      ),
      rrf_source AS (
        SELECT id, document_id, content, source_name, mime_type, source_url, metadata,
          score AS vector_score,
          NULL::float AS text_score,
          NULL::float AS bm25_score,
          1.0 / (${RRF_K} + rank) AS rrf_score
        FROM vector_search
        UNION ALL
        SELECT id, document_id, content, source_name, mime_type, source_url, metadata,
          NULL::float AS vector_score,
          score AS text_score,
          NULL::float AS bm25_score,
          1.0 / (${RRF_K} + rank) AS rrf_score
        FROM fts_search
        UNION ALL
        SELECT id, document_id, content, source_name, mime_type, source_url, metadata,
          NULL::float AS vector_score,
          NULL::float AS text_score,
          score AS bm25_score,
          1.0 / (${RRF_K} + rank) AS rrf_score
        FROM bm25_search
      ),
      rrf AS (
        SELECT
          id,
          document_id,
          content,
          source_name,
          mime_type,
          source_url,
          metadata,
          MAX(vector_score) AS vector_score,
          MAX(text_score) AS text_score,
          MAX(bm25_score) AS bm25_score,
          SUM(rrf_score) AS rrf_score,
          SUM(rrf_score) AS similarity
        FROM rrf_source
        GROUP BY id, document_id, content, source_name, mime_type, source_url, metadata
      )
    SELECT id, document_id, content, source_name, mime_type, source_url, metadata, vector_score, text_score, bm25_score, rrf_score, similarity
    FROM rrf
    ORDER BY similarity DESC
    LIMIT ${rerank ? searchLimit : limit}
  `);

  const results: KbSearchResult[] = rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    content: r.content,
    similarity: Number(r.similarity),
    sourceName: r.source_name,
    sourceType: typeof r.metadata?.sourceType === "string" ? r.metadata.sourceType : undefined,
    mimeType: r.mime_type ?? undefined,
    sourceUrl: r.source_url ?? undefined,
    metadata: r.metadata ?? undefined,
    citation: createChunkCitation(r.source_name, r.metadata ?? {}),
    retrieval: {
      vectorScore: r.vector_score ?? undefined,
      textScore: r.text_score ?? undefined,
      bm25Score: r.bm25_score ?? undefined,
      rrfScore: r.rrf_score,
    },
  }));

  if (!rerank || results.length === 0) {
    const returned = results.slice(0, limit);
    return attachMetrics(returned, computeRerankMetrics(results, returned, startedAt, "hybrid-rrf"));
  }

  const rerankModel = process.env.RERANK_MODEL || embeddingModel;
  const reranked = await rerankWithOllama(query, results, ollamaUrl, rerankModel);
  const returned = reranked.slice(0, limit);
  return attachMetrics(returned, computeRerankMetrics(results, returned, startedAt, "hybrid-rrf-rerank"));
}

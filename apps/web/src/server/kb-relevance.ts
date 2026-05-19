import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

export const ICU_TOKENIZER_LOCALES = ["en", "und"] as const;

export interface TokenizedSearchQuery {
  tokens: string[];
  normalizedQuery: string;
  tokenizer: "intl-segmenter" | "regex";
  locale: string;
}

export interface SearchSignalCarrier {
  retrieval?: {
    vectorScore?: number;
    textScore?: number;
    bm25Score?: number;
    rrfScore?: number;
    rerankScore?: number;
  };
}

export interface RerankMetrics {
  candidateCount: number;
  returnedCount: number;
  exactKeywordHits: number;
  semanticHits: number;
  rerankedHits: number;
  elapsedMs: number;
  strategy: "hybrid-rrf" | "hybrid-rrf-rerank" | "external-vector" | "external-vector-rerank";
}

const MAX_QUERY_TOKENS = 12;

function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "");
}

export function tokenizeSearchQuery(query: string, locale = "en"): TokenizedSearchQuery {
  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  const segmenterCtor = Intl.Segmenter as unknown as
    | undefined
    | (new (
        locale: string,
        options: { granularity: "word" },
      ) => {
        segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }>;
      });

  if (segmenterCtor) {
    const segmenter = new segmenterCtor(ICU_TOKENIZER_LOCALES.includes(locale as "en" | "und") ? locale : "und", {
      granularity: "word",
    });
    const tokens = [...segmenter.segment(normalizedQuery)]
      .filter((part) => part.isWordLike !== false)
      .map((part) => normalizeToken(part.segment))
      .filter(Boolean)
      .slice(0, MAX_QUERY_TOKENS);
    return { tokens: [...new Set(tokens)], normalizedQuery, tokenizer: "intl-segmenter", locale };
  }

  const tokens = normalizedQuery
    .split(/[^\p{L}\p{N}_-]+/u)
    .map(normalizeToken)
    .filter(Boolean)
    .slice(0, MAX_QUERY_TOKENS);
  return { tokens: [...new Set(tokens)], normalizedQuery, tokenizer: "regex", locale };
}

export function buildKeywordPredicate(column: SQL, tokens: string[]) {
  const clauses = tokens.map((token) => sql`lower(${column}) LIKE ${`%${token}%`}`);
  if (clauses.length === 0) return sql`true`;
  return sql`(${sql.join(clauses, sql` OR `)})`;
}

export function buildBm25FallbackScore(column: SQL, tokens: string[], exactPhrase: string) {
  const tokenClauses = tokens.map(
    (token) => sql`CASE WHEN lower(${column}) LIKE ${`%${token}%`} THEN 1.0 ELSE 0.0 END`,
  );
  const tokenCoverage =
    tokenClauses.length > 0 ? sql`((${sql.join(tokenClauses, sql` + `)}) / ${tokenClauses.length})` : sql`0.0`;

  // pg_trgm similarity approximates BM25-style lexical closeness when pg_search is unavailable.
  return sql`(
    CASE WHEN lower(${column}) LIKE ${`%${exactPhrase.toLowerCase()}%`} THEN 2.0 ELSE 0.0 END
    + ${tokenCoverage}
    + (similarity(${column}, ${exactPhrase}) * 0.35)
  )`;
}

export function computeRerankMetrics(
  candidates: SearchSignalCarrier[],
  returned: SearchSignalCarrier[],
  startedAt: number,
  strategy: RerankMetrics["strategy"],
): RerankMetrics {
  return {
    candidateCount: candidates.length,
    returnedCount: returned.length,
    exactKeywordHits: candidates.filter((item) => (item.retrieval?.bm25Score ?? item.retrieval?.textScore ?? 0) > 0)
      .length,
    semanticHits: candidates.filter((item) => (item.retrieval?.vectorScore ?? 0) > 0).length,
    rerankedHits: returned.filter((item) => item.retrieval?.rerankScore !== undefined).length,
    elapsedMs: Math.max(0, Date.now() - startedAt),
    strategy,
  };
}

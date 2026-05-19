import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("KB relevance helper exposes tokenizer, BM25-style fallback, and rerank metrics", async () => {
  const src = await readText("apps/web/src/server/kb-relevance.ts");

  assert.match(src, /ICU_TOKENIZER_LOCALES/);
  assert.match(src, /Intl\.Segmenter/);
  for (const exportName of [
    "tokenizeSearchQuery",
    "buildKeywordPredicate",
    "buildBm25FallbackScore",
    "computeRerankMetrics",
  ]) {
    assert.match(src, new RegExp(`export function ${exportName}`));
  }
  assert.match(src, /pg_trgm|similarity/);
  assert.match(src, /exactKeywordHits/);
  assert.match(src, /semanticHits/);
  assert.match(src, /rerankedHits/);
});

test("hybrid KB search fuses semantic, full-text, and BM25-style exact keyword paths", async () => {
  const src = await readText("apps/web/src/server/kb-search.ts");

  assert.match(src, /tokenizeSearchQuery/);
  assert.match(src, /buildBm25FallbackScore/);
  assert.match(src, /buildKeywordPredicate/);
  assert.match(src, /bm25_search/);
  assert.match(src, /ts_rank_cd/);
  assert.match(src, /similarity\(dc\.content/);
  assert.match(src, /UNION ALL/);
  assert.match(src, /vector_score/);
  assert.match(src, /text_score/);
  assert.match(src, /bm25_score/);
  assert.match(src, /rrf_score/);
});

test("hybrid KB search returns retrieval metrics for exact keyword and semantic coverage", async () => {
  const src = await readText("apps/web/src/server/kb-search.ts");

  assert.match(src, /computeRerankMetrics/);
  assert.match(src, /retrieval:/);
  assert.match(src, /exactKeywordHits/);
  assert.match(src, /semanticHits/);
  assert.match(src, /candidateCount/);
  assert.match(src, /rerankScore/);
});

test("database migrations enable Postgres fallback indexes for lexical search", async () => {
  const migration = await readText("apps/web/drizzle/0002_hybrid_search.sql");

  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_trgm/);
  assert.match(migration, /content_tsv tsvector/);
  assert.match(migration, /doc_chunks_tsv_idx/);
  assert.match(migration, /doc_chunks_trgm_idx/);
});

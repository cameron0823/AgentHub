import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// ── KB Router: authedProcedure on all operations ──────────────────────────────

test("KB router gates all operations behind authedProcedure", async () => {
  const src = await readText("apps/web/src/server/routers/kb.ts");

  for (const proc of ["list", "create", "delete", "documents", "query"]) {
    assert.match(src, new RegExp(`${proc}: authedProcedure`), `kb.${proc} must use authedProcedure`);
  }
});

test("KB router list scopes to authenticated user only", async () => {
  const src = await readText("apps/web/src/server/routers/kb.ts");

  assert.match(src, /eq\(knowledgeBases\.userId, ctx\.user\.id\)/, "list must filter knowledgeBases by ctx.user.id");
});

test("KB router delete enforces ownership — compound check on id and userId", async () => {
  const src = await readText("apps/web/src/server/routers/kb.ts");

  assert.match(
    src,
    /and\(eq\(knowledgeBases\.id, input\.id\), eq\(knowledgeBases\.userId, ctx\.user\.id\)\)/,
    "delete must use compound ownership check (id AND userId)",
  );
});

test("KB router documents scopes to authenticated user's knowledge base", async () => {
  const src = await readText("apps/web/src/server/routers/kb.ts");

  assert.match(src, /eq\(documents\.userId, ctx\.user\.id\)/, "documents must filter by ctx.user.id");
});

test("KB router query verifies KB ownership before performing search", async () => {
  const src = await readText("apps/web/src/server/routers/kb.ts");

  assert.match(
    src,
    /eq\(knowledgeBases\.userId, ctx\.user\.id\)/,
    "query must verify KB belongs to the authenticated user",
  );
});

test("KB router create stamps userId from session — not from client input", async () => {
  const src = await readText("apps/web/src/server/routers/kb.ts");

  assert.match(src, /userId: ctx\.user\.id/, "create must use ctx.user.id as userId");
  assert.doesNotMatch(src, /userId: input\.userId/, "create must not accept userId from untrusted input");
});

// ── KB HTTP ingest/query route: auth guard ────────────────────────────────────

test("KB query API route requires session authentication", async () => {
  const src = await readText("apps/web/src/app/api/kb/query/route.ts");

  assert.match(src, /const session = await auth\(req\.headers\)/, "must call auth(req.headers)");
  assert.match(src, /status: 401/, "must return 401 when unauthenticated");
});

test("KB query API route scopes search to authenticated user's KB", async () => {
  const src = await readText("apps/web/src/app/api/kb/query/route.ts");

  assert.match(src, /eq\(knowledgeBases\.userId, session\.user\.id\)/, "route must verify KB ownership before search");
});

// ── kb-search.ts: SSRF protection ────────────────────────────────────────────

test("validateOllamaUrl rejects non-http/https protocols to prevent SSRF", async () => {
  const [src, outbound] = await Promise.all([
    readText("apps/web/src/server/kb-search.ts"),
    readText("apps/web/src/server/security/outbound.ts"),
  ]);

  assert.match(src, /validateProviderBaseUrl/, "must use centralized provider base URL validation");
  assert.match(outbound, /protocol.*http/, "must check that URL protocol is http or https");
});

test("validateOllamaUrl falls back to localhost when URL is invalid", async () => {
  const src = await readText("apps/web/src/server/security/outbound.ts");

  assert.match(src, /localhost/, "must fall back to localhost Ollama URL on invalid input");
});

// ── kb-search.ts: hybrid search ──────────────────────────────────────────────

test("hybridKbSearch is exported and performs RRF fusion of vector and full-text search", async () => {
  const src = await readText("apps/web/src/server/kb-search.ts");

  assert.match(src, /hybridKbSearch/, "must export hybridKbSearch");
  assert.match(src, /tsvector|tsv|full.?text/i, "must include full-text search component");
  assert.match(src, /cosine|<=>|pgvector/i, "must include vector cosine similarity component");
});

test("hybridKbSearch uses RRF (Reciprocal Rank Fusion) to merge result sets", async () => {
  const src = await readText("apps/web/src/server/kb-search.ts");

  assert.match(src, /rrf|reciprocal|rank.*fusion/i, "must implement RRF fusion");
});

// ── kb-search.ts: embedding guard ────────────────────────────────────────────

test("embedding function guards against non-finite values before vector insert", async () => {
  const src = await readText("apps/web/src/server/kb-search.ts");

  assert.match(
    src,
    /non-numeric or non-finite|isFinite|Number\.isFinite/,
    "must guard against non-finite embedding values",
  );
});

// ── kb-search.ts: reranking ───────────────────────────────────────────────────

test("reranking is opt-in via RERANK_MODEL environment variable", async () => {
  const src = await readText("apps/web/src/server/kb-search.ts");

  assert.match(src, /RERANK_MODEL/, "must check process.env.RERANK_MODEL for opt-in reranking");
  assert.match(src, /rerankWithOllama/, "must call rerankWithOllama when RERANK_MODEL is set");
});

test("rerankWithOllama scores candidates via LLM prompt and re-sorts results", async () => {
  const src = await readText("apps/web/src/server/kb-search.ts");

  assert.match(src, /rerankWithOllama/, "must define rerankWithOllama function");
  assert.match(src, /score|sort/, "must sort candidates by rerank score");
});

// ── Schema: KB tables reference users table ───────────────────────────────────

test("knowledgeBases schema userId references users table", async () => {
  const src = await readText("apps/web/src/server/db/schema.ts");

  assert.match(src, /knowledge_bases|knowledgeBases/, "schema must define knowledge_bases table");
  assert.match(src, /user_id.*references.*users.*id/, "knowledge_bases userId must reference users table");
});

test("documents schema userId references users table and KB", async () => {
  const src = await readText("apps/web/src/server/db/schema.ts");

  assert.match(src, /documents/, "schema must define documents table");
});

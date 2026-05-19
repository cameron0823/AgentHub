import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("session title generation uses the selected model with bounded fallback cleanup", async () => {
  const [titleHelper, sessionsRouter, chatInterface] = await Promise.all([
    readText("apps/web/src/server/session-title.ts"),
    readText("apps/web/src/server/routers/sessions.ts"),
    readText("apps/web/src/components/ChatInterface.tsx"),
  ]);

  assert.match(titleHelper, /generateLlmSessionTitle/);
  assert.match(titleHelper, /provider\.chat/);
  assert.match(titleHelper, /TITLE_GENERATION_TIMEOUT_MS/);
  assert.match(titleHelper, /fallbackSessionTitleFromMessages/);
  assert.match(titleHelper, /cleanGeneratedSessionTitle/);
  assert.match(sessionsRouter, /generateTitle: authedProcedure/);
  assert.match(sessionsRouter, /registryForTitleGeneration/);
  assert.match(sessionsRouter, /generateLlmSessionTitle/);
  assert.match(sessionsRouter, /isDefaultSessionTitle/);
  assert.match(chatInterface, /trpc\.sessions\.generateTitle\.useMutation/);
  assert.match(chatInterface, /generateServerTitle\.mutate\(\{ id: activeSessionId \}\)/);
  assert.match(chatInterface, /generateSessionTitle\(content\)/);
});

test("conversation search uses ranked full-text search across titles and message content", async () => {
  const [router, migration, journal, searchModal, sidebar] = await Promise.all([
    readText("apps/web/src/server/routers/sessions.ts"),
    readText("apps/web/drizzle/0029_session_titles_search.sql"),
    readText("apps/web/drizzle/meta/_journal.json"),
    readText("apps/web/src/components/SearchModal.tsx"),
    readText("apps/web/src/components/Sidebar.tsx"),
  ]);

  assert.match(router, /websearch_to_tsquery\('english'/);
  assert.match(router, /ts_rank_cd/);
  assert.match(router, /to_tsvector\('english', coalesce\(\$\{chatSessions\.title\}/);
  assert.match(router, /ilike\(chatSessions\.title, pattern\)/);
  assert.match(router, /orderBy\(desc\(searchRank\), desc\(messages\.createdAt\)\)/);
  assert.match(migration, /chat_sessions_title_fts_idx/);
  assert.match(migration, /messages_content_fts_idx/);
  assert.match(migration, /messages_session_created_idx/);
  assert.match(migration, /FTS5-style local search/);
  assert.match(journal, /0029_session_titles_search/);
  assert.match(searchModal, /trpc\.messages\.search\.useQuery/);
  assert.match(sidebar, /trpc\.messages\.search\.useQuery/);
});

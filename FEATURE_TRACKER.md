# AgentHub Feature Tracker

> **Purpose**: Track implementation completeness at the layer level. Each feature shows which of 5 layers is done.  
> **Layers**: `Schema` · `tRPC/API` · `Server Logic` · `UI` · `Tests`  
> **Status symbols**: ✅ done · 🔶 partial · ❌ missing  
> **Last updated**: 2026-05-15
> **Status**: Archived layer-level snapshot. `TODO.md` is the canonical current tracker.
> Some rows below intentionally preserve stale gap notes from the original audit; use the canonical tracker plus tests for current completion.

---

## Legend

| Symbol | Meaning                           |
| ------ | --------------------------------- |
| ✅     | Fully implemented                 |
| 🔶     | Partially implemented — see notes |
| ❌     | Not started                       |

---

## 1. Authentication & Identity

| Feature                    | Schema           | tRPC/API | Server Logic | UI  | Tests | Notes                                                 |
| -------------------------- | ---------------- | -------- | ------------ | --- | ----- | ----------------------------------------------------- |
| Session auth (NextAuth v4) | ✅               | ✅       | ✅           | ✅  | ❌    | `apps/web/src/server/auth.ts`                         |
| Casdoor OIDC provider      | ✅               | ✅       | ✅           | ✅  | ❌    | DrizzleAdapter wired; Casdoor needs manual app config |
| User profile management    | ✅ `users` table | 🔶       | 🔶           | ❌  | ❌    | No profile settings UI; only session data stored      |
| Multi-user/team auth       | ❌               | ❌       | ❌           | ❌  | ❌    | Single-user only; no team workspace concept           |
| Role-based access control  | ❌               | ❌       | ❌           | ❌  | ❌    | All data is per-user, no admin/member roles           |

---

## 2. AI Provider Integration

| Feature                        | Schema                                                      | tRPC/API | Server Logic | UI  | Tests | Notes                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------- | -------- | ------------ | --- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider credentials (API key) | ✅ `providerCredentials`                                    | ✅       | ✅           | ✅  | ❌    | `apps/web/src/components/ProviderSettings.tsx`                                                                                                       |
| Provider credentials (OAuth)   | ✅ (`authType`, `accessToken`, `refreshToken`, `expiresAt`) | ❌       | ❌           | ❌  | ❌    | Schema ready; no OAuth flow implemented. See `docs/PROVIDER_AUTH.md`                                                                                 |
| Provider test connection       | ✅                                                          | ✅       | ✅           | ✅  | ❌    | `providerCredentials.test` procedure in `_app.ts`                                                                                                    |
| Ollama (local)                 | ❌ DB                                                       | ✅       | ✅           | 🔶  | ❌    | `packages/ai-providers/src/providers/ollama.ts`; no Ollama-specific settings UI                                                                      |
| LM Studio (local)              | ❌ DB                                                       | ✅       | ✅           | ❌  | ❌    | `packages/ai-providers/src/providers/lmstudio.ts`; hardcoded URL                                                                                     |
| vLLM (local)                   | ❌ DB                                                       | ✅       | ✅           | ❌  | ❌    | `packages/ai-providers/src/providers/vllm.ts`                                                                                                        |
| OpenAI                         | ✅                                                          | ✅       | ✅           | ✅  | ❌    | API key only; 4 hardcoded models; no model list fetch                                                                                                |
| Anthropic                      | ✅                                                          | ✅       | ✅           | ✅  | ❌    | API key only; 4 hardcoded models                                                                                                                     |
| Google Gemini                  | ✅                                                          | ✅       | ✅           | ✅  | ❌    | API key only; OAuth possible via GCP, not implemented                                                                                                |
| Moonshot                       | ✅                                                          | ✅       | ✅           | ✅  | ❌    | API key only                                                                                                                                         |
| GitHub Copilot                 | ✅                                                          | ✅       | ✅           | ✅  | ✅    | Device-flow OAuth routes + provider implementation + model discovery are implemented; current tests guard against the old hardcoded five-model list. |
| Dynamic model list fetch       | ✅                                                          | ✅       | ✅           | ✅  | ✅    | Settings fetch now calls each provider's `listModels()` implementation; GitHub Copilot and Moonshot are covered by repository tests.                 |
| Provider registry hot reload   | ❌                                                          | ❌       | 🔶           | ❌  | ❌    | `loadUserCredentials()` called per-request; no streaming registry invalidation                                                                       |

---

## 3. Chat & Messaging

| Feature                         | Schema           | tRPC/API           | Server Logic | UI  | Tests | Notes                                                                          |
| ------------------------------- | ---------------- | ------------------ | ------------ | --- | ----- | ------------------------------------------------------------------------------ |
| Basic chat stream               | ✅ `messages`    | ✅                 | ✅           | ✅  | ❌    | `apps/web/src/app/api/chat/stream/route.ts`; SSE                               |
| Message persistence             | ✅               | ✅                 | ✅           | ✅  | ❌    | Both user and assistant messages saved                                         |
| Conversation history injection  | ✅               | ✅                 | ✅           | ✅  | ❌    | Last 10 messages loaded into LLM context                                       |
| Message branching (fork)        | ✅ `parentId`    | ✅ `sessions.fork` | 🔶           | ❌  | ❌    | Schema + tRPC fork procedure exist; no branching UI; no thread visualization   |
| Delete message + after          | ✅               | ✅                 | ✅           | 🔶  | ❌    | `messages.deleteAfter` exists; UI only shows delete session, not branch delete |
| Message search                  | ❌               | ❌                 | ❌           | ❌  | ❌    | No full-text search on messages                                                |
| Message reactions               | ❌               | ❌                 | ❌           | ❌  | ❌    |                                                                                |
| Streaming reasoning/CoT display | 🔶               | 🔶                 | 🔶           | ❌  | ❌    | Ollama `<think>` tags parsed in provider; no UI CoT visualization              |
| Artifacts (code/canvas output)  | ❌               | ❌                 | ❌           | ❌  | ❌    | No artifact rendering panel                                                    |
| TTS / voice output              | ❌               | ❌                 | ❌           | ❌  | ❌    |                                                                                |
| STT / voice input               | ❌               | ❌                 | ❌           | ❌  | ❌    |                                                                                |
| Image generation                | ❌               | ❌                 | ❌           | ❌  | ❌    |                                                                                |
| File/image upload to chat       | ✅ `files` table | 🔶                 | 🔶           | ❌  | ❌    | MinIO presigned upload exists; no chat attachment UI                           |
| Export conversation             | ❌               | ❌                 | ❌           | ❌  | ❌    |                                                                                |

---

## 4. Agent System

| Feature                   | Schema                                | tRPC/API                | Server Logic | UI  | Tests | Notes                                                                                         |
| ------------------------- | ------------------------------------- | ----------------------- | ------------ | --- | ----- | --------------------------------------------------------------------------------------------- |
| Agent CRUD                | ✅ `agents`                           | ✅                      | ✅           | ✅  | ❌    | `apps/web/src/components/AgentBuilder.tsx`                                                    |
| Agent system prompt       | ✅                                    | ✅                      | ✅           | ✅  | ❌    | `systemPrompt` column                                                                         |
| Agent model assignment    | ✅                                    | ✅                      | ✅           | ✅  | ❌    | `modelId` stored as qualified ID e.g. `"ollama:qwen2.5:7b"`                                   |
| Agent tool assignment     | ✅ (JSON text)                        | ✅                      | ✅           | 🔶  | ❌    | `tools` column is text JSON — should be `jsonb`; UI shows checkboxes for hardcoded tools only |
| Agent avatar/metadata     | ✅ `avatar`, `description`            | ✅                      | ✅           | ✅  | ❌    |                                                                                               |
| Agent parameter controls  | ✅ `temperature`, `maxTokens`, `topP` | ✅                      | ✅           | ✅  | ❌    |                                                                                               |
| Agent groups              | ✅ `agentGroups`, `groupMembers`      | ✅                      | ✅           | ✅  | ❌    | `apps/web/src/components/GroupBuilder.tsx`                                                    |
| Orchestration: Sequential | ❌ DB                                 | ❌                      | ✅           | 🔶  | ❌    | `packages/agent-runtime/src/orchestrators/sequential.ts`; no dedicated group UI               |
| Orchestration: Parallel   | ❌ DB                                 | ❌                      | ✅           | 🔶  | ❌    | `packages/agent-runtime/src/orchestrators/parallel.ts`                                        |
| Orchestration: Supervisor | ❌ DB                                 | ❌                      | ✅           | 🔶  | ❌    | `packages/agent-runtime/src/orchestrators/supervisor.ts`; 3-phase: analyze→work→synthesize    |
| Orchestration: Debate     | ❌ DB                                 | ❌                      | ✅           | 🔶  | ❌    | `packages/agent-runtime/src/orchestrators/debate.ts`; 2 rounds                                |
| Orchestration: GroupChat  | ❌ DB                                 | ❌                      | ✅           | 🔶  | ❌    | `packages/agent-runtime/src/orchestrators/groupchat.ts`                                       |
| Agent marketplace import  | ✅                                    | ✅ `marketplace.import` | ✅           | ✅  | ❌    | 4 bundled agents in 3 packs; `marketplace.ts` manifest                                        |
| Agent marketplace publish | ❌                                    | ❌                      | ❌           | ❌  | ❌    | No community publish flow                                                                     |
| Agent export              | ✅                                    | ✅                      | ✅           | ❌  | ❌    | `createAgentExportManifest()` exists; no export button in UI                                  |

---

## 5. Tool Use & MCP

| Feature                                          | Schema | tRPC/API | Server Logic | UI  | Tests | Notes                                                                           |
| ------------------------------------------------ | ------ | -------- | ------------ | --- | ----- | ------------------------------------------------------------------------------- |
| Built-in tools (calculator, datetime, read_file) | ❌ DB  | ❌       | ✅           | 🔶  | ❌    | `packages/agent-runtime/src/tools/registry.ts`; hardcoded in `src/index.ts`     |
| Tool execution loop                              | ❌     | ❌       | ✅           | ❌  | ❌    | `AgentRuntime.run()` — max 3 iterations, 30s timeout                            |
| Tool result streaming                            | ❌     | ❌       | ✅           | ❌  | ❌    | Yields `tool_result` chunk type; no UI renders it                               |
| MCP client (stdio)                               | ❌     | ❌       | ✅           | ❌  | ❌    | `packages/agent-runtime/src/mcp/client.ts` — **orphaned**: no tRPC route, no UI |
| MCP client (HTTP)                                | ❌     | ❌       | ✅           | ❌  | ❌    | Same client file; HTTP transport implemented but orphaned                       |
| MCP server management UI                         | ❌     | ❌       | ❌           | ❌  | ❌    | No way for users to add/configure MCP servers                                   |
| MCP server marketplace                           | ❌     | ❌       | ❌           | ❌  | ❌    | LobeHub has 10k+ tool marketplace; AgentHub has none                            |
| Web search tool                                  | ❌     | ❌       | ❌           | ❌  | ❌    |                                                                                 |
| Code execution tool                              | ❌     | ❌       | ❌           | ❌  | ❌    |                                                                                 |

---

## 6. Memory System

| Feature                           | Schema                                  | tRPC/API | Server Logic | UI  | Tests | Notes                                                                       |
| --------------------------------- | --------------------------------------- | -------- | ------------ | --- | ----- | --------------------------------------------------------------------------- |
| Memory entries (white-box)        | ✅ `memoryEntries`                      | ✅       | ✅           | ✅  | ❌    | `apps/web/src/server/memory.ts`; `MemoryEditor` view in chatStore           |
| Memory extraction (LLM post-conv) | ❌                                      | ❌       | ✅           | ❌  | ❌    | `extractMemories()` in `memory.ts`; not yet called anywhere in stream route |
| Memory propose → accept flow      | ✅ `status: proposed/accepted/rejected` | ✅       | ✅           | 🔶  | ❌    | `memoryEntries.update` exists; no review/approve UI built                   |
| Memory injection into context     | ❌                                      | ❌       | ✅           | ❌  | ❌    | `fetchAcceptedMemoriesForAgent()` called in stream route; limit 12          |
| Memory search                     | ❌                                      | ❌       | ❌           | ❌  | ❌    | No semantic/FTS search on memory entries                                    |
| Memory export                     | ❌                                      | ❌       | ❌           | ❌  | ❌    |                                                                             |

---

## 7. Knowledge Base & RAG

| Feature                    | Schema                           | tRPC/API | Server Logic | UI  | Tests | Notes                                                                                                                                       |
| -------------------------- | -------------------------------- | -------- | ------------ | --- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Knowledge base CRUD        | ✅ `knowledgeBases`              | ✅       | ✅           | 🔶  | ❌    | tRPC procedures exist; minimal UI                                                                                                           |
| Document upload & chunking | ✅ `documents`, `documentChunks` | ✅       | ✅           | 🔶  | ❌    | Upload pipeline exists; no upload UI integrated with KB view                                                                                |
| Vector embeddings          | ✅ `pgvector` 768-dim HNSW       | ✅       | ✅           | ❌  | ❌    | `nomic-embed-text` via Ollama                                                                                                               |
| RAG retrieval              | ❌                               | ❌       | ✅           | ❌  | ❌    | Top-5 cosine similarity injected into system prompt; ⚠️ uses `sql.raw(vectorStr)` — SQL injection risk if embeddings are externally sourced |
| KB assigned to agent       | ✅ `agents.knowledgeBaseId`      | ✅       | ✅           | 🔶  | ❌    | FK exists; no KB picker in AgentBuilder                                                                                                     |
| Document preview           | ❌                               | ❌       | ❌           | ❌  | ❌    |                                                                                                                                             |
| Web crawl / URL ingestion  | ❌                               | ❌       | ❌           | ❌  | ❌    |                                                                                                                                             |
| Reranking                  | ❌                               | ❌       | ❌           | ❌  | ❌    | Only cosine similarity; no cross-encoder rerank                                                                                             |

---

## 8. File Storage

| Feature                   | Schema     | tRPC/API | Server Logic | UI  | Tests | Notes                                        |
| ------------------------- | ---------- | -------- | ------------ | --- | ----- | -------------------------------------------- |
| File metadata             | ✅ `files` | ✅       | ✅           | ❌  | ❌    |                                              |
| MinIO/S3 presigned upload | ❌ DB      | ✅       | ✅           | ❌  | ❌    | `@aws-sdk/client-s3`; no upload UI component |
| File attachment in chat   | ❌         | ❌       | ❌           | ❌  | ❌    |                                              |
| Image rendering in chat   | ❌         | ❌       | ❌           | ❌  | ❌    |                                              |

---

## 9. UI / UX Shell

| Feature                   | Schema | tRPC/API | Server Logic | UI  | Tests | Notes                                                  |
| ------------------------- | ------ | -------- | ------------ | --- | ----- | ------------------------------------------------------ |
| Sidebar navigation        | ❌     | ❌       | ❌           | ✅  | ❌    | `apps/web/src/app/page.tsx` + `layout.tsx`             |
| Session list              | ❌     | ✅       | ✅           | ✅  | ❌    |                                                        |
| Agent selector            | ❌     | ✅       | ✅           | ✅  | ❌    |                                                        |
| Settings panel            | ❌     | ✅       | ✅           | ✅  | ❌    | Provider settings only                                 |
| Dark mode                 | ❌     | ❌       | ❌           | ❌  | ❌    | No theme toggle                                        |
| Mobile responsive         | ❌     | ❌       | ❌           | ❌  | ❌    | Desktop-only layout                                    |
| PWA / offline             | ❌     | ❌       | ❌           | ❌  | ❌    |                                                        |
| Keyboard shortcuts        | ❌     | ❌       | ❌           | ❌  | ❌    |                                                        |
| i18n / localization       | ❌     | ❌       | ❌           | ❌  | ❌    |                                                        |
| Markdown rendering        | ❌     | ❌       | ❌           | 🔶  | ❌    | Basic rendering only; no syntax highlighting, no LaTeX |
| Code syntax highlighting  | ❌     | ❌       | ❌           | ❌  | ❌    |                                                        |
| LaTeX / math rendering    | ❌     | ❌       | ❌           | ❌  | ❌    |                                                        |
| Onboarding / setup wizard | ❌     | ❌       | ❌           | ❌  | ❌    |                                                        |

---

## 10. Infrastructure & DevOps

| Feature                        | Schema | tRPC/API | Server Logic | UI  | Tests | Notes                                                                     |
| ------------------------------ | ------ | -------- | ------------ | --- | ----- | ------------------------------------------------------------------------- |
| Docker Compose stack           | ❌     | ❌       | ✅           | ❌  | ❌    | PostgreSQL, Redis, MinIO, Casdoor, app                                    |
| CI (GitHub Actions)            | ❌     | ❌       | ✅           | ❌  | 🔶    | `test → typecheck → lint → build`; test suite minimal                     |
| `.env.example`                 | ✅     | ❌       | ❌           | ❌  | ✅    | Present at repo root; repository tests assert required env documentation. |
| Health check endpoint          | ❌     | ❌       | ❌           | ❌  | ❌    |                                                                           |
| Redis integration              | ❌     | ❌       | ❌           | ❌  | ❌    | Declared in docker-compose; no application code uses it                   |
| Rate limiting                  | ❌     | ❌       | ❌           | ❌  | ❌    |                                                                           |
| Error monitoring (Sentry etc.) | ❌     | ❌       | ❌           | ❌  | ❌    |                                                                           |
| Analytics / telemetry          | ❌     | ❌       | ❌           | ❌  | ❌    |                                                                           |

---

## 11. Known Technical Debt (Blocking)

| Issue                                 | File                                        | Impact                                                                                      |
| ------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `_app.ts` is 906 lines (200 LOC rule) | `apps/web/src/server/routers/_app.ts`       | Hard to maintain; must be split into domain sub-routers                                     |
| RAG uses `sql.raw(vectorStr)`         | `apps/web/src/app/api/chat/stream/route.ts` | SQL injection risk; parameterize embedding vector                                           |
| `agents.tools` stored as `text` JSON  | `apps/web/src/server/db/schema.ts`          | Should be `jsonb`; parsed 5+ times across codebase                                          |
| `.env.example` coverage               | repo root                                   | Resolved; repo root `.env.example` is committed and guarded by `tests/repository.test.mjs`. |
| MCP client orphaned                   | `packages/agent-runtime/src/mcp/client.ts`  | Fully implemented but zero integration with tRPC or UI                                      |
| Redis declared but unused             | `docker-compose.yml`                        | Wasted resource; session caching, rate limiting, pub/sub all missing                        |
| Memory extraction never called        | `apps/web/src/server/memory.ts`             | `extractMemories()` implemented but not invoked in stream route                             |

---

## 12. Priority Implementation Queue

Ordered by impact vs effort for reaching a usable v1 parity with LobeHub core:

1. **Create `.env.example`** — unblocks CI (30 min)
2. **Split `_app.ts`** into sub-routers — reduces debt, enables parallel development (2–4 hr)
3. **Fix RAG SQL injection** — security fix (1 hr)
4. **MCP integration** — wire `MCPClient` to tRPC + build server management UI (1–2 days)
5. **OAuth provider flow** — GitHub Copilot device flow + Gemini OAuth (see `docs/PROVIDER_AUTH.md`) (2–3 days)
6. **Message branching UI** — `parentId` + `sessions.fork` already exist; add thread visualization (1 day)
7. **Memory extraction hook** — call `extractMemories()` + build approve/reject UI (1 day)
8. **Dark mode + mobile responsive** — global theme system (1–2 days)
9. **Dynamic model list** — fetch `/v1/models` per provider, replace hardcoded lists (1 day)
10. **Agent export button** — `createAgentExportManifest()` exists; add UI trigger (2 hr)

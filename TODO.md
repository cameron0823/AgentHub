# AgentHub — Canonical Task Tracker

> **Last updated:** 2026-05-14  
> **This is the single source of truth for all remaining work.**  
> Implementation details → `IMPLEMENTATION_PLANS.md` (phase numbers referenced inline).  
> Other planning docs (`MASTER_PLAN.md`, `IMPLEMENTATION_PLAN.md`, `E2E_FEATURE_PLANS.md`,  
> `FEATURE_CATALOG.md`, `REQUIREMENTS_AUDIT*.md`, `FEATURE_TRACKER.md`) are reference/archive only.

---

## Completed — Infrastructure Baseline ✅

Sprints 0–5 per `IMPLEMENTATION_ROADMAP.md` (committed, verified):
- PostgreSQL + pgvector schema, Docker Compose stack, NextAuth + Casdoor
- tRPC router architecture, Drizzle ORM, streaming chat SSE
- Agent CRUD + Group CRUD, built-in tools (calc, datetime, read_file)
- Provider registry (Ollama, vLLM, LM Studio), bundled marketplace
- Session forking + file attachments + message editing + regeneration
- Conversation search (pg_trgm + SearchModal.tsx)
- KB RAG (ingest, chunking, embeddings, cosine search, KB manager)
- White-box memory (CRUD, injection, extraction, approve/reject UI)
- All 5 orchestration patterns (sequential, parallel, supervisor, debate, groupchat)
- Cloud provider credentials (Anthropic, OpenAI, Gemini, Moonshot)

**Phase 11 blocking fixes (complete 2026-05-13):**
- [x] `.env.example` created
- [x] RAG `sql.raw()` → parameterized `sql` template tag
- [x] `_app.ts` split into sub-routers (auth, agents, sessions, messages, memory, KB, marketplace, providers, files)
- [x] ESLint fixes: `SearchModal.tsx` unescaped quotes, `share/[slug]/page.tsx` `<Link>` import
- [x] Migration `0001_funny_lester.sql` generated and committed (5 new tables, 9 ALTER columns)
- [x] `playwright.config.ts` updated to PostgreSQL URL
- [x] `repository.test.mjs` updated for correct paths and DB config
- [x] E2E spec files committed to `apps/web/tests/e2e/specs/`

---

## Completed — Sprint 6 + Phase 12 ✅

**Sprint 6: Chat Polish (complete 2026-05-14):**
- [x] **Vision / image input** — file picker + accept="image/*,...", multipart content to provider, image rendering in ChatMessage. `imageUrls` field added to ChatMessage type
- [x] **Message edit UI** — inline textarea, Save & Regenerate / Cancel, `messages.update` + `deleteAfter` + re-stream
- [x] **Mermaid diagram rendering** — ` ```mermaid ` blocks → `MermaidBlock` component
- [x] **Export conversation as Markdown** — Download button → Blob download from Zustand store
- [x] **Copy message button + timestamp toggle** — hover Copy icon + Clock toggle icon on `ChatMessage`
- [x] **Pin conversations** — `chatSessions.isPinned` + sidebar pin mutation wired
- [x] **Message feedback (👍/👎)** — `messages.setFeedback` tRPC mutation + thumb buttons
- [x] **Hotkey support** — `Cmd+K` search, `Cmd+N` new chat, `Cmd+/` help, `Esc` close

**Phase 12: Markdown + Dark Mode (complete):**
- [x] Full markdown with syntax highlighting — `react-markdown` + `remark-gfm` + `react-syntax-highlighter`
- [x] LaTeX / math rendering — `remark-math` + `rehype-katex`
- [x] Dark mode toggle — `ThemeToggle` component wired in Sidebar

---

## Completed — Phases 13–31 ✅

- [x] **Phase 13**: Memory System — `extractMemories()` fire-and-forget, approve/reject UI, debounced search
- [x] **Phase 14**: MCP Integration — `mcp_servers` table, tRPC CRUD, MCPClient in stream route, shell metachar validation, `discover` procedure, `McpSettings.tsx`
- [x] **Phase 16**: Message Branching UI — "Fork from here" button, `BranchNavigator.tsx`, GitBranch icon in sidebar with ml-4 indent
- [x] **Phase 17**: Prompt Library + Slash Commands — `prompt_library` table, tRPC router, `/` autocomplete in `ChatInput`, Prompt Library UI
- [x] **Phase 18**: Shareable Chat Links — `sessions.publish` mutation (nanoid slug), Share button in `ChatHeader`, `share/[slug]/page.tsx`
- [x] **Phase 19**: File Attachment in Chat — Paperclip button, presigned S3 upload, attachment chips, `fileIds[]` in stream route, image/file rendering in `ChatMessage`
- [x] **Phase 20**: Agent Enhancements — opening message + starter chips, KB picker in `AgentBuilder` wired to `form.knowledgeBaseId`
- [x] **Phase 21**: RAG Inline Citations — `rag_sources` SSE chunk, `messages.metadata.ragSources`, collapsible Sources panel in `ChatMessage`
- [x] **Phase 23**: Mobile Responsive + Keyboard Shortcuts — `KeyboardShortcuts.tsx`, `Cmd+K`/`Cmd+N`/`Esc` wired
- [x] **Phase 24**: Token Count Display — live token estimate in `ChatInput`, `tokensUsed` + `latencyMs` written after stream
- [x] **Phase 25**: Web Search Tool — SearXNG in `docker-compose.yml`, `webSearch.ts` in agent-runtime, `web_search` in `TOOL_OPTIONS`
- [x] **Phase 26**: Analytics Dashboard — `AnalyticsDashboard.tsx` with Recharts (line/bar/pie), tRPC analytics procedures, `/analytics` page
- [x] **Phase 27**: Voice Input/Output — `VoiceInput.tsx` (Web Speech API), `TTSButton.tsx` (SpeechSynthesis), auto-read setting
- [x] **Phase 28**: Scheduled Automations — `automations` + `automation_runs` schema, BullMQ worker, `AutomationsManager.tsx`, `/automations` page
- [x] **Phase 29**: Prompt Variables — `substituteVariables()` for `{{USER_NAME}}`, `{{CURRENT_DATE}}`, `{{AGENT_NAME}}`
- [x] **Phase 30**: Code Interpreter Sandbox — Docker sandbox (`--network none`, `--memory 256m`, `--cpus 0.5`), `execute_code` tool, `ToolCallCard` rendering
- [x] **Phase 31**: Agent Orchestration UI — pattern selector in `GroupBuilder`, all 5 patterns wired to stream route dispatch

---

## Completed — Sprint 7: KB Advanced Features ✅

- [x] **Hybrid search** — RRF fusion of pgvector cosine + `tsvector` full-text, migration `0002_hybrid_search.sql` (pg_trgm + GIN indexes + generated `content_tsv` column) [S7.1]
- [x] **Agent VFS mount** — `read_file` extraTool injected per-session when agent has KB; `docs/<kbSlug>/<docTitle>` paths resolve to chunk content from DB [S7.3]
- [x] **Reranking** — `rerankWithOllama()` in `kb-search.ts`; opt-in via `RERANK_MODEL` env; scores each candidate with a small LLM prompt, re-sorts [S7.4]
- [x] **Shared `hybridKbSearch()` utility** — `apps/web/src/server/kb-search.ts`; used by both stream route RAG and `/api/kb/query` endpoint; SSRF-safe URL validation, finite-number embedding guard

---

## MEDIUM PRIORITY — Next Sprint

### Sprint 8: Memory Advanced ✓ COMPLETE

- [x] Context window management — token counting + summarize oldest turns [S8.1]
- [x] Memory semantic search — embed entries + cosine search [S8.2]

### Sprint 9: Orchestration Polish ✓ COMPLETE

- [x] Pattern visualizer UI — live graph of agent interactions per event stream [S9.1]
- [x] Meaningful supervisor/debate/groupchat event rendering in `ChatInterface` [S9.2]
- [x] Human-in-the-loop checkpoints — pause for user approval in supervisor/debate [S9.3]

---

## LOW PRIORITY

### Sprint 10: MCP & Extensibility

- [x] A2A protocol gateway (HTTP endpoint for cross-agent task delegation) [S10.5]
- [x] Trust engine (credential vault + policy engine) [S10.8] — AES-256-GCM encrypted `agent_credentials` table, `trust_policies` (allowed tools, rate limits), `credential_audit_log` (tamper-evident), `resolveCredential()` utility, tRPC `trust` router with authedProcedure on all ops; `TrustSettings.tsx` settings panel with credential CRUD + audit log viewer

### Sprint 11: API & Integration Layer

- [x] OpenAI-compatible `/v1/chat/completions` route [S11.1]
- [x] API key management (`api_keys` table + auth middleware) [S11.2]
- [x] Data export (ZIP: agents.json + sessions.jsonl + memory.json + files/) [S11.4]
- [x] Data import [S11.5] — `POST /api/import` accepts ZIP (multipart or raw); reassigns all UUIDs, maps agent FKs in sessions/messages/memory, validates roles/statuses, scoped to authenticated user

### Sprint 12: Polish & Production

- [x] i18n framework + 3 languages (next-intl) [S12.2] — cookie-based locale detection (en/es/fr), `NextIntlClientProvider` in root layout, `LocaleSwitcher` component wired in settings page, server action to persist locale, `messages/*.json` translation files
- [x] PWA manifest + service worker [S12.3] (icons generated: icon-192.png + icon-512.png)
- [x] Token tracking dashboard (aggregate tokensUsed + latency) [S12.4]
- [x] Admin panel UI (user management, quotas) [S12.6]

### Phase 32: Integration Test Coverage · Est. 2–3 days

- [x] Auth + session isolation tests [P32.1] — `tests/api-integration.test.mjs` (36 tests: S11.1, S11.2, S11.4, S10.5, S12.3, S10.8 trust engine migration + encryption + ownership + security hardening); suite total: 244 pass, 0 fail
- [x] Chat stream tests — structural source analysis [P32.2] — `tests/chat-stream.test.mjs` (19 tests: auth, SSE format, DB persistence, group orchestration, HITL, memory, RAG, MCP)
- [ ] Behavioral SSE stream tests — live HTTP request → SSE parse → assert chunks [P32.2b] · requires test DB + mock AgentRuntime provider injection; blocked on test infrastructure
- [x] Agent CRUD + user isolation tests [P32.3] — `tests/agent-crud-isolation.test.mjs` (19 tests: agents/agentGroups/sessions/messages CRUD isolation, schema FK checks)
- [x] KB + RAG tests [P32.4] — `tests/kb-rag.test.mjs` (20 tests: authedProcedure, user isolation, SSRF protection, hybridKbSearch, embedding guard, reranking opt-in); also fixed real security gap: `/api/kb/query` now verifies KB ownership before search
- [x] MCP security tests [P32.5] — `tests/mcp-security.test.mjs` (16 tests: authedProcedure, ownership isolation, shell metachar rejection, spawn-not-exec, no shell:true, JSON-RPC, process cleanup)

---

## Future / Tier 3 (Weeks+ Effort, Design-First Required)

- **A2UI Declarative UI** — JSON schema → React components (schema design is critical path)
- **CRDT Local-First Sync** — Yjs + IndexedDB + Electric SQL replication
- **Stateful Graph Orchestration** — checkpoint manager, pause/resume, HITL approval gates
- **Workspace Isolation / Multi-Tenancy** — data silos, per-workspace LLM config, RBAC
- **Desktop App** — Electron wrapper + native menus + auto-updater
- **Mode-First Packaging** — mode manifest schema, mode isolation, mode marketplace
- **A2A Protocol Community** — mDNS discovery, cross-framework bridge (LangGraph → AgentHub)

---

## Acceptance Criteria (Every Phase)

1. `npm run typecheck` exits 0 (all 3 packages)
2. `npm test` exits 0 (143 baseline tests — no regressions)
3. Feature works end-to-end in browser (start dev server, exercise golden path)
4. Security phases: `security-auditor` clearance required before merging

```bash
# Run from /home/coxar/projects/AgentHub
npm run typecheck
npm test
cd apps/web && pnpm playwright test   # E2E (requires Docker stack)
```

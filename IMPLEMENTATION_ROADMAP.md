# AgentHub Implementation Roadmap

> **Version:** 2.0  
> **Last Updated:** 2026-05-15
> **Status:** Archived roadmap snapshot. `TODO.md` is the canonical current tracker.
> Sprints 0-12 and Phase 32 are complete there; rows below preserve historical planning context and may show superseded open items.

---

## Legend

- ✅ **Complete** — Shipped and verified end-to-end
- 🔧 **Backend Ready** — API/schema exists, UI integration pending
- 🚧 **In Progress** — Active development
- ⬜ **Not Started** — On roadmap, no code yet
- ❌ **Out of Scope** — Deliberately excluded

---

## Sprint 0: Foundation (COMPLETE ✅)

**Sprint Goal:** Core infrastructure and reference stack parity.

| #    | Task                                       | Status | Notes                                         |
| ---- | ------------------------------------------ | ------ | --------------------------------------------- |
| 0.1  | PostgreSQL + pgvector schema               | ✅     | All tables, relations, HNSW index             |
| 0.2  | Docker Compose stack                       | ✅     | Postgres, MinIO, Casdoor, Redis               |
| 0.3  | NextAuth v4 + Casdoor OIDC                 | ✅     | Sign-in, sign-out, session middleware         |
| 0.4  | tRPC router architecture                   | ✅     | `_app.ts` with namespaced routers             |
| 0.5  | Drizzle ORM + connection                   | ✅     | `db.ts` singleton with pool                   |
| 0.6  | Streaming chat (`/api/chat/stream`)        | ✅     | SSE via `AgentRuntime`                        |
| 0.7  | Agent CRUD UI + API                        | ✅     | `AgentBuilder.tsx`, `agents` router           |
| 0.8  | Agent Group CRUD                           | ✅     | `AgentGroupBuilder.tsx`, `agentGroups` router |
| 0.9  | Built-in tools (calc, datetime, read_file) | ✅     | `globalToolRegistry`                          |
| 0.10 | Provider registry                          | ✅     | Ollama, vLLM, LM Studio                       |
| 0.11 | Marketplace (bundled catalog)              | ✅     | `AgentMarketplace.tsx`                        |
| 0.12 | Auto title generation                      | ✅     | `generateSessionTitle()`                      |
| 0.13 | Reasoning / CoT display                    | ✅     | `<think>` tag extraction + collapsible panel  |

---

## Sprint 1: Chat Core (COMPLETE ✅)

**Sprint Goal:** Message-level interactions and conversation management.

| #   | Task                          | Status | Notes                                                                  |
| --- | ----------------------------- | ------ | ---------------------------------------------------------------------- |
| 1.1 | Session forking / branching   | ✅     | `sessions.fork` tRPC + UI integration                                  |
| 1.2 | File attachments in chat      | ✅     | Presigned URL → MinIO → message with file URL                          |
| 1.3 | Message editing               | ✅     | Inline textarea → `messages.update` → truncate subsequent → regenerate |
| 1.4 | Message regeneration          | ✅     | `messages.delete` + re-run stream with same context                    |
| 1.5 | Conversation search (pg_trgm) | ✅     | `pg_trgm` extension + GIN index + `messages.search` + sidebar UI       |

**Deferred from Sprint 1:**

- 1.6 Vision / image input ⬜
- 1.7 Pin conversations ⬜
- 1.8 Message feedback (👍/👎) ⬜
- 1.9 Hotkey support ⬜
- 1.10 Mermaid diagram rendering ⬜

---

## Sprint 2: Knowledge Base RAG (COMPLETE ✅)

**Sprint Goal:** End-to-end document ingestion and retrieval-augmented generation.

| #   | Task                                    | Status | Notes                                                                                      |
| --- | --------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| 2.1 | KB schema (documents, chunks, pgvector) | ✅     | `vector(768)` + HNSW index                                                                 |
| 2.2 | KB ingest API (`/api/kb/ingest`)        | ✅     | Text extraction → chunking → Ollama embedding → store chunks                               |
| 2.3 | KB query API (`/api/kb/query`)          | ✅     | Embed query → cosine similarity search                                                     |
| 2.4 | KB UI shell (`KnowledgeBaseManager`)    | ✅     | List/create/delete KBs                                                                     |
| 2.5 | Document upload → ingest flow           | ✅     | File select → presigned URL → MinIO → `createDocument` → `ingestDocument`                  |
| 2.6 | Agent-KB binding                        | ✅     | `agents.knowledgeBaseId` FK + dropdown in `AgentBuilder`                                   |
| 2.7 | RAG injection in chat stream            | ✅     | Embed last user message → retrieve top-5 chunks → inject into system prompt with citations |

**Sub-tasks for 2.5 (Document Upload Flow):**

- 2.5.1 `knowledgeBases.createDocument` tRPC mutation ✅
- 2.5.2 `knowledgeBases.ingestDocument` tRPC mutation (triggers `/api/kb/ingest`) ✅
- 2.5.3 `knowledgeBases.deleteDocument` tRPC mutation ✅
- 2.5.4 File upload button + status tracking in `KnowledgeBaseManager` ✅

**Deferred from Sprint 2:**

- 2.8 Hybrid search (BM25 + vector) ⬜
- 2.9 Agent VFS mount (docs as readable files) ⬜
- 2.10 Inline citation UI (sources panel) ⬜
- 2.11 Reranking with cross-encoder ⬜

---

## Sprint 3: Memory & Learning (COMPLETE ✅)

**Sprint Goal:** White-box memory with automatic extraction.

| #   | Task                            | Status | Notes                                                                    |
| --- | ------------------------------- | ------ | ------------------------------------------------------------------------ |
| 3.1 | Memory schema + CRUD            | ✅     | `memory_entries` table with status enum                                  |
| 3.2 | Memory injection in chat stream | ✅     | `fetchAcceptedMemoriesForAgent` → format block → append to system prompt |
| 3.3 | Memory Editor UI                | ✅     | Full CRUD: create, edit, delete, filter by agent/category/status         |
| 3.4 | Auto memory extraction          | ✅     | Post-response Ollama prompt extracts CATEGORY/KEY/VALUE triples          |
| 3.5 | Pending memory review           | ✅     | `proposed` memories show Accept/Reject buttons + banner in Memory Editor |

**Sub-tasks for 3.4 (Auto Extraction):**

- 3.4.1 `extractMemories()` — Ollama prompt + regex parser ✅
- 3.4.2 `storePendingMemories()` — inserts with `status: "proposed"` ✅
- 3.4.3 Hook into `/api/chat/stream` after assistant message persistence ✅

**Deferred from Sprint 3:**

- 3.6 Context window management (token counting + pruning) ⬜
- 3.7 Memory search (semantic + keyword) ⬜

---

## Sprint 4: Orchestration (MOSTLY COMPLETE ✅)

**Sprint Goal:** All 5 multi-agent patterns functional end-to-end.

| #   | Task                                         | Status | Notes                                                            |
| --- | -------------------------------------------- | ------ | ---------------------------------------------------------------- |
| 4.1 | Orchestrator type system                     | ✅     | `OrchestratorEvent` union with all 5 patterns + custom events    |
| 4.2 | Base orchestrator (`BaseOrchestrator`)       | ✅     | `sortedAgents`, `buildMessages`, `collectAgentRun`, `synthesize` |
| 4.3 | Sequential orchestrator                      | ✅     | Agents run one after another                                     |
| 4.4 | Parallel orchestrator                        | ✅     | Agents run simultaneously, outputs synthesized                   |
| 4.5 | Supervisor orchestrator                      | ✅     | Coordinator plans → workers execute → coordinator synthesizes    |
| 4.6 | Debate orchestrator                          | ✅     | Multi-round debate with moderator synthesis                      |
| 4.7 | GroupChat orchestrator                       | ✅     | Turn-based conversation until consensus                          |
| 4.8 | Group stream endpoint (`/api/groups/stream`) | ✅     | SSE streaming for all 5 patterns                                 |
| 4.9 | Pattern selector in UI                       | ✅     | Dropdown in `AgentGroupBuilder` with descriptions + role hints   |

**Sub-tasks for 4.1 (Type System):**

- 4.1.1 Expand `OrchestrationPattern` to 5 values ✅
- 4.1.2 Add supervisor events (`supervisor_start`, `supervisor_plan`, etc.) ✅
- 4.1.3 Add debate events (`debate_start`, `debate_round`) ✅
- 4.1.4 Add groupchat events (`groupchat_start`, `groupchat_turn`) ✅
- 4.1.5 Ensure `groupId` on all events ✅

**Deferred from Sprint 4:**

- 4.10 Pattern visualizer UI (live graph of agent interactions) ⬜
- 4.11 Auto-manager (hierarchical agent tree) ⬜
- 4.12 Human-in-the-loop checkpoints ⬜

---

## Sprint 5: Cloud Provider Credentials (COMPLETE ✅)

**Sprint Goal:** OAuth-based cloud LLM provider integration.

| #   | Task                             | Status | Notes                                                   |
| --- | -------------------------------- | ------ | ------------------------------------------------------- |
| 5.1 | Provider credentials schema      | ✅     | `provider_credentials` table with OAuth fields          |
| 5.2 | Provider credentials tRPC router | ✅     | CRUD for API keys and OAuth tokens                      |
| 5.3 | Settings page (`/settings`)      | ✅     | Routes + sidebar nav                                    |
| 5.4 | Provider settings UI             | ✅     | `ProviderSettings.tsx`                                  |
| 5.5 | Cloud provider implementations   | ✅     | Anthropic, OpenAI, Gemini, Moonshot                     |
| 5.6 | Runtime credential lookup        | ✅     | `providerRegistry.loadUserCredentials()` in chat stream |

---

## Sprint 6: Chat Polish (HISTORICAL SNAPSHOT — COMPLETE IN `TODO.md`)

**Sprint Goal:** Close chat parity gaps for daily-use quality.

| #   | Task                         | Status | Priority | Notes                                                            |
| --- | ---------------------------- | ------ | -------- | ---------------------------------------------------------------- |
| 6.1 | Vision / image input in chat | ⬜     | P1       | Upload image → include base64/URL in message → model vision call |
| 6.2 | Pin conversations            | ⬜     | P2       | `chatSessions.pinned` boolean + pin button + pinned section      |
| 6.3 | Message feedback (👍/👎)     | ⬜     | P2       | `messages.feedback` enum + thumb buttons + analytics             |
| 6.4 | Hotkey support               | ⬜     | P2       | `Cmd+K` new chat, `Esc` stop generation, `↑` edit last message   |
| 6.5 | Mermaid diagram rendering    | ⬜     | P2       | Detect ` ```mermaid ` blocks → render with `mermaid.js`          |

**Sub-tasks for 6.1 (Vision):**

- 6.1.1 Update `Message` schema to support image content (array of `{type, text/image_url}`)
- 6.1.2 Image upload button in `ChatInput` (reuse file upload flow)
- 6.1.3 Update `AgentRuntime` to pass image URLs to provider `streamChat`
- 6.1.4 Update `ChatMessage` to render image attachments
- 6.1.5 Add `vision` capability tag to models + filter in `ModelSelector`

**Sub-tasks for 6.4 (Hotkeys):**

- 6.4.1 `useHotkeys` hook with `document` listener
- 6.4.2 `Cmd/Ctrl+K` → focus chat input / new chat
- 6.4.3 `Escape` → abort generation
- 6.4.4 `↑` (when input empty) → edit last user message

---

## Sprint 7: KB Advanced Features

**Sprint Goal:** Move RAG from functional to excellent.

| #   | Task                          | Status | Priority | Notes                                                               |
| --- | ----------------------------- | ------ | -------- | ------------------------------------------------------------------- |
| 7.1 | Hybrid search (BM25 + vector) | ⬜     | P1       | `pg_trgm` + `tsvector` for keyword + vector fusion                  |
| 7.2 | Inline citation UI            | ⬜     | P1       | Sources panel showing retrieved chunks per response                 |
| 7.3 | Agent VFS mount               | ⬜     | P1       | KB documents exposed as `docs/<kb>/<doc>` paths to `read_file` tool |
| 7.4 | Reranking                     | ⬜     | P2       | Cross-encoder reranker (local via Ollama or small model)            |
| 7.5 | KB health dashboard           | ⬜     | P2       | Document count, chunk count, index status per KB                    |

**Sub-tasks for 7.1 (Hybrid Search):**

- 7.1.1 Add `tsvector` column to `document_chunks` or use `to_tsvector` inline
- 7.1.2 Create `search_document_chunks` SQL function for Reciprocal Rank Fusion
- 7.1.3 Update `knowledgeBases.query` to use hybrid scoring
- 7.1.4 Add hybrid toggle in KB search UI

**Sub-tasks for 7.3 (Agent VFS):**

- 7.3.1 Create `vfs_resolve` helper: map `docs/<kb>/<doc>` → chunk content
- 7.3.2 Update `read_file` tool to check VFS paths before filesystem
- 7.3.3 Inject VFS root listing into agent system prompt when KB mounted

---

## Sprint 8: Memory Advanced Features

**Sprint Goal:** Make memory reliable at scale.

| #   | Task                       | Status | Priority | Notes                                                            |
| --- | -------------------------- | ------ | -------- | ---------------------------------------------------------------- |
| 8.1 | Context window management  | ⬜     | P1       | Token counting + smart pruning (summarize oldest turns)          |
| 8.2 | Memory semantic search     | ⬜     | P2       | Embed memory entries + similarity search                         |
| 8.3 | Memory confidence decay    | ⬜     | P2       | Lower confidence of old/unused memories; archive below threshold |
| 8.4 | Memory merge/deduplication | ⬜     | P2       | Detect similar keys → merge values or prompt user                |

**Sub-tasks for 8.1 (Context Window):**

- 8.1.1 Token counting utility (tiktoken or Ollama `/api/tokenize`)
- 8.1.2 `estimateTokenCount(messages)` helper
- 8.1.3 Pruning strategy: keep system prompt + recent N messages + summarized older context
- 8.1.4 `summarizeConversation()` helper using lightweight model call
- 8.1.5 Integrate pruning into `/api/chat/stream` before `agent.run()`

---

## Sprint 9: Orchestration Polish

**Sprint Goal:** Visualize and control multi-agent flows.

| #   | Task                               | Status | Priority | Notes                                                                          |
| --- | ---------------------------------- | ------ | -------- | ------------------------------------------------------------------------------ |
| 9.1 | Pattern visualizer UI              | ⬜     | P1       | Live graph showing agent nodes, edges, and message flow during group execution |
| 9.2 | Orchestrator event stream handling | ⬜     | P1       | `ChatInterface` renders supervisor/debate/groupchat events meaningfully        |
| 9.3 | Human-in-the-loop checkpoints      | ⬜     | P2       | Supervisor/debate can pause for approval at critical points                    |
| 9.4 | Auto-manager (hierarchical)        | ⬜     | P2       | Dynamic agent spawning based on task decomposition                             |

**Sub-tasks for 9.1 (Visualizer):**

- 9.1.1 Design node/edge data structure from `OrchestratorEvent` stream
- 9.1.2 Build `OrchestratorGraph` component (SVG or canvas-based)
- 9.1.3 Real-time node state updates (idle → running → complete)
- 9.1.4 Collapsible detail panel per node (input/output/logs)

---

## Sprint 10: MCP & Extensibility

**Sprint Goal:** External tool ecosystem.

| #    | Task                      | Status | Priority | Notes                                                     |
| ---- | ------------------------- | ------ | -------- | --------------------------------------------------------- |
| 10.1 | MCP client (stdio + HTTP) | 🔧     | P0       | `MCPClient` class exists in `agent-runtime`; needs wiring |
| 10.2 | MCP marketplace UI        | ⬜     | P1       | Install/configure/remove MCP servers                      |
| 10.3 | MCP tool registration     | ⬜     | P1       | MCP tools dynamically added to `globalToolRegistry`       |
| 10.4 | Tool manifest system      | ⬜     | P1       | JSON schema for tool declarations + permissions           |
| 10.5 | A2A protocol gateway      | ⬜     | P1       | HTTP endpoint for cross-agent communication               |
| 10.6 | A2A agent discovery       | ⬜     | P2       | Service registry for discoverable agents                  |
| 10.7 | Code execution sandbox    | ⬜     | P2       | Docker-based sandbox for `execute_code` tool              |
| 10.8 | Trust engine              | ⬜     | P2       | Capability-based permissions per tool execution           |

**Sub-tasks for 10.1 (MCP Client):**

- 10.1.1 `MCPClient` stdio transport (already exported from `agent-runtime`) 🔧
- 10.1.2 `MCPClient` HTTP/SSE transport
- 10.1.3 Persist MCP server configs in DB
- 10.1.4 Health check + auto-reconnect

---

## Sprint 11: API & Integration Layer

**Sprint Goal:** Make AgentHub programmable.

| #    | Task                                           | Status | Priority | Notes                                                        |
| ---- | ---------------------------------------------- | ------ | -------- | ------------------------------------------------------------ |
| 11.1 | OpenAI-compatible API (`/v1/chat/completions`) | ⬜     | P2       | Proxy to `AgentRuntime` with OpenAI request/response format  |
| 11.2 | API key management                             | ⬜     | P2       | `api_keys` table + middleware + scoped permissions           |
| 11.3 | Webhook system                                 | ⬜     | P2       | Agent/group completion webhooks for external integrations    |
| 11.4 | Data export                                    | ⬜     | P2       | ZIP export: agents.json, sessions.jsonl, memory.json, files/ |
| 11.5 | Data import                                    | ⬜     | P2       | Import ZIP or individual JSON files                          |

---

## Sprint 12: Polish & Production Readiness

**Sprint Goal:** UI/UX parity and deployment readiness.

| #    | Task                          | Status | Priority | Notes                                                  |
| ---- | ----------------------------- | ------ | -------- | ------------------------------------------------------ |
| 12.1 | Dark mode toggle              | 🔧     | P1       | `ThemeProvider` exists; toggle not wired               |
| 12.2 | i18n framework + 3 languages  | ⬜     | P2       | `next-intl` or similar; English, Chinese, Japanese     |
| 12.3 | PWA manifest + service worker | ⬜     | P2       | `next-pwa` or manual manifest                          |
| 12.4 | Token tracking dashboard      | ⬜     | P2       | Aggregate `tokensUsed` + latency per session/agent     |
| 12.5 | Mobile responsive pass        | ⬜     | P2       | Sidebar collapse, touch targets, font scaling          |
| 12.6 | Admin panel                   | ⬜     | P2       | `adminProcedure` exists; needs UI for user management  |
| 12.7 | Role-based access enforcement | ⬜     | P2       | `role` enum + `adminProcedure` guards; no admin UI yet |
| 12.8 | Performance metrics           | ⬜     | P2       | Tok/s, latency, TTFT dashboard                         |

---

## Dependency Graph

```
Sprint 0 (Foundation)
    │
    ├──► Sprint 1 (Chat Core) ──► Sprint 6 (Chat Polish)
    │                                 │
    ├──► Sprint 2 (KB RAG) ───────► Sprint 7 (KB Advanced)
    │                                 │
    ├──► Sprint 3 (Memory) ───────► Sprint 8 (Memory Advanced)
    │                                 │
    ├──► Sprint 4 (Orchestration) ─► Sprint 9 (Orchestration Polish)
    │                                 │
    ├──► Sprint 5 (Providers) ─────► Sprint 11 (API Layer)
    │                                 │
    └──► Sprint 10 (MCP/Ext) ─────► Sprint 12 (Polish)
```

**Key Dependencies:**

- Sprint 6 requires Sprint 1
- Sprint 7 requires Sprint 2
- Sprint 8 requires Sprint 3
- Sprint 9 requires Sprint 4
- Sprint 10 is largely independent but benefits from Sprint 4 (orchestrator tools)
- Sprint 11 benefits from all prior sprints
- Sprint 12 is final polish pass

---

## Completed Feature Count

| Sprint                  | Features                | Status                 |
| ----------------------- | ----------------------- | ---------------------- |
| Sprint 0: Foundation    | 13/13                   | ✅ 100%                |
| Sprint 1: Chat Core     | 5/5                     | ✅ 100%                |
| Sprint 2: KB RAG        | 7/11                    | ✅ Core complete (64%) |
| Sprint 3: Memory        | 5/8                     | ✅ Core complete (63%) |
| Sprint 4: Orchestration | 9/12                    | ✅ Core complete (75%) |
| Sprint 5: Providers     | 6/6                     | ✅ 100%                |
| **Total Shipped**       | **45/55 core features** | **✅ 82%**             |

---

## Next Recommended Sprint

**Sprint 6: Chat Polish** — Vision input is the highest-impact remaining chat feature. It unlocks multimodal use cases (screenshots, diagrams, photos) and is expected in any modern chat UI. Estimated 1–2 days of work.

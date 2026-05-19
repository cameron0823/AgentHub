# Master Implementation Plan: AgentHub

> **Version:** 2.0  
> **Status:** Archived planning snapshot. `TODO.md` is the canonical current tracker.
> **Target:** Full feature parity with LobeHub, 100% local-first, zero mandatory cloud dependencies  
> **Timeline:** 16 Weeks (Phased Rollout)  
> **Team Size:** 1-3 developers (scales with contributors)
> **Completion note (2026-05-15):** Current execution plans through Sprint 12 and Phase 32 are complete; unchecked historical rows below are not the active backlog.

---

## Executive Summary

AgentHub is a **local-first, privacy-preserving AI agent platform** that replicates LobeHub's full feature set using only free, open-source, self-hosted technologies. Every AI inference runs locally via Ollama. Every feature — from multi-agent collaboration to voice conversations to image generation — has a local, zero-cost equivalent.

**Key Differentiator:** Unlike LobeHub (cloud-first with local as optional), AgentHub is **local-first by design**. Cloud providers are opt-in, never required.

---

## Phase 1: Foundation & Core AI (Weeks 1-4)

> **Goal:** Establish the runtime, data layer, and universal AI adapter. Deliver a working chat interface with local LLMs.

### 1.1 Project Bootstrap

**Tasks:**

- [ ] Initialize Turborepo monorepo structure
- [ ] Configure Next.js 14 with App Router + tRPC
- [ ] Set up TypeScript strict mode, ESLint, Prettier
- [ ] Configure Tailwind CSS + shadcn/ui base components
- [ ] Set up Drizzle ORM with SQLite (`better-sqlite3`)
- [ ] Create base schema (users, sessions, messages)
- [ ] Implement Zustand store with slice pattern

**Acceptance Criteria:**

- `pnpm dev` starts the app on `localhost:3000`
- SQLite database auto-creates at `./data/agenthub.db`
- TypeScript compiles with zero errors (strict mode)

**Estimated Effort:** 3 days

### 1.2 AI Provider Abstraction Layer

**Tasks:**

- [ ] Design `ModelProvider` interface (`listModels`, `healthCheck`, `chat`, `streamChat`, `embed`)
- [ ] Implement `OllamaProvider` (primary)
  - Auto-discovery: ping `localhost:11434` on app start
  - Model listing via `/api/tags`
  - Streaming chat via `/api/chat`
  - Embeddings via `/api/embeddings`
- [ ] Implement `LMStudioProvider` (secondary)
- [ ] Implement `VLLMProvider` (secondary)
- [ ] Create `ProviderRegistry` with health check dashboard
- [ ] Build model selector UI with availability indicators

**Acceptance Criteria:**

- App detects Ollama automatically; shows "Ollama Connected" badge
- User can select any downloaded Ollama model from dropdown
- Chat streams token-by-token with < 2s time-to-first-token
- Mid-conversation model switching works without data loss

**Estimated Effort:** 5 days

### 1.3 Core Chat Interface

**Tasks:**

- [ ] Build React Router SPA shell (sidebar + main panel)
- [ ] Implement message list with virtualization (`react-window`)
- [ ] Build chat input with send button, keyboard shortcuts
- [ ] Implement SSE streaming consumer
- [ ] Add optimistic message updates
- [ ] Message rendering: Markdown, code blocks, inline math
- [ ] Session management: create, rename, delete, list
- [ ] SQLite persistence for all messages

**Acceptance Criteria:**

- User can send a message and receive a streamed response
- Messages persist across page reloads
- 50+ messages in a session scroll smoothly
- Code blocks have syntax highlighting

**Estimated Effort:** 5 days

### 1.4 Tool Calling Foundation

**Tasks:**

- [ ] Implement OpenAI-compatible tool schema
- [ ] Build `ToolRouter` for dispatching tool calls
- [ ] Implement built-in tools:
  - `calculator` (mathjs)
  - `datetime` (native)
  - `read_file` (Node.js fs, sandboxed path)
- [ ] Tool call detection from LLM output (Ollama supports tool calling in recent versions)
- [ ] Tool result injection back into conversation context
- [ ] UI: render tool calls as expandable cards

**Acceptance Criteria:**

- LLM can use calculator tool when asked math questions
- Tool calls display in UI with arguments and results
- Tool execution timeout after 30s

**Estimated Effort:** 4 days

### 1.5 Phase 1 Milestone

**Deliverable:** Working single-user chat app with local LLMs, basic tools, and session persistence.

**Sprint Demo:**

1. Start app with no configuration
2. Ollama auto-detected, model list populated
3. Send messages, get streamed responses
4. Ask "What's 123 \* 456?" — LLM uses calculator tool
5. Reload page — conversation history intact

---

## Phase 2: Agent System & Orchestration (Weeks 5-8)

> **Goal:** Enable multi-agent collaboration, agent marketplace, and white-box memory.

### 2.1 Agent Builder

**Tasks:**

- [ ] Design agent configuration schema
- [ ] Build 3-step wizard UI (Basics → Persona → Capabilities)
- [ ] System prompt editor with template variables
- [ ] Model/temperature selector per agent
- [ ] Tool assignment per agent
- [ ] Avatar upload / generation (ComfyUI integration placeholder)
- [ ] Agent persistence in SQLite
- [ ] Agent list sidebar with search/filter

**Acceptance Criteria:**

- User creates a "Python Tutor" agent with custom system prompt
- Agent appears in sidebar; clicking it starts a new session with that agent
- Agent's system prompt is injected into every message in that session

**Estimated Effort:** 4 days

### 2.2 Multi-Agent Orchestration (Agent Groups)

**Tasks:**

- [ ] Design `Orchestrator` abstraction
- [ ] Implement `SupervisorExecutorOrchestrator`
- [ ] Implement `ParallelOrchestrator`
- [ ] Implement `SequentialOrchestrator`
- [ ] Implement `DebateOrchestrator`
- [ ] Build visual workflow designer (`react-flow`)
- [ ] Group execution UI: show each agent's progress, outputs, and final synthesis
- [ ] Persist group runs as special session types

**Acceptance Criteria:**

- User creates a group: "Code Review Team" (supervisor + 2 reviewers)
- User submits code; supervisor delegates, reviewers analyze in parallel
- Final synthesized review displayed with individual reviewer outputs accessible

**Estimated Effort:** 7 days

### 2.3 White-Box Memory System

**Tasks:**

- [ ] Design memory schema (fact, preference, goal, context categories)
- [ ] Build memory extraction pipeline (post-session LLM call)
- [ ] Implement memory deduplication via embedding similarity
- [ ] Build Memory Editor UI (view all memories, edit, delete)
- [ ] Memory injection into system prompt at session start
- [ ] User approval flow for proposed new memories

**Acceptance Criteria:**

- After 3 conversations about Python, agent "remembers" user codes in Python
- Memory entry visible in Memory Editor: "User is a Python developer" (confidence: 0.92)
- User edits memory to "User is a Python developer learning Rust"
- Next session, agent acknowledges both Python and Rust interest

**Estimated Effort:** 5 days

### 2.4 Agent Marketplace

**Tasks:**

- [ ] Design agent manifest schema (JSON)
- [ ] Create `agenthub-marketplace` GitHub repo structure
- [ ] Build marketplace index (`agents.json`)
- [ ] Implement import flow: fetch JSON → validate → insert to DB
- [ ] Implement export flow: serialize agent → generate JSON
- [ ] Marketplace browser UI (grid, search, categories, preview)
- [ ] Seed with 10 pre-built agents (Coder, Writer, Researcher, etc.)

**Acceptance Criteria:**

- User browses marketplace, finds "Travel Planner" agent
- One-click import; agent appears in sidebar
- User exports custom agent as JSON, file is valid and shareable

**Estimated Effort:** 4 days

### 2.5 Phase 2 Milestone

**Deliverable:** Multi-agent collaboration, persistent agent configurations, white-box memory, and marketplace infrastructure.

**Sprint Demo:**

1. Create "Debate Club" group with two debaters and a judge
2. Submit topic: "Should AI be regulated?"
3. Watch real-time debate with individual agent outputs
4. Judge delivers verdict
5. Check Memory Editor — new facts extracted from conversation

---

## Phase 3: Extensibility & Knowledge Base (Weeks 9-10)

> **Goal:** Connect to external data and tools. Enable file uploads, RAG, and MCP plugins.

### 3.1 MCP Plugin System

**Tasks:**

- [ ] Implement MCP transport abstractions (stdio, SSE)
- [ ] Build MCP client lifecycle (connect → initialize → discover → execute)
- [ ] Create MCP server manager UI (add, edit, remove, status)
- [ ] Implement tool call routing to MCP servers
- [ ] Security: sandboxed execution, user approval for destructive tools
- [ ] Curated MCP server registry (filesystem, postgres, browser, etc.)
- [ ] One-click install from registry

**Acceptance Criteria:**

- User adds filesystem MCP server, configures allowed directory
- LLM can read files from allowed directory via natural language
- User sees approval dialog before any file write operation
- MCP server status shown as "Active" with green indicator

**Estimated Effort:** 6 days

### 3.2 Knowledge Base & RAG

**Tasks:**

- [ ] Integrate LanceDB (embedded vector store)
- [ ] Build document ingestion pipeline:
  - Format detection (PDF, DOCX, TXT, MD, HTML, CSV)
  - Text extraction (`pdf-parse`, `mammoth.js`, readability)
  - OCR for images (`tesseract.js`)
  - Chunking (recursive character, configurable size/overlap)
  - Embedding generation (Ollama `nomic-embed-text`)
- [ ] Implement hybrid search (SQLite FTS5 + LanceDB vector + RRF)
- [ ] Build knowledge base manager UI
- [ ] Document upload with progress indicator
- [ ] Search tester UI (debug retrieval quality)
- [ ] KB context injection into agent conversations

**Acceptance Criteria:**

- User uploads 50-page PDF; ingestion completes in < 60s
- User asks "What's our refund policy?" — answer grounded in PDF
- Hybrid search returns relevant chunks with similarity scores
- KB can be linked/unlinked from agents dynamically

**Estimated Effort:** 6 days

### 3.3 File Upload & Artifacts Foundation

**Tasks:**

- [ ] Implement file upload endpoint (multipart/form-data)
- [ ] File type validation and size limits
- [ ] Local filesystem storage (or MinIO if configured)
- [ ] File display in chat (images inline, files as attachments)
- [ ] Basic artifact detection in LLM output

**Acceptance Criteria:**

- User drags image into chat; image displays inline
- User uploads PDF; PDF is stored and can be added to KB
- File size limit enforced (50MB default)

**Estimated Effort:** 2 days

### 3.4 Phase 3 Milestone

**Deliverable:** Full plugin ecosystem via MCP, working knowledge base with RAG, file uploads.

**Sprint Demo:**

1. Install filesystem MCP server
2. Upload company handbook PDF to knowledge base
3. Ask "What's our vacation policy?" — get accurate, grounded answer
4. Ask "List files in my Documents folder" — MCP tool executes

---

## Phase 4: UI/UX & Advanced Features (Weeks 11-12)

> **Goal:** Polish and interactivity. Branching, CoT, Artifacts, Voice, PWA, Themes.

### 4.1 Branching Conversations

**Tasks:**

- [ ] Add `parent_id` to messages schema
- [ ] Implement tree data structure for sessions
- [ ] Build "Fork Thread" action on any message
- [ ] Implement continuation vs. standalone fork modes
- [ ] Build branch visualization panel (Git-like graph with `react-flow` or D3)
- [ ] Branch switching UI (dropdown or sidebar)

**Acceptance Criteria:**

- User forks conversation at message 5; new branch created
- User explores different direction in new branch
- Can switch back to original branch; original context preserved
- Tree visualization shows all branches clearly

**Estimated Effort:** 4 days

### 4.2 Chain of Thought Visualization

**Tasks:**

- [ ] Detect reasoning tags (`<think>`, ` reasoning_content`)
- [ ] Separate reasoning stream from main content stream
- [ ] Build collapsible "Thinking..." panel
- [ ] Support per-model reasoning formats (DeepSeek R1, QwQ, etc.)
- [ ] Store reasoning in `Message.reasoning` field

**Acceptance Criteria:**

- DeepSeek R1 response shows "Thinking..." panel with reasoning steps
- Panel is collapsible; defaults to collapsed after first view
- Reasoning persisted and viewable when reloading page

**Estimated Effort:** 2 days

### 4.3 Artifacts Support

**Tasks:**

- [ ] Implement artifact parser for markdown blocks
- [ ] Build artifact renderers:
  - Code: `react-syntax-highlighter`
  - React: `react-live` in sandboxed iframe
  - SVG: Inline with DOMPurify sanitization
  - HTML: iframe with CSP + sandbox
  - Mermaid: `mermaid.js`
- [x] Artifact toolbar: copy, download, expand — implemented 2026-05-17 in `packages/ui/src/ArtifactPanel.tsx`
- [x] Artifact gallery sidebar — implemented 2026-05-17 in `apps/web/src/components/ArtifactGallerySidebar.tsx`

**Acceptance Criteria:**

- LLM generates React counter component; renders live and interactive
- LLM generates SVG chart; displays inline
- User can download any artifact as file
- iframe sandbox prevents XSS

**Estimated Effort:** 4 days

### 4.4 Voice System (STT + TTS)

**Tasks:**

- [ ] Integrate Piper TTS (HTTP server wrapper)
  - Voice model download UI
  - TTS synthesis endpoint
  - Audio streaming to Web Audio API
- [ ] Integrate faster-whisper STT (Python service)
  - VAD (Voice Activity Detection) with silero-vad
  - Real-time transcription streaming
  - Push-to-talk and continuous modes
- [ ] Build voice mode UI (mic button, waveform visualization, barge-in)
- [ ] Full-duplex pipeline: STT → LLM → TTS with interruption support

**Acceptance Criteria:**

- User holds mic button, speaks "What's the weather?"
- Speech transcribed in real-time
- LLM responds; response spoken aloud by Piper
- User can interrupt mid-response with new speech

**Estimated Effort:** 5 days

### 4.5 Image Generation & Vision

**Tasks:**

- [ ] Integrate ComfyUI HTTP API
  - Workflow templates (txt2img, img2img, upscale)
  - Queue management and result polling
  - Image display in chat
- [ ] Implement vision tool (LLaVA / Qwen2-VL via Ollama)
  - Image encoding to base64
  - Multimodal chat messages
- [ ] Image upload and analysis in chat

**Acceptance Criteria:**

- User asks "Generate a cat astronaut" — image appears in chat
- User uploads photo, asks "What's in this image?" — LLaVA describes it accurately

**Estimated Effort:** 3 days

### 4.6 PWA & Custom Themes

**Tasks:**

- [ ] Generate `manifest.json` with app metadata
- [ ] Implement service worker with Workbox (offline cache)
- [ ] Build theme engine with CSS variables
- [ ] Preset themes: Light, Dark, Midnight, Solarized, High Contrast
- [ ] Custom color picker with live preview
- [ ] Theme import/export (JSON)

**Acceptance Criteria:**

- App installable as PWA on Chrome/Edge
- Core chat works offline (cached assets + SQLite)
- Theme changes apply instantly without reload
- Custom theme exported and re-importable

**Estimated Effort:** 3 days

### 4.7 Phase 4 Milestone

**Deliverable:** Rich interactive UI with branching, reasoning visualization, artifacts, voice, image generation, and offline PWA support.

**Sprint Demo:**

1. Start voice mode, have full spoken conversation
2. Ask LLM to generate a React todo app — artifact renders live
3. Fork conversation to explore alternative implementation
4. Install as PWA, turn off WiFi — app still works

---

## Phase 5: Deployment & Production (Weeks 13-16)

> **Goal:** Production readiness. Auth, multi-user, Docker, desktop app, security hardening.

### 5.1 Multi-User Authentication

**Tasks:**

- [ ] Integrate Better Auth
  - Email/password login
  - OAuth (GitHub, Google)
  - Magic links
  - MFA (TOTP)
- [ ] Session management
- [ ] User settings persistence
- [ ] Admin panel (user list, quotas)
- [ ] API key generation for OpenAI-compatible endpoint

**Acceptance Criteria:**

- New user can register with email/password
- Existing user can login with GitHub OAuth
- MFA setup works with authenticator app
- Each user sees only their own sessions/agents

**Estimated Effort:** 5 days

### 5.2 Security Hardening

**Tasks:**

- [ ] Implement CSRF protection (Better Auth built-in)
- [ ] XSS prevention: DOMPurify for all rendered content
- [ ] Rate limiting (`next-rate-limiter` or custom)
- [ ] Path traversal prevention for file operations
- [ ] MCP sandbox hardening (readonly defaults, timeouts)
- [ ] Input validation (Zod on all API boundaries)
- [ ] Secure cookie settings
- [ ] Security headers (CSP, HSTS, X-Frame-Options)

**Acceptance Criteria:**

- Penetration testing checklist passes
- MCP server cannot write outside allowed directories
- XSS payload in LLM output is sanitized before rendering
- Rate limit enforced: 100 requests/minute per IP

**Estimated Effort:** 4 days

### 5.3 Docker & Deployment

**Tasks:**

- [ ] Multi-stage Dockerfile (production-optimized)
- [ ] `docker-compose.yml` — minimal (app + SQLite)
- [ ] `docker-compose.full.yml` — full stack (app + Ollama + SearxNG + ComfyUI)
- [ ] `docker-compose.server.yml` — server mode (PostgreSQL + Redis + MinIO)
- [ ] One-line setup script (`curl | bash`)
- [ ] Health check endpoints
- [ ] Log rotation configuration

**Acceptance Criteria:**

- `docker compose up -d` starts full stack in < 5 minutes
- App health check returns 200 at `/api/health`
- Logs rotate daily, retain 7 days
- Setup script works on Ubuntu 22.04, macOS 14, Windows 11 (WSL)

**Estimated Effort:** 4 days

### 5.4 Desktop Application

**Tasks:**

- [ ] Set up Electron project structure
- [ ] Implement main window with Next.js app loaded
- [ ] Native menu bar (File, Edit, View, Window)
- [ ] Keyboard shortcuts (Ctrl/Cmd+N new chat, Ctrl/Cmd+K command palette)
- [ ] Auto-updater (electron-updater)
- [ ] System tray icon
- [ ] Native notifications
- [ ] Build pipeline: `electron-builder` for macOS, Linux, Windows

**Acceptance Criteria:**

- Desktop app runs without browser
- Native keyboard shortcuts work
- Auto-update checks on startup
- App packages for all three platforms via CI

**Estimated Effort:** 5 days

### 5.5 Documentation & Polish

**Tasks:**

- [ ] Write comprehensive README with quick start
- [ ] API documentation (OpenAPI spec)
- [ ] User guide (markdown docs site)
- [ ] Developer guide (contributing, architecture)
- [ ] Changelog and versioning
- [ ] Final bug bash and performance optimization
- [ ] E2E tests with Playwright (critical flows)

**Acceptance Criteria:**

- New developer can set up project in < 10 minutes
- All critical user flows have E2E tests
- Lighthouse score > 90 on all metrics
- Zero critical/high security vulnerabilities

**Estimated Effort:** 5 days

### 5.6 Phase 5 Milestone

**Deliverable:** Production-ready application deployable via Docker or Desktop, with auth, security, and comprehensive documentation.

**Sprint Demo:**

1. Run setup script on fresh Ubuntu VM
2. Register new user account
3. Enable MFA
4. Generate API key; use with `curl` to OpenAI-compatible endpoint
5. Package desktop app; install and run

---

## Risk Register

| Risk                                            | Probability | Impact | Mitigation                                                                    | Owner         |
| ----------------------------------------------- | ----------- | ------ | ----------------------------------------------------------------------------- | ------------- |
| Ollama tool calling unreliable for small models | High        | Medium | Fallback to prompt-based tool calling; recommend 14B+ models for agents       | Core Team     |
| Local models too slow on CPU-only hardware      | High        | Medium | Quantization advisor in UI; recommend GPU; cloud provider fallback            | Core Team     |
| MCP security vulnerabilities                    | Medium      | High   | Sandboxed execution; readonly defaults; user approval; audit logging          | Security Lead |
| Large model downloads frustrate users           | Medium      | Low    | Model size advisor; progressive download UI; small model defaults             | UX Lead       |
| CRDT sync complexity                            | Low         | Medium | Make sync optional; use proven library (Electric SQL); simple data structures | Core Team     |
| Electron bundle size too large                  | Medium      | Low    | Code splitting; lazy loading; remove unused dependencies                      | Core Team     |
| Embedding generation bottlenecks RAG            | Medium      | Medium | Batch embeddings; caching; smaller embed models by default                    | Core Team     |

---

## Success Metrics

| #   | Metric                  | Target                                          | Measurement      |
| --- | ----------------------- | ----------------------------------------------- | ---------------- |
| 1   | **Model Agnosticism**   | Swap Ollama → LM Studio without restart         | Integration test |
| 2   | **Memory Recall**       | Retrieve user preference after 10 conversations | Manual QA        |
| 3   | **RAG Latency**         | < 2 seconds for 100-document KB                 | Benchmark        |
| 4   | **Deployment Time**     | App usable in < 5 minutes via Docker            | Timer test       |
| 5   | **Offline Capability**  | Core chat works without internet                | Manual QA        |
| 6   | **Zero API Cost**       | $0 spent on LLM inference for 1000 messages     | Cost tracking    |
| 7   | **Time to First Token** | < 2 seconds (7B model, GPU)                     | Benchmark        |
| 8   | **Voice Latency**       | < 500ms end-to-end (STT → TTS)                  | Benchmark        |

---

## Immediate Next Steps (Sprint 1 — Week 1)

1. **Day 1-2:** Bootstrap monorepo, Next.js, Tailwind, shadcn/ui
2. **Day 3:** Set up Drizzle ORM + SQLite schema
3. **Day 4-5:** Implement `OllamaProvider` with streaming
4. **Day 6-7:** Build chat UI shell with message list and input
5. **Day 8:** Implement SSE streaming endpoint
6. **Day 9-10:** Wire frontend → backend → Ollama; end-to-end chat works

**Definition of Done for Sprint 1:**

- Repository builds without errors
- `pnpm dev` starts app
- User can send message → Ollama responds → streamed to UI → persisted in SQLite

---

## Resource Requirements

### Development Hardware

| Role               | Minimum              | Recommended           |
| ------------------ | -------------------- | --------------------- |
| Frontend Developer | 16 GB RAM, any GPU   | 32 GB RAM             |
| Backend Developer  | 16 GB RAM, any GPU   | 32 GB RAM             |
| AI/ML Engineer     | 32 GB RAM, 8 GB VRAM | 64 GB RAM, 24 GB VRAM |
| QA/Testing         | 16 GB RAM            | 32 GB RAM             |

### Recommended Test Hardware Tiers

| Tier           | Hardware               | Capable Models    |
| -------------- | ---------------------- | ----------------- |
| **Entry**      | 8 GB RAM, CPU only     | 3B-7B quantized   |
| **Consumer**   | 16 GB RAM, 8 GB VRAM   | 7B-14B quantized  |
| **Enthusiast** | 32 GB RAM, 16 GB VRAM  | 14B-32B quantized |
| **Pro**        | 64 GB RAM, 24+ GB VRAM | 32B-70B quantized |

---

## Dependencies & External Services

### Required (Free, Open Source)

| Service        | Purpose          | License    |
| -------------- | ---------------- | ---------- |
| Ollama         | LLM inference    | MIT        |
| Node.js        | Runtime          | MIT        |
| Next.js        | Web framework    | MIT        |
| Tailwind CSS   | Styling          | MIT        |
| shadcn/ui      | UI components    | MIT        |
| Drizzle ORM    | Database ORM     | Apache 2.0 |
| better-sqlite3 | SQLite driver    | MIT        |
| Zustand        | State management | MIT        |
| tRPC           | API layer        | MIT        |
| Zod            | Validation       | MIT        |

### Optional (Free, Open Source)

| Service        | Purpose          | License            |
| -------------- | ---------------- | ------------------ |
| SearxNG        | Web search       | AGPL               |
| ComfyUI        | Image generation | GPL                |
| Piper TTS      | Text-to-speech   | MIT                |
| faster-whisper | Speech-to-text   | MIT                |
| LanceDB        | Vector database  | Apache 2.0         |
| PostgreSQL     | Server database  | PostgreSQL License |
| Redis          | Cache/sessions   | BSD                |
| MinIO          | Object storage   | AGPL               |

### Optional Cloud (User Opt-In Only)

| Service       | Purpose              | Cost        |
| ------------- | -------------------- | ----------- |
| OpenAI API    | Cloud LLM fallback   | Pay per use |
| Anthropic API | Cloud LLM fallback   | Pay per use |
| Groq          | Fast cloud inference | Pay per use |

---

## Communication Plan

| Channel            | Purpose                       | Frequency     |
| ------------------ | ----------------------------- | ------------- |
| GitHub Issues      | Bug reports, feature requests | Ongoing       |
| GitHub Discussions | Architecture decisions, Q&A   | Ongoing       |
| Discord            | Community chat, quick help    | Daily         |
| Weekly Standup     | Progress, blockers            | Weekly        |
| Milestone Review   | Demo, retrospective           | Every 4 weeks |

---

**Document Version History:**

| Version | Date       | Author          | Changes                                                                                                          |
| ------- | ---------- | --------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-05-02 | Initial         | First draft based on LobeHub analysis                                                                            |
| 2.0     | 2026-05-05 | Research Update | Refined for local-first architecture; added free AI stack mappings; added risk register; updated success metrics |

---

## Updated Phase Details: All Required Features Explicitly Scheduled

> **Audit Date:** 2026-05-05  
> **This section ensures every feature from the requirements audit is explicitly scheduled before code is written.**

---

## Phase 2 Additions: Advanced Agent System (Weeks 5-8)

### 2.1 Workspace Isolation System _(New — Requirement 1.2)_

**Tasks:**

- [ ] Design workspace entity with strict data silo rules
- [ ] Implement workspace-scoped database queries (SQLite row-level filtering)
- [ ] Per-workspace model binding (different LLM per workspace)
- [ ] Per-workspace embedding collections (separate LanceDB namespaces)
- [ ] Per-workspace document storage (isolated directories)
- [ ] Cross-workspace access control (RBAC: owner, editor, viewer)
- [ ] Workspace switcher UI with visual isolation indicators

**Acceptance Criteria:**

- Workspace A cannot see Workspace B's sessions, agents, or documents
- Each workspace can use a different default model
- User with "viewer" role cannot create or delete content
- Workspace deletion cascades all associated data

**Estimated Effort:** 3 days  
**Scheduled:** Week 5 (concurrent with Agent Builder)

---

### 2.5 Code Execution Sandbox _(New — Requirement 2.2)_

**Tasks:**

- [ ] Implement Deno subprocess sandbox (JS/TS, no network)
- [ ] Implement Docker container sandbox (Python, Rust, Go)
- [ ] Build iterative coding loop: write → execute → test → debug
- [ ] Agent debate pattern for code review (critic agent reviews, author revises)
- [ ] Sandbox resource limits (CPU, memory, time)
- [ ] UI: code editor, test output panel, execution status

**Acceptance Criteria:**

- Agent writes Python function → executes in Docker → sees output → fixes bug
- Critic agent identifies issue → original agent revises → passes tests
- Sandbox prevents network access by default
- Infinite loop killed after 60-second timeout

**Estimated Effort:** 3 days  
**Scheduled:** Week 6 (concurrent with Multi-Agent Orchestration)

---

### 2.6 Hierarchical Process Mode with Auto-Manager _(Enhanced — Requirement 2.1)_

**Tasks:**

- [ ] Implement auto-manager generation (LLM prompt creates manager persona)
- [ ] Manager agent task decomposition logic
- [ ] Worker agent role taxonomy (specialist, reviewer, validator)
- [ ] Review loop: manager reviews worker outputs before synthesis
- [ ] Hierarchical visualization (tree view of delegation)

**Acceptance Criteria:**

- User creates group with 3 workers, no manager specified
- System auto-generates manager agent with planning/review capabilities
- Manager breaks "build a website" into: design, frontend, backend
- Manager reviews each worker's output and requests revisions
- Final synthesized result approved by manager

**Estimated Effort:** 2 days  
**Scheduled:** Week 7 (concurrent with Memory System)

---

### 2.7 GroupChat Conversation-Driven Orchestration _(New — Requirement 2.2)_

**Tasks:**

- [ ] Implement round-robin speaking protocol
- [ ] Consensus detection (agents agree on answer)
- [ ] Natural language turn-taking (not rigid graph execution)
- [ ] Moderator agent (keeps conversation on track)
- [ ] Topic drift detection and correction

**Acceptance Criteria:**

- 3 agents discuss "best database for this project"
- Each agent speaks in turn, referencing previous points
- Conversation continues until consensus or max rounds
- Moderator intervenes if agents go off-topic

**Estimated Effort:** 2 days  
**Scheduled:** Week 7 (concurrent with Memory System)

---

## Phase 3 Additions: Extensibility & A2UI (Weeks 9-10)

### 3.4 A2UI: Agent-to-User Interface Standard _(New — Requirement 2.3)_

**Tasks:**

- [ ] Define A2UI JSON schema (form, table, chart, wizard, card)
- [ ] Build React renderer components for each A2UI type
- [ ] Agent prompting: teach agents to output A2UI JSON in `:::a2ui` blocks
- [ ] Form submission handler (POSTs back to agent for processing)
- [ ] Table sorting/filtering client-side
- [ ] Chart rendering via Recharts
- [ ] Wizard step progression with state persistence

**Acceptance Criteria:**

- Agent returns A2UI table of sales leads → client renders sortable table
- User clicks table row → agent receives action callback
- Agent returns A2UI form → user fills fields → submit → agent processes
- Agent returns A2UI chart → Recharts renders bar chart with data

**Estimated Effort:** 4 days  
**Scheduled:** Week 9 (concurrent with MCP Plugin System)

---

### 3.5 Async Job Queue (BullMQ + Redis) _(New — Requirement 1.3)_

**Tasks:**

- [ ] Set up BullMQ with Redis broker
- [ ] Implement ingest worker (PDF → chunks → embeddings)
- [ ] Implement agent-flow worker (long-running graph execution)
- [ ] Implement image-gen worker (ComfyUI queue management)
- [ ] Job progress tracking via WebSocket to client
- [ ] Job retry logic with exponential backoff
- [ ] Flower-like dashboard for monitoring queues

**Acceptance Criteria:**

- Upload 100-page PDF → job queued → worker processes in background
- Client sees real-time progress: "Parsing... 45%"
- Worker crash → job resumes from last checkpoint
- Queue dashboard shows active/completed/failed jobs

**Estimated Effort:** 3 days  
**Scheduled:** Week 10 (concurrent with Knowledge Base)

---

## Phase 4 Additions: Protocols & Trust (Weeks 11-12)

### 4.7 A2A Protocol & Agent Communities _(New — Requirement 2.4)_

**Tasks:**

- [ ] Implement A2A capability advertisement endpoint (`/.well-known/a2a/agent.json`)
- [ ] Implement A2A task submission API (`/a2a/tasks/send`)
- [ ] Implement mDNS discovery for local network agents
- [ ] Build agent directory (federated registry)
- [ ] MCP bridge: expose AgentHub agents as MCP server to external clients
- [ ] Cross-framework delegation test: LangGraph → AgentHub → CrewAI

**Acceptance Criteria:**

- AgentHub agent advertises capabilities via A2A protocol
- External LangGraph agent discovers and delegates task to AgentHub agent
- AgentHub can serve as MCP server for Claude/Cursor
- Local network agents auto-discover each other via mDNS

**Estimated Effort:** 4 days  
**Scheduled:** Week 11 (concurrent with Branching/CoT)

---

### 4.8 Trust Engine & Process Isolation _(New — Requirement 3.1)_

**Tasks:**

- [ ] Implement separate Node.js process for Trust Engine
- [ ] Build encrypted credential vault (AES-256-GCM)
- [ ] IPC communication: main process sends tool name + args, receives result
- [ ] Policy engine: which tools need which credentials
- [ ] Audit logging: every credential use logged tamper-evidently
- [ ] Desktop automation: AT-SPI (Linux), AX API (macOS), UIA (Windows)
- [ ] UI permission prompts for accessibility access

**Acceptance Criteria:**

- LLM requests `web_search` → main process sends tool+args to Trust Engine
- Trust Engine injects API key, executes search, returns results
- LLM log contains NO API keys, passwords, or tokens
- Audit log shows: "2026-05-05 10:00:00 | web_search | key_hash=abc123 | success"
- Agent can click a button in Chrome via accessibility API (with user permission)

**Estimated Effort:** 4 days  
**Scheduled:** Week 12 (concurrent with Artifacts/Voice)

---

## Phase 5 Additions: Desktop, Modes & Graphs (Weeks 13-16)

### 5.6 Desktop File Agent _(New — Requirement 3.2)_

**Tasks:**

- [ ] File watcher daemon (chokidar) for configured folders
- [ ] Content analysis pipeline (local OCR + cloud analysis)
- [ ] Rule engine for auto-organize (YAML-based rules)
- [ ] File actions: rename, move, merge, synthesize
- [ ] User approval UI for destructive actions
- [ ] Cloud model integration with data minimization controls

**Acceptance Criteria:**

- User drops PDF into watched folder → agent classifies as "invoice"
- Rule auto-moves to `~/Documents/Invoices/2026/05/`
- User reviews suggested action in notification panel
- CSV files in `Reports/` auto-merged into weekly summary

**Estimated Effort:** 3 days  
**Scheduled:** Week 13 (concurrent with Auth)

---

### 5.7 Mode-First Packaging _(New — Requirement 3.3)_

**Tasks:**

- [ ] Design mode manifest schema (.mode.json)
- [ ] Build mode runtime engine (context isolation, tool filtering)
- [ ] Implement built-in modes: General Chat, Coder, People Search, Researcher, Writer, Data Analyst, DevOps
- [ ] Mode marketplace infrastructure
- [ ] Mode switcher UI (ribbon/tab interface)
- [ ] Mode-specific shortcuts and welcome messages

**Acceptance Criteria:**

- User activates "People Search" mode → UI changes to CRM-focused layout
- Mode has isolated memory — "People Search" contacts don't leak into "Coder"
- Mode can only use its assigned tools (no file write in "General Chat")
- User installs custom mode from marketplace

**Estimated Effort:** 3 days  
**Scheduled:** Week 14 (concurrent with Security)

---

### 5.8 Stateful Graph Orchestration _(New — Requirement 4.1/4.2)_

**Tasks:**

- [ ] Design graph DSL (nodes, edges, conditions, cycles)
- [ ] Implement checkpoint manager (SQLite persistence every 30s)
- [ ] Implement pause/resume API
- [ ] Human-in-the-loop nodes (approval, edit, override, question)
- [ ] Retry logic with exponential backoff
- [ ] Dead letter queue for failed nodes
- [ ] Circuit breaker pattern
- [ ] Graph execution observability (per-node logging)

**Acceptance Criteria:**

- Complex research workflow runs with 10 nodes
- Mid-execution, user clicks PAUSE → checkpoint saved
- User reviews intermediate results, clicks RESUME → continues from checkpoint
- Node fails 3x → moved to dead letter queue → user notified
- Approval gate: agent proposes action → user approves → continues

**Estimated Effort:** 4 days  
**Scheduled:** Week 15 (concurrent with Docker/Desktop)

---

### 5.9 CRDT Multi-Device Sync _(Enhanced — Requirement 1.1)_

Current implementation note: ADR 0002 supersedes this CRDT sync milestone. The current production path is PostgreSQL-only parity; any IndexedDB/Yjs/WebRTC work must be a future experimental feature behind `AGENTHUB_EXPERIMENTAL_LOCAL_SYNC` with separate conflict tests.

**Tasks:**

- [ ] Integrate Yjs for document-level CRDT sync
- [ ] Integrate Electric SQL for SQLite replication
- [ ] Implement WebRTC P2P transport (direct device sync)
- [ ] Implement WebSocket relay fallback
- [ ] mDNS device discovery on local network
- [ ] Sync key derivation from user password (PBKDF2)
- [ ] End-to-end encryption of sync traffic
- [ ] Selective sync UI (which workspaces sync)

**Acceptance Criteria:**

- User creates session on laptop → appears on phone within 5 seconds
- Both devices edit same message concurrently → both versions preserved
- Device goes offline → continues working → syncs when reconnected
- Sync traffic encrypted — relay server cannot read content

**Estimated Effort:** 3 days  
**Scheduled:** Week 16 (concurrent with Documentation)

---

## Final Feature Coverage Matrix

| Requirement | Feature                             | Design Section   | Architecture Section            | Implementation Phase  |
| ----------- | ----------------------------------- | ---------------- | ------------------------------- | --------------------- |
| 1.1         | CRDT Multi-Device Sync              | DESIGN §12       | ARCH §1.1 (Data Layer)          | Phase 5, Week 16      |
| 1.1         | Artifact Rendering (SVG/React/HTML) | DESIGN §2.5      | ARCH §1.1 (Client Layer)        | Phase 4, Week 11      |
| 1.2         | Workspace Isolation                 | DESIGN §2.7      | ARCH §1.1 (Workspace silos)     | Phase 2, Week 5       |
| 1.3         | Celery + Redis Async Queuing        | DESIGN §13       | ARCH §11 (Async Worker)         | Phase 3, Week 10      |
| 2.1         | Role-Based Teams + Auto-Manager     | DESIGN §4.5      | ARCH §5 (Orchestrator)          | Phase 2, Week 7       |
| 2.2         | GroupChat + Code Sandbox            | DESIGN §4.6, §14 | ARCH §5, §14                    | Phase 2, Week 6-7     |
| 2.3         | A2UI Standard                       | DESIGN §15       | ARCH §2.3 (Component Hierarchy) | Phase 3, Week 9       |
| 2.4         | MCP + A2A Protocol Communities      | DESIGN §6.5, §16 | ARCH §6, §12                    | Phase 4, Week 11      |
| 3.1         | Trust Engine + Accessibility APIs   | DESIGN §17       | ARCH §13, §14                   | Phase 4, Week 12      |
| 3.2         | Desktop File Agent                  | DESIGN §18       | ARCH §14 (Desktop Bridge)       | Phase 5, Week 13      |
| 3.3         | Mode-First Packaging                | DESIGN §19       | ARCH §15 (Mode Runtime)         | Phase 5, Week 14      |
| 3.4         | MCP/A2A Foundation                  | DESIGN §6.5, §16 | ARCH §6, §12                    | Phase 3-4, Weeks 9-11 |
| 4.1/4.2     | Stateful Graphs + Checkpointing     | DESIGN §20       | ARCH §16 (Checkpoint Mgr)       | Phase 5, Week 15      |

---

## Updated Risk Register

| Risk                              | Probability | Impact   | Mitigation                                                           | Phase |
| --------------------------------- | ----------- | -------- | -------------------------------------------------------------------- | ----- |
| CRDT sync complexity              | Medium      | Medium   | Use proven Yjs + Electric SQL; simple data structures; make optional | 5     |
| A2A protocol adoption             | Low         | Medium   | Implement as opt-in; MCP bridge provides immediate value             | 4     |
| Trust Engine IPC overhead         | Medium      | Low      | Unix domain sockets are fast; benchmark before optimize              | 4     |
| Desktop automation OS differences | Medium      | Medium   | Abstract behind unified API; test on all 3 OS in CI                  | 4-5   |
| Mode isolation complexity         | Low         | Medium   | Namespace-based isolation; clear boundaries                          | 5     |
| Graph checkpoint storage bloat    | Medium      | Low      | Auto-prune checkpoints > 30 days; compress state                     | 5     |
| Code sandbox security             | Medium      | **High** | Docker seccomp profiles; no network; readonly FS; resource limits    | 2     |
| Accessibility API permissions     | Medium      | Low      | Graceful degradation; clear UX for permission requests               | 4     |

---

## Updated Success Metrics

| #   | Metric                  | Target                                          | Measurement      |
| --- | ----------------------- | ----------------------------------------------- | ---------------- |
| 1   | **Model Agnosticism**   | Swap Ollama → LM Studio without restart         | Integration test |
| 2   | **Memory Recall**       | Retrieve user preference after 10 conversations | Manual QA        |
| 3   | **RAG Latency**         | < 2 seconds for 100-document KB                 | Benchmark        |
| 4   | **Deployment Time**     | App usable in < 5 minutes via Docker            | Timer test       |
| 5   | **Offline Capability**  | Core chat works without internet                | Manual QA        |
| 6   | **Zero API Cost**       | $0 spent on LLM inference for 1000 messages     | Cost tracking    |
| 7   | **Time to First Token** | < 2 seconds (7B model, GPU)                     | Benchmark        |
| 8   | **Voice Latency**       | < 500ms end-to-end (STT → TTS)                  | Benchmark        |
| 9   | **CRDT Sync**           | Cross-device sync < 5 seconds                   | Benchmark        |
| 10  | **Workspace Isolation** | Workspace A cannot access Workspace B data      | Security test    |
| 11  | **Trust Engine**        | Zero credential leakage in LLM logs             | Security audit   |
| 12  | **Graph Checkpoint**    | Resume from checkpoint < 1 second               | Benchmark        |
| 13  | **A2A Delegation**      | LangGraph → AgentHub task completes end-to-end  | Integration test |
| 14  | **Code Sandbox**        | Untrusted code execution contained              | Penetration test |
| 15  | **A2UI Rendering**      | Agent outputs table → rendered in < 100ms       | Benchmark        |

---

_End of IMPLEMENTATION_PLAN.md v2.1 — All features explicitly scheduled._

---

## Additional Scheduled Feature: Observability & APM

> **Requirement:** Tracks system performance, token consumption, latency, and step-by-step traces to help administrators manage costs and debug agent workflows.

### Observability System _(New — Requirement 19)_

**Tasks:**

- [ ] Design metrics schema (metrics, traces, spans, events tables)
- [ ] Implement tRPC middleware for automatic request tracing
- [ ] Implement LLM provider wrapper for token counting and latency measurement
- [ ] Implement tool execution wrapper for duration and status tracking
- [ ] Build agent orchestrator hooks for workflow step tracing
- [ ] Create APM dashboard React components (overview, model performance, traces, costs)
- [ ] Implement Prometheus-compatible `/metrics` endpoint
- [ ] Build alerting system with configurable rules
- [ ] Add cost estimation for cloud models (token × rate card)
- [ ] Export functionality (CSV, OpenTelemetry)

**Acceptance Criteria:**

- User sends chat message → trace appears in dashboard with LLM latency, token count
- Dashboard shows "Tokens Today: 45.2K" with trend line
- Model comparison table shows avg latency per model
- Agent workflow trace shows waterfall of steps with durations
- Alert fires when average latency exceeds 10 seconds for 5 minutes
- Prometheus can scrape `/metrics` endpoint successfully

**Estimated Effort:** 4 days  
**Scheduled:** Phase 4, Week 12 (concurrent with Trust Engine)

---

## Final Complete Feature Coverage Matrix (Both Audits)

| Category          | Feature                             | Design         | Architecture | Implementation         |
| ----------------- | ----------------------------------- | -------------- | ------------ | ---------------------- |
| **Core AI**       | Multi-Model Support                 | §4.2           | §4           | Phase 1, Week 2        |
| **Core AI**       | Local LLM Support                   | §4.2           | §4           | Phase 1, Week 2        |
| **Core AI**       | Multi-Modality (Vision/Voice/Gen)   | §8, §10        | §1.1         | Phase 4, Weeks 11-12   |
| **Core AI**       | Conversation Branching              | §2.3           | §2.3         | Phase 4, Week 11       |
| **Core AI**       | Chain of Thought                    | §2.4           | §2.3         | Phase 4, Week 11       |
| **Core AI**       | Artifacts Rendering                 | §2.5           | §2.3         | Phase 4, Week 11       |
| **Data**          | RAG / Knowledge Bases               | §7             | §1.1         | Phase 3, Week 10       |
| **Data**          | Plugins and Tool Calling            | §6             | §6           | Phase 1-3, Weeks 4-10  |
| **Data**          | Persistent State and Memory         | §3, §5         | §1.1         | Phase 2, Week 7        |
| **Data**          | Model Context Protocol (MCP)        | §6.3           | §6           | Phase 3, Week 9        |
| **Orchestration** | Multi-Agent Orchestration           | §2.2, §4.5-4.7 | §5           | Phase 2, Weeks 6-8     |
| **Orchestration** | Visual Workflow Builders            | §2.2           | §2.3         | Phase 2, Week 8        |
| **Orchestration** | Stateful Graph Execution            | §20            | §16          | Phase 5, Week 15       |
| **Orchestration** | Human-in-the-Loop (HITL)            | §20.4          | §16          | Phase 5, Week 15       |
| **Orchestration** | Agent-to-Agent (A2A) Protocol       | §16            | §12          | Phase 4, Week 11       |
| **Orchestration** | Computer Use / Desktop Automation   | §17.3, §18     | §13, §14     | Phase 4-5, Weeks 12-13 |
| **Orchestration** | Sandboxed Code Execution            | §14            | §14          | Phase 2, Week 6        |
| **Enterprise**    | Workspace Isolation / Multi-Tenancy | §2.7           | §1.1         | Phase 2, Week 5        |
| **Enterprise**    | **Observability and APM**           | **§21**        | **§17**      | **Phase 4, Week 12**   |
| **Enterprise**    | Credential Isolation (Zero-Trust)   | §17            | §13          | Phase 4, Week 12       |
| **Sync**          | CRDT Multi-Device Sync              | §12            | §1.1         | Phase 5, Week 16       |
| **Async**         | Celery + Redis Queuing              | §13            | §11          | Phase 3, Week 10       |
| **UI**            | A2UI Standard                       | §15            | §2.3         | Phase 3, Week 9        |
| **UI**            | Mode-First Packaging                | §19            | §15          | Phase 5, Week 14       |
| **Security**      | Trust Engine                        | §17            | §13          | Phase 4, Week 12       |
| **File Mgmt**     | Desktop File Agent                  | §18            | §14          | Phase 5, Week 13       |

---

_End of IMPLEMENTATION_PLAN.md v2.2 — All 26 features explicitly scheduled._

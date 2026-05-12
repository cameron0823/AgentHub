# AgentHub Master Development Plan

> **Version:** 1.0  
> **Date:** 2026-05-11  
> **Goal:** Exhaustive feature gap analysis + implementation roadmap to match and exceed LobeChat capabilities.

---

## Part 1: LobeChat Feature Audit → AgentHub Gaps

### 1.1 Infrastructure & Deployment

| # | Feature | LobeChat | AgentHub Status | Gap Severity |
|---|---------|----------|-----------------|--------------|
| 1.1.1 | **Docker Compose full-stack** | ✅ Complete (PostgreSQL + pgvector + MinIO + Casdoor + app) | ❌ None exists | 🔴 Critical |
| 1.1.2 | **S3-compatible object storage** | ✅ MinIO configured | ❌ Not implemented | 🔴 Critical |
| 1.1.3 | **PostgreSQL + pgvector** | ✅ Required for DB mode | 🟡 SQLite only; pgvector planned | 🟡 Medium |
| 1.1.4 | **Database migrations** | ✅ Auto-migration on startup | 🟡 drizzle-kit push exists | 🟢 Minor |
| 1.1.5 | **Health checks** | ✅ All services | ❌ Not implemented | 🟡 Medium |
| 1.1.6 | **Environment variable config** | ✅ Comprehensive .env | 🟡 Minimal .env.example | 🟡 Medium |
| 1.1.7 | **Reverse proxy (Caddy)** | ✅ HTTPS + routing | ❌ Not implemented | 🟡 Medium |
| 1.1.8 | **SSL/TLS certificates** | ✅ Self-signed or real | ❌ Not implemented | 🟡 Medium |
| 1.1.9 | **Backup/restore** | ❌ Not built-in | ❌ Not planned | 🟢 Future |
| 1.1.10 | **Log aggregation** | ❌ Not built-in | ❌ Not planned | 🟢 Future |

### 1.2 Authentication & Authorization

| # | Feature | LobeChat | AgentHub Status | Gap Severity |
|---|---------|----------|-----------------|--------------|
| 1.2.1 | **SSO/OAuth (Casdoor)** | ✅ Built-in | ❌ No auth at all | 🔴 Critical |
| 1.2.2 | **Multiple OAuth providers** | ✅ Casdoor, Clerk, Auth0 | ❌ Not implemented | 🔴 Critical |
| 1.2.3 | **Local credentials** | ✅ Via Casdoor | ❌ Not implemented | 🔴 Critical |
| 1.2.4 | **User registration** | ✅ Via SSO | ❌ Not implemented | 🔴 Critical |
| 1.2.5 | **User profiles** | ✅ Basic | ❌ Not implemented | 🔴 Critical |
| 1.2.6 | **Session management** | ✅ JWT + cookies | ❌ Not implemented | 🔴 Critical |
| 1.2.7 | **Role-based access** | ✅ Admin/user | ❌ Not implemented | 🟡 Medium |
| 1.2.8 | **API keys for external access** | ❌ Not built-in | ❌ Not planned | 🟢 Future |
| 1.2.9 | **MFA/2FA** | ❌ Not built-in | ❌ Not planned | 🟢 Future |

### 1.3 Chat & Conversation

| # | Feature | LobeChat | AgentHub Status | Gap Severity |
|---|---------|----------|-----------------|--------------|
| 1.3.1 | **Streaming chat** | ✅ SSE | ✅ Implemented | 🟢 Done |
| 1.3.2 | **Message history** | ✅ Persistent | ✅ Implemented | 🟢 Done |
| 1.3.3 | **Session management** | ✅ CRUD | ✅ Implemented | 🟢 Done |
| 1.3.4 | **Auto-title generation** | ✅ LLM-based | 🟡 Basic heuristic | 🟡 Medium |
| 1.3.5 | **Message search** | ✅ Full-text | ❌ Not implemented | 🟡 Medium |
| 1.3.6 | **Branching conversations** | ✅ Tree view | 🟡 Schema supports; UI missing | 🟡 Medium |
| 1.3.7 | **Message editing** | ✅ Edit & regenerate | ❌ Not implemented | 🟡 Medium |
| 1.3.8 | **Message deletion** | ✅ Individual | ❌ Not implemented | 🟢 Minor |
| 1.3.9 | **Export conversations** | ✅ JSON/Markdown | ❌ Not implemented | 🟡 Medium |
| 1.3.10 | **Import conversations** | ✅ JSON import | ❌ Not implemented | 🟡 Medium |
| 1.3.11 | **Share conversations** | ✅ Public links | ❌ Not implemented | 🟢 Future |
| 1.3.12 | **Pinned messages** | ❌ Not built-in | ❌ Not planned | 🟢 Future |
| 1.3.13 | **Conversation folders** | ❌ Not built-in | ❌ Not planned | 🟢 Future |
| 1.3.14 | **Favorite agents** | ❌ Not built-in | ❌ Not planned | 🟢 Future |

### 1.4 Model Management

| # | Feature | LobeChat | AgentHub Status | Gap Severity |
|---|---------|----------|-----------------|--------------|
| 1.4.1 | **Ollama integration** | ✅ Native | ✅ Implemented | 🟢 Done |
| 1.4.2 | **OpenAI API** | ✅ Native | 🟡 OpenAI-compatible provider stub | 🟡 Medium |
| 1.4.3 | **Anthropic Claude** | ✅ Native | 🟡 OpenAI-compatible provider stub | 🟡 Medium |
| 1.4.4 | **Google Gemini** | ✅ Native | ❌ Not implemented | 🟡 Medium |
| 1.4.5 | **Azure OpenAI** | ✅ Native | ❌ Not implemented | 🟢 Future |
| 1.4.6 | **Groq** | ✅ Native | ❌ Not implemented | 🟢 Future |
| 1.4.7 | **LM Studio** | ❌ Not native | ✅ Implemented | 🟢 Done |
| 1.4.8 | **vLLM** | ❌ Not native | ✅ Implemented | 🟢 Done |
| 1.4.9 | **LocalAI** | ❌ Not native | ❌ Not planned | 🟢 Future |
| 1.4.10 | **Model comparison** | ❌ Not built-in | ❌ Not planned | 🟢 Future |
| 1.4.11 | **Model performance benchmarks** | ❌ Not built-in | ❌ Not planned | 🟢 Future |

### 1.5 File Upload & Knowledge Base

| # | Feature | LobeChat | AgentHub Status | Gap Severity |
|---|---------|----------|-----------------|--------------|
| 1.5.1 | **File upload UI** | ✅ Drag & drop | ❌ Not implemented | 🔴 Critical |
| 1.5.2 | **PDF parsing** | ✅ Server-side | ❌ Not implemented | 🔴 Critical |
| 1.5.3 | **DOCX parsing** | ✅ Server-side | ❌ Not implemented | 🔴 Critical |
| 1.5.4 | **Image upload** | ✅ Vision models | ❌ Not implemented | 🔴 Critical |
| 1.5.5 | **Audio upload** | ✅ Whisper STT | ❌ Not implemented | 🟡 Medium |
| 1.5.6 | **Video upload** | ❌ Not built-in | ❌ Not planned | 🟢 Future |
| 1.5.7 | **Chunking strategy** | ✅ Recursive | ❌ Not implemented | 🔴 Critical |
| 1.5.8 | **Embedding generation** | ✅ OpenAI or local | 🟡 Ollama embed exists | 🟡 Medium |
| 1.5.9 | **Vector search** | ✅ pgvector | 🟡 LanceDB planned | 🟡 Medium |
| 1.5.10 | **Hybrid search (BM25 + vector)** | ❌ Not built-in | ✅ Planned | 🟢 Future |
| 1.5.11 | **Knowledge base management** | ✅ CRUD | ❌ Not implemented | 🔴 Critical |
| 1.5.12 | **File storage (S3/MinIO)** | ✅ MinIO | ❌ Not implemented | 🔴 Critical |
| 1.5.13 | **File metadata indexing** | ✅ DB records | ❌ Not implemented | 🟡 Medium |

### 1.6 Plugin System

| # | Feature | LobeChat | AgentHub Status | Gap Severity |
|---|---------|----------|-----------------|--------------|
| 1.6.1 | **Plugin marketplace** | ✅ Built-in | ❌ Not implemented | 🔴 Critical |
| 1.6.2 | **Plugin installation** | ✅ One-click | ❌ Not implemented | 🔴 Critical |
| 1.6.3 | **Plugin settings UI** | ✅ Per-plugin | ❌ Not implemented | 🔴 Critical |
| 1.6.4 | **Web search plugin** | ✅ DuckDuckGo | 🟡 SearxNG planned | 🟡 Medium |
| 1.6.5 | **Web crawler plugin** | ✅ Built-in | ❌ Not implemented | 🟡 Medium |
| 1.6.6 | **Calculator plugin** | ✅ Built-in | ✅ Implemented | 🟢 Done |
| 1.6.7 | **Image generation plugin** | ✅ DALL-E/Flux | 🟡 ComfyUI planned | 🟡 Medium |
| 1.6.8 | **Speech-to-text plugin** | ✅ Whisper | 🟡 Whisper planned | 🟡 Medium |
| 1.6.9 | **Text-to-speech plugin** | ✅ OpenAI TTS | 🟡 Piper planned | 🟡 Medium |
| 1.6.10 | **MCP server support** | ❌ Not native | ✅ Planned | 🟢 Future |
| 1.6.11 | **Custom tool creation** | ❌ Not built-in | ✅ Planned | 🟢 Future |

### 1.7 Agent System

| # | Feature | LobeChat | AgentHub Status | Gap Severity |
|---|---------|----------|-----------------|--------------|
| 1.7.1 | **Agent creation** | ✅ UI wizard | ✅ Implemented | 🟢 Done |
| 1.7.2 | **Agent marketplace** | ✅ Built-in | 🟡 UI exists; backend stub | 🟡 Medium |
| 1.7.3 | **Agent sharing** | ✅ JSON export | ✅ Implemented | 🟢 Done |
| 1.7.4 | **Agent import** | ✅ JSON import | ✅ Implemented | 🟢 Done |
| 1.7.5 | **System prompt templates** | ✅ Built-in | 🟡 Basic | 🟡 Medium |
| 1.7.6 | **Agent categories/tags** | ✅ Built-in | 🟡 Schema has tags | 🟢 Minor |
| 1.7.7 | **Agent search** | ✅ Built-in | ❌ Not implemented | 🟡 Medium |
| 1.7.8 | **Agent rating/reviews** | ❌ Not built-in | ❌ Not planned | 🟢 Future |
| 1.7.9 | **Agent versioning** | ❌ Not built-in | ❌ Not planned | 🟢 Future |

### 1.8 Multi-Agent Collaboration

| # | Feature | LobeChat | AgentHub Status | Gap Severity |
|---|---------|----------|-----------------|--------------|
| 1.8.1 | **Agent groups** | ❌ Not native | ✅ Implemented | 🟢 Done |
| 1.8.2 | **Sequential execution** | ❌ Not native | ✅ Implemented | 🟢 Done |
| 1.8.3 | **Parallel execution** | ❌ Not native | ✅ Implemented | 🟢 Done |
| 1.8.4 | **Supervisor-executor** | ❌ Not native | 🟡 Planned | 🟡 Medium |
| 1.8.5 | **Debate mode** | ❌ Not native | 🟡 Planned | 🟡 Medium |
| 1.8.6 | **GroupChat (round-robin)** | ❌ Not native | 🟡 Planned | 🟡 Medium |
| 1.8.7 | **Visual workflow designer** | ❌ Not native | 🟡 Planned | 🟡 Medium |
| 1.8.8 | **Hierarchical auto-manager** | ❌ Not native | 🟡 Planned | 🟡 Medium |

### 1.9 UI/UX

| # | Feature | LobeChat | AgentHub Status | Gap Severity |
|---|---------|----------|-----------------|--------------|
| 1.9.1 | **Responsive design** | ✅ Mobile + desktop | 🟡 Basic responsive | 🟡 Medium |
| 1.9.2 | **Dark/light theme** | ✅ Toggle | 🟡 CSS variables exist | 🟡 Medium |
| 1.9.3 | **Custom themes** | ✅ Built-in | ❌ Not implemented | 🟢 Future |
| 1.9.4 | **Keyboard shortcuts** | ✅ Comprehensive | ❌ Not implemented | 🟡 Medium |
| 1.9.5 | **Command palette** | ✅ Cmd+K | ❌ Not implemented | 🟡 Medium |
| 1.9.6 | **PWA support** | ✅ Service worker | ❌ Not implemented | 🟡 Medium |
| 1.9.7 | **Desktop app** | ❌ Not native | 🟡 Electron planned | 🟡 Medium |
| 1.9.8 | **Mobile app** | ❌ Not native | ❌ Not planned | 🟢 Future |
| 1.9.9 | **Notifications** | ✅ Browser | ❌ Not implemented | 🟢 Minor |
| 1.9.10 | **Typing indicator** | ✅ Animated | ❌ Not implemented | 🟢 Minor |
| 1.9.11 | **Message timestamps** | ✅ Relative time | 🟡 Basic | 🟢 Minor |
| 1.9.12 | **Copy message** | ✅ Button | ❌ Not implemented | 🟢 Minor |
| 1.9.13 | **Regenerate response** | ✅ Button | ❌ Not implemented | 🟡 Medium |
| 1.9.14 | **Edit message** | ✅ Inline | ❌ Not implemented | 🟡 Medium |
| 1.9.15 | **Message feedback** | ✅ Thumbs up/down | ❌ Not implemented | 🟢 Future |

### 1.10 Settings & Configuration

| # | Feature | LobeChat | AgentHub Status | Gap Severity |
|---|---------|----------|-----------------|--------------|
| 1.10.1 | **Language settings** | ✅ i18n | ❌ Not implemented | 🟡 Medium |
| 1.10.2 | **Default model config** | ✅ Per-provider | 🟡 Basic | 🟡 Medium |
| 1.10.3 | **Temperature default** | ✅ Global | 🟡 Per-agent | 🟢 Minor |
| 1.10.4 | **Max tokens default** | ✅ Global | 🟡 Per-agent | 🟢 Minor |
| 1.10.5 | **System prompt templates** | ✅ Built-in | 🟡 Basic | 🟡 Medium |
| 1.10.6 | **Feature flags** | ✅ Built-in | ❌ Not implemented | 🟡 Medium |
| 1.10.7 | **Usage statistics** | ✅ Token tracking | 🟡 Schema fields only | 🟡 Medium |
| 1.10.8 | **Cost tracking** | ✅ Per-request | ❌ Not implemented | 🟢 Future |
| 1.10.9 | **Data export** | ✅ JSON | ❌ Not implemented | 🟡 Medium |
| 1.10.10 | **Data import** | ✅ JSON | ❌ Not implemented | 🟡 Medium |

---

## Part 2: Additional Features Beyond LobeChat

These are AgentHub-unique capabilities that LobeChat does NOT have:

### 2.1 Enterprise Workspaces

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 2.1.1 | **Workspace Isolation** | Strict data silos per workspace | 🔴 High |
| 2.1.2 | **Per-workspace LLM config** | Different models per workspace | 🔴 High |
| 2.1.3 | **Per-workspace embeddings** | Separate vector collections | 🔴 High |
| 2.1.4 | **RBAC** | Role-based access within workspace | 🟡 Medium |
| 2.1.5 | **Workspace switching** | UI dropdown + URL routing | 🔴 High |
| 2.1.6 | **Workspace templates** | Pre-configured workspace setups | 🟢 Future |

### 2.2 CRDT Multi-Device Sync

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 2.2.1 | **Yjs document sync** | Real-time collaborative editing | 🟡 Medium |
| 2.2.2 | **Electric SQL replication** | SQLite → SQLite sync | 🟡 Medium |
| 2.2.3 | **Offline-first** | Works without network | 🟡 Medium |
| 2.2.4 | **End-to-end encryption** | Encrypted sync channels | 🟡 Medium |
| 2.2.5 | **Conflict resolution** | Automatic merge strategies | 🟡 Medium |

### 2.3 MCP Plugin Ecosystem

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 2.3.1 | **MCP client (stdio)** | Connect to local MCP servers | 🔴 High |
| 2.3.2 | **MCP client (SSE)** | Connect to remote MCP servers | 🔴 High |
| 2.3.3 | **MCP server mode** | AgentHub exposes itself as MCP server | 🟡 Medium |
| 2.3.4 | **MCP tool discovery** | Auto-list tools from MCP servers | 🔴 High |
| 2.3.5 | **MCP tool execution** | Route LLM tool calls to MCP | 🔴 High |
| 2.3.6 | **MCP server marketplace** | Curated list of MCP servers | 🟢 Future |

### 2.4 A2A Protocol

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 2.4.1 | **A2A agent discovery** | mDNS + HTTP registry | 🟡 Medium |
| 2.4.2 | **A2A capability negotiation** | Agent advertises skills | 🟡 Medium |
| 2.4.3 | **A2A task delegation** | Send tasks to remote agents | 🟡 Medium |
| 2.4.4 | **Cross-framework bridge** | LangGraph ↔ CrewAI ↔ AutoGen | 🟢 Future |
| 2.4.5 | **Agent communities** | Persistent groups with shared memory | 🟢 Future |

### 2.5 A2UI Standard

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 2.5.1 | **Declarative UI schema** | JSON → React components | 🟡 Medium |
| 2.5.2 | **Interactive forms** | Agent generates forms | 🟡 Medium |
| 2.5.3 | **Data tables** | Sortable/filterable tables | 🟡 Medium |
| 2.5.4 | **Charts** | Recharts integration | 🟢 Future |
| 2.5.5 | **Wizards** | Multi-step workflows | 🟢 Future |

### 2.6 Trust Engine & Security

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 2.6.1 | **Credential vault** | Separate process, encrypted | 🔴 High |
| 2.6.2 | **Policy engine** | Rules for credential use | 🔴 High |
| 2.6.3 | **Audit logging** | Tamper-evident action logs | 🔴 High |
| 2.6.4 | **Desktop automation** | AT-SPI / AX API / UI Automation | 🟢 Future |
| 2.6.5 | **Code sandbox** | Docker/Deno isolation | 🟡 Medium |

### 2.7 Mode-First Packaging

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 2.7.1 | **Mode manifest schema** | Mode = agent + tools + UI + prompts | 🟡 Medium |
| 2.7.2 | **Mode isolation** | Per-mode KB, tools, memory | 🟡 Medium |
| 2.7.3 | **Mode marketplace** | Install/share modes | 🟢 Future |
| 2.7.4 | **Mode builder UI** | Create custom modes | 🟢 Future |

### 2.8 Stateful Graph Orchestration

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 2.8.1 | **Directed cyclic graphs** | Graph definition with cycles | 🟡 Medium |
| 2.8.2 | **Checkpointing** | Save/restore graph state | 🟡 Medium |
| 2.8.3 | **Pause & resume** | Workflow suspension | 🟡 Medium |
| 2.8.4 | **Human-in-the-loop** | Approval gates, edit hooks | 🟡 Medium |
| 2.8.5 | **Retry logic** | Dead letter queues | 🟢 Future |

### 2.9 Observability & APM

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 2.9.1 | **Token tracking** | Per-message, per-session | 🟡 Medium |
| 2.9.2 | **Latency monitoring** | End-to-end traces | 🟡 Medium |
| 2.9.3 | **Trace visualization** | Waterfall view | 🟢 Future |
| 2.9.4 | **APM dashboard** | React metrics dashboard | 🟢 Future |
| 2.9.5 | **Prometheus export** | /metrics endpoint | 🟢 Future |
| 2.9.6 | **OpenTelemetry** | OTLP export | 🟢 Future |
| 2.9.7 | **Alerting** | Configurable rules | 🟢 Future |

### 2.10 Desktop File Agent

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 2.10.1 | **File watcher** | Monitor directories | 🟢 Future |
| 2.10.2 | **Auto-organize** | Pattern-based sorting | 🟢 Future |
| 2.10.3 | **Data synthesis** | Merge, dedup, summarize | 🟢 Future |

---

## Part 3: Implementation Priority Matrix

### Phase A: Foundation (Weeks 1-2) — Unblocks Everything

| # | Feature | Rationale |
|---|---------|-----------|
| A.1 | **Docker Compose full-stack** | Enables deployment, testing, collaboration |
| A.2 | **Auth system (NextAuth + Casdoor)** | Required for multi-user, security, sessions |
| A.3 | **PostgreSQL + pgvector migration** | Required for KB, vector search, production |
| A.4 | **MinIO/S3 file storage** | Required for file upload, KB, attachments |
| A.5 | **Environment config system** | Required for deployment flexibility |

### Phase B: Core Chat Experience (Weeks 3-4)

| # | Feature | Rationale |
|---|---------|-----------|
| B.1 | **File upload + parsing** | Core differentiator from basic chat |
| B.2 | **Knowledge base / RAG** | Document Q&A is a primary use case |
| B.3 | **Chunking + embedding pipeline** | Required for KB |
| B.4 | **Vector search (pgvector)** | Required for KB retrieval |
| B.5 | **Message search** | Essential for productivity |
| B.6 | **Export/import conversations** | Data portability |

### Phase C: Plugin Ecosystem (Weeks 5-6)

| # | Feature | Rationale |
|---|---------|-----------|
| C.1 | **MCP client (stdio + SSE)** | Connect to any tool ecosystem |
| C.2 | **Web search integration** | Ground LLM responses in facts |
| C.3 | **Built-in tool marketplace** | Discover and install tools |
| C.4 | **Custom tool creation UI** | User-defined tools |
| C.5 | **Image generation (ComfyUI)** | Visual content creation |
| C.6 | **Voice mode (STT + TTS)** | Hands-free interaction |

### Phase D: Advanced Agent Features (Weeks 7-8)

| # | Feature | Rationale |
|---|---------|-----------|
| D.1 | **Supervisor-executor orchestrator** | Complex task delegation |
| D.2 | **Debate orchestrator** | Quality improvement via disagreement |
| D.3 | **GroupChat (round-robin)** | Natural conversation flow |
| D.4 | **Auto-manager (hierarchical)** | Automatic task planning |
| D.5 | **White-box memory extraction** | Agent personalization |
| D.6 | **Branching conversations UI** | Tree visualization |
| D.7 | **Chain of Thought visualization** | Reasoning transparency |

### Phase E: Enterprise & Production (Weeks 9-10)

| # | Feature | Rationale |
|---|---------|-----------|
| E.1 | **Workspace isolation** | Multi-team deployment |
| E.2 | **CRDT sync** | Multi-device experience |
| E.3 | **Trust engine / credential vault** | Enterprise security |
| E.4 | **Code sandbox** | Safe agent code execution |
| E.5 | **APM dashboard** | Production monitoring |
| E.6 | **API keys for external access** | Integrate with other systems |

### Phase F: Protocols & Ecosystem (Weeks 11-12)

| # | Feature | Rationale |
|---|---------|-----------|
| F.1 | **A2A protocol implementation** | Cross-framework interoperability |
| F.2 | **A2UI standard** | Rich interactive outputs |
| F.3 | **Mode-first packaging** | Specialized agent distributions |
| F.4 | **Stateful graph orchestration** | Production workflow engine |
| F.5 | **Desktop automation** | Control local applications |

### Phase G: Polish & Distribution (Weeks 13-14)

| # | Feature | Rationale |
|---|---------|-----------|
| G.1 | **PWA support** | Install as app |
| G.2 | **Desktop app (Electron)** | Native experience |
| G.3 | **i18n / localization** | Global audience |
| G.4 | **Custom themes** | User personalization |
| G.5 | **Keyboard shortcuts** | Power user productivity |
| G.6 | **Command palette** | Quick navigation |
| G.7 | **Notification system** | Stay informed |

---

## Part 4: Technical Architecture Decisions

### Database Strategy

| Layer | Current | Target | Migration |
|-------|---------|--------|-----------|
| Primary DB | SQLite (better-sqlite3) | PostgreSQL | Drizzle migration |
| Vector DB | None | pgvector (PostgreSQL extension) | New tables |
| Cache | None | Redis (optional) | New service |
| File Storage | Local filesystem | MinIO (S3-compatible) | New service |
| Sync | None | Yjs + Electric SQL | New layer |

### Auth Strategy

| Approach | LobeChat | AgentHub Target |
|----------|----------|-----------------|
| Primary | NextAuth + Casdoor | NextAuth + Casdoor |
| Secondary | Clerk, Auth0 | Better Auth (fallback) |
| SSO Providers | Casdoor built-in | Google, GitHub, Microsoft |
| API Auth | None | API keys (Phase E) |

### Deployment Strategy

| Target | LobeChat | AgentHub Target |
|--------|----------|-----------------|
| Docker Compose | ✅ Full stack | ✅ Full stack (Phase A) |
| Kubernetes | ❌ Not provided | 🟢 Future |
| Single binary | ❌ Not provided | 🟢 Future (pkg/nexe) |
| Cloud templates | ❌ Not provided | 🟢 Future (AWS, GCP, Azure) |

---

## Part 5: Feature Checklist for Implementation

### Must-Have for LobeChat Parity (P0)

- [ ] Docker Compose with PostgreSQL + pgvector + MinIO + Casdoor + app
- [ ] NextAuth with Casdoor SSO
- [ ] File upload UI + S3 storage
- [ ] PDF/DOCX parsing
- [ ] Knowledge base CRUD
- [ ] Chunking + embedding pipeline
- [ ] Vector search with pgvector
- [ ] Web search plugin
- [ ] Message search
- [ ] Export/import conversations
- [ ] Regenerate response
- [ ] Edit message
- [ ] Branching conversations UI
- [ ] Agent search
- [ ] Plugin marketplace
- [ ] Dark/light theme toggle
- [ ] Mobile responsive

### Should-Have for Differentiation (P1)

- [ ] MCP client (stdio + SSE)
- [ ] Supervisor-executor orchestrator
- [ ] Debate orchestrator
- [ ] GroupChat orchestrator
- [ ] Auto-manager (hierarchical)
- [ ] White-box memory extraction
- [ ] Chain of Thought visualization
- [ ] Workspace isolation
- [ ] Trust engine / credential vault
- [ ] Code sandbox
- [ ] Image generation (ComfyUI)
- [ ] Voice mode (STT + TTS)

### Nice-to-Have (P2)

- [ ] A2A protocol
- [ ] A2UI standard
- [ ] CRDT sync
- [ ] Mode-first packaging
- [ ] Stateful graph orchestration
- [ ] Desktop automation
- [ ] Desktop app (Electron)
- [ ] PWA
- [ ] i18n
- [ ] Custom themes
- [ ] APM dashboard
- [ ] Prometheus metrics
- [ ] API keys

---

*This plan is a living document. As implementation progresses, priorities may shift based on user feedback and technical discoveries.*

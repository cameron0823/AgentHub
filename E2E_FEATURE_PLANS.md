# AgentHub E2E Feature Plans

> **Version:** 1.0  
> **Last Updated:** 2026-05-12  
> **Status:** Living document — updated after each phase completion

---

## 1. Design Philosophy: AgentHub ≠ LobeChat

AgentHub is **modeled on** LobeChat's capabilities but is **not a clone**. The architectural intent is to learn from the best-in-class local AI chat platform while building something fundamentally different in orientation.

| Dimension | LobeChat | AgentHub |
|-----------|----------|----------|
| **Core Metaphor** | Chat-first (conversation UI around models) | Agent-first (agent is the primary entity; chat is one interaction mode) |
| **Memory Model** | Black-box (model-managed, opaque) | White-box (user-editable, structured, inspectable) |
| **Multi-Agent** | Basic agent switching | Deep orchestration (sequential, parallel, supervisor, debate, groupchat, auto-manager) |
| **Extensibility** | Plugin/MCP ecosystem (consumer-oriented) | A2A protocol + MCP (prosumer-oriented, cross-framework) |
| **Knowledge** | RAG with hybrid search | RAG + agent-bound VFS (documents become agent-readable file systems) |
| **Output Types** | Markdown + Artifacts | A2UI declarative rendering (JSON → UI components) |
| **Sync** | Server-side multi-device | CRDT local-first with optional server sync |
| **Target User** | General consumer / power user | Developer, researcher, automation engineer |

### What AgentHub Deliberately Does NOT Copy

1. **40+ cloud provider integrations** — AgentHub focuses on local/self-hosted inference (Ollama, vLLM, LM Studio) plus a clean OpenAI-compatible API gateway. Cloud provider sprawl is explicitly out of scope.
2. **Lobe UI v2 design system** — AgentHub uses Tailwind + custom components, not glassmorphism/particle effects.
3. **500+ pre-built community agents** — AgentHub ships a curated bundled catalog (~10-20 high-quality packs) plus a manifest-based import/export system. No centralized marketplace server.
4. **Telegram/Messenger/Line bots** — Out of scope for core platform. A2A protocol enables third-party bridge bots.
5. **Commercial white-label features** — Open source only; no license tiers.

---

## 2. Feature Parity Matrix

### Legend
- ✅ **Shipped** — Implemented and wired end-to-end
- 🔧 **Partial** — Core plumbing exists, UI or integration incomplete
- 🚧 **Planned** — On roadmap, schema/API may exist
- ❌ **Out of Scope** — Deliberately not building
- 🔄 **Different** — Same problem, different solution

---

### 2.1 Chat Experience

| Feature | LobeChat | AgentHub | Notes |
|---------|----------|----------|-------|
| Streaming chat | ✅ | ✅ | SSE via AgentRuntime |
| Markdown rendering | ✅ | ✅ | GFM + KaTeX math + syntax highlighting |
| Mermaid diagrams | ✅ | 🚧 | Schema exists; renderer not wired |
| Message editing | ✅ | 🚧 | DB supports it; no UI |
| Message deletion | ✅ | ✅ | Single + bulk delete |
| Regenerate / retry | ✅ | 🚧 | Needs retry-with-different-model UI |
| Message feedback (👍/👎) | ✅ | 🚧 | Schema ready; no UI |
| Hotkey support | ✅ | 🚧 | Basic shortcuts only |
| **Branching conversations** | ✅ | 🚧 | `parentId` in schema; linear UI only |
| Pin conversations | ✅ | 🚧 | `pinned` flag not in schema |
| Conversation search | ✅ | 🚧 | Needs FTS5/BM25 or pg_trgm |
| Auto title generation | ✅ | ✅ | Implemented |
| **CoT / Reasoning display** | ✅ | ✅ | `<think>` tag extraction + collapsible panel |

**E2E Test Plan (Chat)**
```gherkin
Feature: Core Chat Experience
  Scenario: User sends message and receives streaming response
    Given Ollama is running with qwen2.5:7b
    And user is authenticated
    When user creates a new chat session
    And types "What is 2+2?" and presses Enter
    Then the assistant response streams in token by token
    And the message appears in the message list
    And the session title is auto-generated

  Scenario: Reasoning model shows thinking panel
    Given user is in a chat with DeepSeek-R1
    When user asks a reasoning question
    Then the response contains a collapsible "Thinking" panel
    And raw `<think>` tags are not visible in final output

  Scenario: Branching conversation
    Given a chat with 3 messages
    When user clicks "Branch" on the second assistant message
    Then a new session fork is created preserving context
    And the sidebar shows both original and branched sessions
```

---

### 2.2 Multimodal & Voice

| Feature | LobeChat | AgentHub | Notes |
|---------|----------|----------|-------|
| Vision / image input | ✅ | 🚧 | Schema ready; no upload UI in chat |
| Image generation | ✅ | ❌ | Out of scope (use ComfyUI/FLUX externally) |
| Video recognition | ✅ | ❌ | Out of scope |
| Audio input / STT | ✅ | 🚧 | Planned via Whisper/Ollama audio |
| TTS output | ✅ | 🚧 | Planned via Edge TTS or Piper |
| Voice conversation mode | ✅ | ❌ | Out of scope for v1 |
| File attachment in chat | ✅ | 🔧 | Presigned URL API ready; chat input lacks attachment button |

**E2E Test Plan (Multimodal)**
```gherkin
Feature: File Attachments in Chat
  Scenario: User attaches image for vision analysis
    Given user is in a chat session
    And the selected model supports vision
    When user drags an image into the chat input
    And types "Describe this image"
    Then the image is uploaded to MinIO
    And the message includes the image URL
    And the assistant responds with a description

  Scenario: Knowledge base document grounding
    Given a knowledge base "Project Docs" with uploaded PDFs
    And an agent configured to use "Project Docs"
    When user asks "What is the deadline in the requirements doc?"
    Then the RAG pipeline retrieves relevant chunks
    And the response cites the source document
```

---

### 2.3 Model Providers

| Feature | LobeChat | AgentHub | Notes |
|---------|----------|----------|-------|
| Ollama | ✅ | ✅ | Full implementation with auto-discovery |
| vLLM | ✅ | 🔧 | Registered in registry; untested |
| LM Studio | ✅ | 🔧 | Registered in registry; untested |
| OpenAI-compatible gateway | ✅ | 🚧 | Architecture doc only; no `/v1/chat/completions` route |
| 40+ cloud providers | ✅ | ❌ | Deliberately out of scope |
| Per-provider API key management | ✅ | 🚧 | Planned via settings |
| Model capability tags | ✅ | 🔧 | `vision`, `fc`, `reasoning` tags in schema |
| Token usage tracking | ✅ | 🔧 | `tokensUsed` field exists; no dashboard |
| Token speed (tok/s) | ✅ | 🚧 | Needs latency measurement in stream |
| System agent config | ✅ | ❌ | Out of scope |

**AgentHub Provider Strategy:**
- **Tier 1 (first-class):** Ollama — auto-discovery, health checks, full feature parity
- **Tier 2 (supported):** vLLM, LM Studio, Xinference — OpenAI-compatible passthrough
- **Tier 3 (gateway):** Single OpenAI-compatible API proxy for external tools
- **Tier 4 (out of scope):** Individual cloud provider SDKs

**E2E Test Plan (Providers)**
```gherkin
Feature: Provider Discovery and Failover
  Scenario: Ollama models auto-discovered on startup
    Given Ollama is running with qwen2.5:7b and llama3.1:8b
    When the AgentHub web app loads
    Then the model selector shows both models
    And each model displays its health status

  Scenario: Provider fallback when Ollama is offline
    Given Ollama is stopped
    And LM Studio is running on port 1234
    When user starts a new chat
    Then the model selector shows LM Studio models
    And a warning banner indicates Ollama is unavailable
```

---

### 2.4 Authentication & SSO

| Feature | LobeChat | AgentHub | Notes |
|---------|----------|----------|-------|
| Casdoor OIDC | ✅ | ✅ | Implemented with NextAuth v4 |
| Better Auth (email/pass) | ✅ | 🚧 | Schema supports it; no registration UI |
| GitHub OAuth | ✅ | 🚧 | Easy to add via NextAuth provider |
| Google OAuth | ✅ | 🚧 | Easy to add via NextAuth provider |
| Generic OIDC | ✅ | 🚧 | Configurable via env |
| Email allowlisting | ✅ | 🚧 | Middleware check needed |
| API key management | ✅ | 🚧 | `api_keys` table not in schema yet |
| Avatar upload | ✅ | 🔧 | S3 presigned URL ready; no avatar upload UI |
| Role-based access | ✅ | 🔧 | `role` enum exists; `adminProcedure` exists; no admin UI |

**AgentHub Auth Strategy:**
- **Phase A:** Casdoor only (reference stack parity)
- **Phase B:** Email/password + GitHub/Google via NextAuth
- **Phase C:** API keys for programmatic access
- **Phase D:** Generic OIDC for enterprise

**E2E Test Plan (Auth)**
```gherkin
Feature: Authentication Flow
  Scenario: User signs in via Casdoor
    Given Casdoor is running at localhost:8000
    And the Casdoor application "agenthub" is configured
    When user clicks "Sign In with Casdoor"
    And completes the OIDC flow
    Then the user is redirected back to AgentHub
    And the sidebar shows the user's name and avatar
    And a session cookie is set

  Scenario: Unauthorized access blocked
    Given user is not authenticated
    When user navigates to /api/trpc/agents.list
    Then the response returns 401 UNAUTHORIZED
```

---

### 2.5 Knowledge Base & RAG

| Feature | LobeChat | AgentHub | Notes |
|---------|----------|----------|-------|
| KB creation | ✅ | ✅ | UI + API wired |
| Document upload | ✅ | 🔧 | Presigned URL API ready; no KB upload UI |
| Auto chunking | ✅ | 🔧 | Schema has `chunkSize`/`chunkOverlap`; no pipeline |
| Embedding generation | ✅ | 🔧 | Vector query endpoint exists; no ingestion pipeline |
| Vector search (pgvector) | ✅ | ✅ | Cosine similarity via HNSW index |
| Hybrid search (BM25 + vector) | ✅ | 🚧 | Needs pg_trgm or BM25 extension |
| Reranking | ✅ | 🚧 | Planned cross-encoder reranker |
| Inline document grounding | ✅ | 🚧 | `docs_*` tools not implemented |
| Multi-modal RAG | ✅ | ❌ | Out of scope for v1 |
| RAG evaluation | ✅ | ❌ | Out of scope |

**AgentHub KB Differentiation:**
- **Agent-bound VFS:** Each agent can mount KBs as a virtual file system. The agent sees documents as `docs/project/requirements.md` and can read them via built-in tools.
- **White-box chunks:** Users can inspect, edit, and re-chunk individual document chunks.
- **Local embedding:** All embeddings generated via Ollama (`nomic-embed-text` or similar) — zero cloud dependency.

**E2E Test Plan (Knowledge Base)**
```gherkin
Feature: Knowledge Base RAG
  Scenario: User uploads PDF and queries it
    Given a knowledge base "Research Papers" exists
    When user uploads "attention_is_all_you_need.pdf"
    Then the document is chunked and embedded via Ollama
    And chunks appear in the KB document list
    When user asks "What is the Transformer architecture?"
    Then the response cites the PDF
    And the retrieved chunks are shown in a "Sources" panel

  Scenario: Agent uses KB as virtual file system
    Given agent "Researcher" has KB "Research Papers" mounted
    When user asks "Read docs/research/attention_is_all_you_need.md and summarize"
    Then the agent calls the `read_file` tool with the VFS path
    And the file content is retrieved from the KB chunks
    And the agent returns a summary
```

---

### 2.6 Agent System

| Feature | LobeChat | AgentHub | Notes |
|---------|----------|----------|-------|
| Custom agent creation | ✅ | ✅ | Full CRUD UI |
| System prompt | ✅ | ✅ | Implemented |
| Temperature / top-p / max tokens | ✅ | ✅ | Implemented |
| Model binding | ✅ | ✅ | Per-agent default model |
| Opening messages | ✅ | 🚧 | Schema missing `openingMessage` |
| Opening questions | ✅ | 🚧 | Schema missing `openingQuestions` |
| Placeholder variables | ✅ | 🚧 | `{{username}}`, `{{time}}` substitution |
| Agent avatar | ✅ | ✅ | Implemented |
| Agent tags | ✅ | ✅ | Implemented |
| **Agent marketplace** | ✅ (500+) | 🔄 (bundled) | Local catalog + manifest import/export |
| **Auto-i18n** | ✅ | ❌ | Out of scope |

**AgentHub Agent Differentiation:**
- **Manifest-based portability:** Every agent exports to a JSON manifest with all settings, prompts, and tools. Share via GitHub Gist, file, or URL.
- **Mode packaging:** Agents can export as "modes" — reusable configurations that can be applied to any base model.
- **Opening questions:** Agents suggest starter questions based on their purpose, displayed as clickable chips.

**E2E Test Plan (Agent System)**
```gherkin
Feature: Agent Creation and Sharing
  Scenario: User creates an agent and exports it
    Given user is on the Agent Builder page
    When user fills in name "Python Tutor"
    And sets system prompt "You are a patient Python tutor..."
    And selects model "ollama:qwen2.5-coder:14b"
    And enables tools "calculator, datetime"
    And clicks "Save"
    Then the agent appears in the sidebar
    When user clicks "Export Manifest"
    Then a JSON file downloads containing the full agent config

  Scenario: User imports agent from manifest
    Given user has a manifest JSON file
    When user navigates to Marketplace and pastes the manifest
    And clicks "Install"
    Then the agent is created with all settings preserved
    And it appears in the agent list
```

---

### 2.7 Multi-Agent Orchestration

| Feature | LobeChat | AgentHub | Notes |
|---------|----------|----------|-------|
| Agent switching | ✅ | ✅ | Per-message model selection |
| Sequential orchestration | ❌ | ✅ | Implemented |
| Parallel orchestration | ❌ | ✅ | Implemented |
| Supervisor pattern | ❌ | 🚧 | Schema supports; no implementation |
| Debate pattern | ❌ | 🚧 | Schema supports; no implementation |
| GroupChat pattern | ❌ | 🚧 | Schema supports; no implementation |
| Auto-manager (hierarchical) | ❌ | 🚧 | Planned |
| **Agent Task System** | ✅ (LobeHub v2) | 🚧 | Planned: task templates, cron, dependencies |
| **Heterogeneous runtime** | ✅ | ❌ | Out of scope |

**AgentHub Orchestration Differentiation:**
- **Pattern visualizer:** Group chat shows a live graph of agent interactions (who spoke when, what was shared).
- **Synthesis strategies:** Parallel mode supports multiple synthesis strategies (consensus, voting, best-of-n).
- **Human-in-the-loop:** Supervisor and debate modes can pause for human approval at critical decision points.

**E2E Test Plan (Orchestration)**
```gherkin
Feature: Multi-Agent Group Chat
  Scenario: Sequential group completes a multi-step task
    Given a group "Dev Team" with agents:
      | Agent | Role | System Prompt |
      | Architect | designer | Design the API schema... |
      | Coder | implementer | Implement the code... |
      | Reviewer | reviewer | Review for bugs... |
    And pattern is "sequential"
    When user assigns task "Build a todo API"
    Then Architect responds with API design
    And Coder receives the design and outputs code
    And Reviewer receives the code and outputs review
    And the final synthesis combines all three outputs

  Scenario: Parallel group with synthesis
    Given a group "Brainstorm" with 3 creative agents
    And pattern is "parallel"
    When user assigns task "Name our new product"
    Then all 3 agents respond simultaneously
    And the synthesis panel shows a combined ranked list
```

---

### 2.8 Plugin & Tool System

| Feature | LobeChat | AgentHub | Notes |
|---------|----------|----------|-------|
| Function calling | ✅ | ✅ | OpenAI-compatible tool schema |
| MCP support | ✅ | 🚧 | Planned — MCP client + marketplace |
| Built-in web search | ✅ | 🚧 | Planned via SearXNG |
| Built-in image gen | ✅ | ❌ | Out of scope |
| Code execution | ✅ | 🚧 | Planned via Docker sandbox |
| Custom plugin SDK | ✅ | 🔄 | A2A protocol + manifest-based tools |
| Plugin marketplace | ✅ (40+) | 🔄 | Bundled catalog + manifest import |
| Tool calling UI | ✅ | ✅ | Expandable cards with args + results |

**AgentHub Tool Differentiation:**
- **A2A protocol:** Tools can be remote agents that speak the A2A protocol. Your calculator tool could be an agent running on another machine.
- **Trust engine:** Every tool execution runs in a sandboxed subprocess with capability-based permissions.
- **Tool manifest:** Tools declare their schema, permissions, and sandbox requirements in a JSON manifest.

**E2E Test Plan (Tools)**
```gherkin
Feature: Tool Execution
  Scenario: Calculator tool solves expression
    Given user is in a chat with an agent that has calculator tool
    When user asks "What is 155 * 23 / 7?"
    Then the agent emits a tool call: calculator({"expression": "155 * 23 / 7"})
    And the UI shows a spinning tool card
    And the result "508.93" appears in the card
    And the final response includes the calculated answer

  Scenario: MCP tool integration
    Given user has installed an MCP server "filesystem"
    And the server exposes tool "read_file"
    When user asks "Read /tmp/test.txt"
    Then the agent calls the MCP tool via stdio transport
    And the file content is returned
```

---

### 2.9 Memory & Persistence

| Feature | LobeChat | AgentHub | Notes |
|---------|----------|----------|-------|
| Server-side persistence | ✅ | ✅ | PostgreSQL |
| Local/offline mode | ✅ | ❌ | Out of scope for v1 |
| CRDT sync | ✅ (experimental) | 🚧 | Planned via Yjs |
| **White-box memory** | ❌ | ✅ | User-editable memory entries |
| **Auto memory extraction** | ❌ | 🚧 | Planned: LLM extracts facts from convo |
| Memory injection in chat | ❌ | 🔧 | Helper exists; not wired to chat route |
| Context window management | ✅ | 🚧 | Token counting + summarization |

**AgentHub Memory Differentiation:**
- **Structured memory:** Key-value pairs with categories, confidence scores, and edit history.
- **Agent-scoped + global:** Each agent has its own memory, plus user-level shared memory.
- **Source attribution:** Every memory entry records which message created it.
- **Manual curation:** Users review, edit, reject, or archive proposed memories.

**E2E Test Plan (Memory)**
```gherkin
Feature: White-Box Memory
  Scenario: User manually creates a memory entry
    Given user is on the Memory Editor page
    When user creates entry:
      | Category | Key | Value | Confidence |
      | preference | favorite_language | Python | 1.0 |
    Then the entry appears in the memory list
    And when user chats with an agent that uses this memory
    Then the system prompt includes "User prefers Python"

  Scenario: Auto-extracted memory proposal
    Given auto-memory extraction is enabled
    When user says "I work at Acme Corp as a senior engineer"
    Then a proposed memory appears:
      | Category | Key | Value | Confidence |
      | profile | employer | Acme Corp | 0.9 |
      | profile | role | senior engineer | 0.85 |
    And user can click "Accept" or "Reject"
```

---

### 2.10 UI/UX

| Feature | LobeChat | AgentHub | Notes |
|---------|----------|----------|-------|
| Light/dark theme | ✅ | 🔧 | Tailwind dark mode; no toggle wired |
| Custom themes | ✅ | ❌ | Out of scope |
| PWA | ✅ | 🚧 | Needs manifest + service worker |
| Mobile responsive | ✅ | 🔧 | Works but not optimized |
| **Artifacts panel** | ✅ | 🔄 | A2UI renderer (JSON → React components) |
| Virtualized message list | ✅ | ✅ | react-virtuoso |
| Code block actions | ✅ | ✅ | Copy button |
| Link previews | ✅ | ❌ | Out of scope |
| **Performance metrics** | ✅ | 🔧 | Token count + latency in schema; no UI |

**E2E Test Plan (UI/UX)**
```gherkin
Feature: Theme and Layout
  Scenario: User toggles dark mode
    Given user is on the chat page
    When user clicks the theme toggle in the header
    Then the page switches to dark mode
    And the preference is persisted in localStorage
    And the preference syncs to the server settings table

  Scenario: A2UI artifact renders
    Given the agent returns an A2UI payload:
      """
      {"type": "chart", "data": {"labels": ["A", "B"], "values": [10, 20]}}
      """
    Then a bar chart renders inline in the chat
    And the chart is interactive (hover shows values)
```

---

### 2.11 Export / Import / Migration

| Feature | LobeChat | AgentHub | Notes |
|---------|----------|----------|-------|
| Full DB export | ✅ | 🚧 | Planned |
| Full DB import | ✅ | 🚧 | Planned |
| Single chat export | ✅ | 🚧 | JSON + text formats |
| Chat import | ✅ | 🚧 | JSON format |
| **Agent manifest export** | 🔄 | ✅ | Implemented |
| **Agent manifest import** | 🔄 | ✅ | Implemented |
| Settings URL share | ✅ | ❌ | Out of scope |

**E2E Test Plan (Export/Import)**
```gherkin
Feature: Data Portability
  Scenario: User exports all data
    Given user has agents, sessions, and memory entries
    When user navigates to Settings → Data Export
    And clicks "Export All"
    Then a ZIP downloads containing:
      | agents.json |
      | sessions.jsonl |
      | memory.json |
      | files/ |

  Scenario: User imports agent manifest
    Given user has a manifest JSON
    When user pastes it into Marketplace → Import
    Then the agent is created with all settings
```

---

### 2.12 Settings & Preferences

| Feature | LobeChat | AgentHub | Notes |
|---------|----------|----------|-------|
| Language / i18n | ✅ (15+) | 🚧 | English only; i18n framework not set up |
| Theme | ✅ | 🔧 | Dark mode partial |
| Default model config | ✅ | 🔧 | `settings` table exists; no UI |
| Hotkey config | ✅ | ❌ | Out of scope |
| TTS voice selection | ✅ | ❌ | Out of scope |
| Message density | ✅ | ❌ | Out of scope |
| **Feature flags** | ✅ | 🚧 | Env-based; no runtime admin panel |
| Access code | ✅ | ❌ | Out of scope |

**E2E Test Plan (Settings)**
```gherkin
Feature: User Settings
  Scenario: User changes default model
    Given user is on Settings page
    When user selects "ollama:llama3.1:8b" as default
    Then new sessions use this model by default
    And the setting persists across page reloads
```

---

### 2.13 Enterprise & Advanced

| Feature | LobeChat | AgentHub | Notes |
|---------|----------|----------|-------|
| Langfuse observability | ✅ | ❌ | Out of scope |
| Token tracking dashboard | ✅ | 🚧 | Schema ready; no dashboard |
| API key management | ✅ | 🚧 | Planned |
| Workspace isolation | ✅ | ❌ | Single-tenant for now |
| Admin panel | ✅ | 🚧 | `adminProcedure` exists; no UI |
| Desktop app | ✅ | ❌ | Out of scope |
| **A2A protocol** | ❌ | 🚧 | Planned — cross-framework agent comms |
| **CRDT sync** | ❌ | 🚧 | Planned |
| **Trust engine** | ❌ | 🚧 | Planned |
| **Desktop automation** | ❌ | 🚧 | Planned |

---

## 3. Implementation Phases

### Phase A: Foundation ✅ (IN PROGRESS)
**Goal:** Match LobeChat database edition core infrastructure.

| Deliverable | Status |
|-------------|--------|
| PostgreSQL + pgvector schema | ✅ Shipped |
| NextAuth + Casdoor SSO | ✅ Shipped |
| MinIO file storage | ✅ Shipped |
| tRPC router architecture | ✅ Shipped |
| Drizzle ORM + migrations | ✅ Shipped |
| Basic streaming chat | ✅ Shipped |
| Agent CRUD | ✅ Shipped |
| Agent Group CRUD (seq/parallel) | ✅ Shipped |
| Built-in tools (calc, datetime, read_file) | ✅ Shipped |
| Provider registry (Ollama primary) | ✅ Shipped |
| Marketplace (bundled catalog) | ✅ Shipped |

**Phase A E2E Tests:**
- [x] `auth.spec.ts` — Casdoor sign-in flow
- [x] `chat.spec.ts` — Send message, receive stream, stop generation
- [x] `agent.spec.ts` — Create agent, chat with agent, edit agent
- [x] `group.spec.ts` — Create group, run sequential/parallel task
- [x] `marketplace.spec.ts` — Install catalog item, export agent

---

### Phase B: Chat Parity 🚧
**Goal:** Reach feature parity with LobeChat's chat experience.

| Deliverable | Priority | E2E Test File |
|-------------|----------|---------------|
| Branching conversations | P0 | `branching.spec.ts` |
| Message editing & regeneration | P0 | `message-actions.spec.ts` |
| File attachment in chat | P0 | `attachments.spec.ts` |
| Vision / image input | P1 | `vision.spec.ts` |
| Conversation search (pg_trgm) | P1 | `search.spec.ts` |
| Pin conversations | P2 | `pin.spec.ts` |
| Message feedback (👍/👎) | P2 | `feedback.spec.ts` |
| Hotkey support | P2 | `hotkeys.spec.ts` |
| Mermaid diagram rendering | P2 | `mermaid.spec.ts` |

---

### Phase C: Knowledge Base 🚧
**Goal:** Full RAG pipeline with agent-bound VFS.

| Deliverable | Priority | E2E Test File |
|-------------|----------|---------------|
| Document upload UI in KB | P0 | `kb-upload.spec.ts` |
| Chunking pipeline | P0 | `kb-chunking.spec.ts` |
| Embedding generation via Ollama | P0 | `kb-embedding.spec.ts` |
| Hybrid search (BM25 + vector) | P1 | `kb-hybrid.spec.ts` |
| Agent VFS mount | P1 | `kb-vfs.spec.ts` |
| Inline citation UI | P1 | `kb-citations.spec.ts` |
| Reranking | P2 | `kb-rerank.spec.ts` |

---

### Phase D: Memory & Learning 🚧
**Goal:** White-box memory with auto-extraction.

| Deliverable | Priority | E2E Test File |
|-------------|----------|---------------|
| Memory injection in chat stream | P0 | `memory-injection.spec.ts` |
| Auto memory extraction | P1 | `memory-auto.spec.ts` |
| Context window management | P1 | `context-window.spec.ts` |
| Memory search | P2 | `memory-search.spec.ts` |

---

### Phase E: Orchestration 🚧
**Goal:** Complete all group patterns.

| Deliverable | Priority | E2E Test File |
|-------------|----------|---------------|
| Supervisor orchestrator | P0 | `orchestrator-supervisor.spec.ts` |
| Debate orchestrator | P0 | `orchestrator-debate.spec.ts` |
| GroupChat orchestrator | P0 | `orchestrator-groupchat.spec.ts` |
| Auto-manager (hierarchical) | P1 | `orchestrator-auto.spec.ts` |
| Pattern visualizer UI | P1 | `orchestrator-visualizer.spec.ts` |
| Human-in-the-loop checkpoints | P2 | `orchestrator-hitl.spec.ts` |

---

### Phase F: Extensibility 🚧
**Goal:** MCP + A2A + plugin ecosystem.

| Deliverable | Priority | E2E Test File |
|-------------|----------|---------------|
| MCP client (stdio + HTTP) | P0 | `mcp-client.spec.ts` |
| MCP marketplace UI | P1 | `mcp-marketplace.spec.ts` |
| A2A protocol gateway | P1 | `a2a-gateway.spec.ts` |
| A2A agent discovery | P2 | `a2a-discovery.spec.ts` |
| Tool manifest system | P1 | `tool-manifest.spec.ts` |
| Trust engine (sandbox) | P2 | `trust-engine.spec.ts` |
| Code execution sandbox | P2 | `sandbox.spec.ts` |

---

### Phase G: Polish 🚧
**Goal:** UI/UX parity + deployment readiness.

| Deliverable | Priority | E2E Test File |
|-------------|----------|---------------|
| Dark mode toggle | P1 | `theme.spec.ts` |
| i18n framework + 3 languages | P2 | `i18n.spec.ts` |
| PWA manifest | P2 | `pwa.spec.ts` |
| Token tracking dashboard | P2 | `analytics.spec.ts` |
| Data export/import | P2 | `data-portability.spec.ts` |
| Mobile responsive pass | P2 | `mobile.spec.ts` |
| OpenAI-compatible API | P2 | `openai-api.spec.ts` |

---

## 4. E2E Test Infrastructure

### Test Stack
```
Playwright (primary) — browser automation
  ├── auth.setup.ts — Casdoor login fixture
  ├── fixtures/
  │   ├── agent.fixtures.ts — pre-seeded agents
  │   ├── kb.fixtures.ts — pre-seeded knowledge bases
  │   └── ollama.fixtures.ts — model availability checks
  └── specs/
      ├── phase-a/  — Foundation tests
      ├── phase-b/  — Chat parity tests
      ├── phase-c/  — KB tests
      ├── phase-d/  — Memory tests
      ├── phase-e/  — Orchestration tests
      ├── phase-f/  — Extensibility tests
      └── phase-g/  — Polish tests
```

### Test Data Strategy
- **Seed script:** `tests/e2e/seed.ts` creates a standard test user + agents + KBs via tRPC
- **Isolation:** Each test file runs in a clean browser context; auth state shared via storage state
- **Ollama dependency:** Tests tagged `@ollama` are skipped if Ollama is unreachable
- **Casdoor dependency:** Tests tagged `@auth` use a dedicated test application in Casdoor

### CI/CD Integration
```yaml
# .github/workflows/e2e.yml
- name: Start infrastructure
  run: docker compose up -d postgresql minio casdoor
- name: Run migrations
  run: pnpm drizzle-kit migrate
- name: Seed test data
  run: pnpm tsx tests/e2e/seed.ts
- name: Run Playwright
  run: pnpm playwright test --grep-invert @ollama  # skip ollama-dependent tests in CI
```

---

## 5. Architecture Model

### Data Flow Diagram
```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Browser   │◄───►│  Next.js    │◄───►│   PostgreSQL    │
│  (React 18) │  tRPC│  App Router │  Drizzle│  + pgvector   │
└─────────────┘     └──────┬──────┘     └─────────────────┘
                           │
                    ┌──────┴──────┐
                    │ AgentRuntime │
                    │  (pkg/agent) │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌─────────┐  ┌─────────┐  ┌─────────┐
        │ Ollama  │  │ vLLM    │  │ LMStudio│
        │ (local) │  │ (local) │  │ (local) │
        └─────────┘  └─────────┘  └─────────┘
                           │
                    ┌──────┴──────┐
                    │  Tool Engine  │
                    │ (built-in +   │
                    │  MCP + A2A)   │
                    └─────────────┘
```

### Service Topology (Docker Compose)
```
┌─────────────────────────────────────────────────────┐
│                  agenthub-network                    │
│  (shared network namespace — all services localhost) │
├─────────────────────────────────────────────────────┤
│  localhost:3000  │  Next.js (AgentHub web app)      │
│  localhost:8000  │  Casdoor (OIDC provider)         │
│  localhost:9000  │  MinIO (S3-compatible storage)   │
│  localhost:9001  │  MinIO Console                   │
│  localhost:5432  │  PostgreSQL + pgvector           │
│  localhost:6379  │  Redis (cache, future use)       │
└─────────────────────────────────────────────────────┘
         ▲
         │ host network bridge
    ┌────┴────┐
    │ Ollama  │  (host machine or Docker Desktop)
    │ :11434  │
    └─────────┘
```

---

## 6. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-05 | PostgreSQL over SQLite | Vector search (pgvector) + auth scalability |
| 2026-05-05 | NextAuth v4 over v5 | Stability; v5 beta lacks SQLite/PG adapters |
| 2026-05-05 | Casdoor as primary auth | Matches reference stack; self-hosted IAM |
| 2026-05-10 | Agent-first over chat-first | Differentiation: agent is the entity, chat is a mode |
| 2026-05-10 | White-box memory | Transparency: user owns and curates agent memory |
| 2026-05-10 | Local providers only | Privacy-first: no cloud API keys required |
| 2026-05-12 | Manifest-based marketplace | Portability: agents as JSON, not platform lock-in |

---

## 7. Appendix: LobeChat Feature Count

| Category | LobeChat Features | AgentHub Parity | Gap |
|----------|-------------------|-----------------|-----|
| Chat | 20 | 14 | 6 |
| Multimodal/Voice | 9 | 2 | 7 (mostly out of scope) |
| Providers | 40+ | 3 + gateway | 37+ (deliberate) |
| Auth | 15+ backends | 1 + planned | 14+ (phased) |
| File/KB/RAG | 14 | 5 | 9 |
| Agent System | 12 | 8 | 4 |
| Multi-Agent | 8 (LobeHub v2) | 2 | 6 |
| Plugins/Tools | 12 | 3 | 9 |
| UI/UX | 16 | 6 | 10 |
| Memory | 6 | 3 | 3 |
| Export/Import | 7 | 2 | 5 |
| Settings | 12 | 2 | 10 |
| Enterprise | 10 | 0 | 10 (mostly out of scope) |
| **Total** | **~170** | **~60 shipped/partial** | **~110 planned/out of scope** |

**Target:** Ship 100+ features across Phases B–G to reach ~70% functional parity with LobeChat on core use cases, while maintaining architectural differentiation.

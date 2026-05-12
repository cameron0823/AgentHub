# AgentHub Feature Catalog

> **Purpose:** A curated inventory of features not currently implemented or on the active roadmap, organized by implementation complexity.  
> **Source:** Competitive analysis of OpenWebUI, LobeChat, LibreChat, Onyx, ChatGPT, Claude, and Gemini.  
> **Last Updated:** 2026-05-11

---

## How to Read This Document

- **Tier 1 (Easy):** Hours to 1 day. Mostly UI changes, simple API integrations, or leveraging existing infrastructure.
- **Tier 2 (Medium):** Days to 1 week. Requires new API routes, schema migrations, moderate UI components, or external service integration.
- **Tier 3 (Hard):** Weeks+. Architecturally complex, requires novel systems, significant infrastructure, or advanced AI patterns.

Each feature includes:
- **What it does** — User-facing description
- **Why it matters** — Value proposition
- **Implementation sketch** — High-level approach
- **Est. effort** — Rough time estimate

---

## Tier 1: Easy Wins (Hours → 1 Day)

### 1.1 Prompt Library / Slash Commands

**What it does:** Users save frequently used prompts as templates (e.g., `/explain`, `/summarize`, `/refactor`) and invoke them with a `/` prefix in chat. Templates support variables like `{{selection}}` or `{{language}}`.

**Why it matters:** Power users avoid retyping complex prompts. Agents already have system prompts; this gives users quick personal macros.

**Implementation sketch:**
- Add `prompt_templates` table (id, userId, name, shortcut, template, variables[])
- tRPC CRUD router
- In `ChatInput`, listen for `/` → show autocomplete dropdown → replace with template text on selection
- Variable substitution before sending

**Est. effort:** 4–6 hours

---

### 1.2 Shareable Conversation Links

**What it does:** Generate a public (or authenticated) link to any conversation that others can view read-only. Similar to sharing a Google Doc.

**Why it matters:** Collaboration — share agent outputs with teammates without exporting/importing.

**Implementation sketch:**
- Add `chatSessions.shareToken` (uuid, nullable)
- New API route `/s/:token` that renders conversation in a stripped-down view
- "Share" button in sidebar/chat header → copy link
- Optional: expiration dates, password protection

**Est. effort:** 3–4 hours

---

### 1.3 Message Copy & Export (Single Message)

**What it does:** Per-message actions: "Copy markdown", "Copy raw text", "Export as JSON". Currently only full chat operations exist.

**Why it matters:** Users frequently want to grab one code block or one response, not the entire conversation.

**Implementation sketch:**
- Add dropdown to `ChatMessage` actions (next to edit/regenerate)
- `navigator.clipboard.writeText()` for copy
- Blob + `URL.createObjectURL` for JSON download

**Est. effort:** 2–3 hours

---

### 1.4 Chat Session Folders / Tags

**What it does:** Organize conversations into collapsible folders (e.g., "Work", "Personal", "Research") or tag them. Currently sessions are a flat list.

**Why it matters:** Users with 50+ chats need organization. Search helps find; folders help browse.

**Implementation sketch:**
- Add `chatSessions.folder` (text) or `chatSessions.tags` (text[])
- Sidebar grouped by folder name
- Drag-and-drop to reorder (optional)
- No schema migration needed if using `metadata` JSONB column

**Est. effort:** 4–6 hours

---

### 1.5 Model Comparison Mode (A/B)

**What it does:** Send the same prompt to two different models simultaneously and see responses side-by-side. Useful for evaluating local vs. cloud models.

**Why it matters:** AgentHub's local-first ethos means users constantly compare Ollama models. This makes it a first-class feature.

**Implementation sketch:**
- New UI mode: split-pane chat view
- Two parallel `fetch('/api/chat/stream')` calls with different `model` params
- Both streams render independently in left/right panes
- No backend changes needed

**Est. effort:** 6–8 hours

---

### 1.6 Typing Indicator for Groups

**What it does:** When running a multi-agent group, show which agent is currently "typing" (generating) in real-time. Currently only a generic spinner exists.

**Why it matters:** Groups can take 30+ seconds. Users want to know *which* agent is active and which are waiting.

**Implementation sketch:**
- `OrchestratorEvent` already emits `agent_start` / `agent_complete`
- `ChatInterface` tracks active agent ID from SSE stream
- Show agent name + animated dots in a banner above messages

**Est. effort:** 2–3 hours

---

### 1.7 Keyboard Shortcuts Help Modal

**What it does:** `Cmd/Ctrl + ?` opens a modal showing all keyboard shortcuts. Implement shortcuts: `Cmd+K` new chat, `Esc` stop, `Cmd+Shift+Up` edit last message.

**Why it matters:** Power users expect hotkeys. The current app has zero discoverable shortcuts.

**Implementation sketch:**
- `useHotkeys` hook (or manual `keydown` listener)
- Modal component with shortcut grid
- Persist shortcuts in a constants file

**Est. effort:** 3–4 hours

---

### 1.8 Token Count Display (Per Message)

**What it does:** Show estimated token count next to each message (input + output). Uses tiktoken or a lightweight tokenizer.

**Why it matters:** Users managing context windows need visibility into token burn. The `tokensUsed` column exists but is never populated.

**Implementation sketch:**
- Add `js-tiktoken` dependency
- `estimateTokens(text)` utility
- Display in message metadata row (next to timestamp/model)
- Populate `tokensUsed` in chat stream route

**Est. effort:** 3–4 hours

---

### 1.9 Export Chat as Markdown / Text

**What it does:** "Export conversation" button → download as `.md` (formatted) or `.txt` (plain). Currently no export exists.

**Why it matters:** Users want to save conversations outside the app for documentation, blogging, or backups.

**Implementation sketch:**
- Format messages as markdown: `## You\n\ncontent\n\n## Assistant\n\ncontent`
- Blob download
- Add to chat header menu

**Est. effort:** 2–3 hours

---

### 1.10 Per-Message Timestamp Toggle

**What it does:** Show/hide exact timestamps (e.g., "2:34 PM") per message. Currently only dates are shown in the sidebar.

**Why it matters:** Debugging, reviewing conversation flow, understanding latency between messages.

**Implementation sketch:**
- `messages.createdAt` already exists
- Format with `Intl.DateTimeFormat`
- Toggle in settings or message hover

**Est. effort:** 1–2 hours

---

## Tier 2: Medium Features (Days → 1 Week)

### 2.1 Web Search with Citations

**What it does:** Agent can search the web in real-time (via SearXNG, DuckDuckGo, or Brave API) and cite sources in responses. Similar to Perplexity or ChatGPT browsing.

**Why it matters:** Local models have stale knowledge cutoffs. Web search grounds responses in current information.

**Implementation sketch:**
- **Sub-task 2.1.1:** Add `web_search` built-in tool to `agent-runtime`
  - Calls SearXNG API (self-hosted, no API key needed)
  - Returns `{title, url, snippet}` array
- **Sub-task 2.1.2:** RAG-style injection
  - Search results formatted as context block in system prompt
  - Model instructed to cite sources with `[1]`, `[2]`
- **Sub-task 2.1.3:** Citation UI
  - Clickable source chips below assistant response
  - Opens URL in new tab
- **Sub-task 2.1.4:** Settings
  - SearXNG instance URL config
  - Enable/disable per agent

**Est. effort:** 3–4 days

---

### 2.2 Voice Input / STT (Speech-to-Text)

**What it does:** Microphone button in chat input → records audio → transcribes via Whisper (local or OpenAI) → inserts text into input.

**Why it matters:** Hands-free interaction, accessibility, mobile usability.

**Implementation sketch:**
- **Sub-task 2.2.1:** Web Audio API recording
  - `MediaRecorder` for browser capture
  - Visual waveform feedback
- **Sub-task 2.2.2:** Transcription
  - Option A: Browser `Web Speech API` (free, offline, lower quality)
  - Option B: Ollama Whisper model (local, higher quality)
  - Option C: OpenAI Whisper API (cloud, best quality)
- **Sub-task 2.2.3:** UI
  - Mic button next to send button
  - Recording state (red dot, timer)
  - Transcription loading state

**Est. effort:** 2–3 days

---

### 2.3 Text-to-Speech (TTS) for Responses

**What it does:** Play button on assistant messages → reads aloud via TTS. Options: browser SpeechSynthesis, Edge TTS, or Piper (local).

**Why it matters:** Accessibility, hands-free consumption of long responses, multimodal experience.

**Implementation sketch:**
- **Sub-task 2.3.1:** Browser TTS fallback
  - `window.speechSynthesis` with voice selection
- **Sub-task 2.3.2:** Edge TTS integration (free, high quality)
  - `edge-tts` Python package or equivalent JS port
  - Stream MP3 via HTTP
- **Sub-task 2.3.3:** UI
  - Play/pause button per message
  - Global "Auto-read responses" toggle
  - Voice selector in settings

**Est. effort:** 2–3 days

---

### 2.4 Code Interpreter / Sandbox

**What it does:** Agent can write and execute Python code in a sandboxed environment, then see output (text, images, plots). Similar to ChatGPT Code Interpreter.

**Why it matters:** Data analysis, visualization, calculations beyond calculator tool, file processing.

**Implementation sketch:**
- **Sub-task 2.4.1:** Sandbox backend
  - Docker container with Python + common packages (pandas, matplotlib, numpy)
  - `execute_code` tool: accepts Python code → runs in container → returns stdout/stderr/artifacts
  - Timeout (30s), memory limit (256MB), no network
- **Sub-task 2.4.2:** Artifact rendering
  - Text output → rendered as code block
  - Image output (PNG) → rendered inline
  - `matplotlib` plots → base64 PNG
- **Sub-task 2.4.3:** File upload to sandbox
  - User uploads CSV → agent reads via `read_file` → analyzes
  - Files mounted as read-only volume in container
- **Sub-task 2.4.4:** UI
  - Expandable code execution card (like existing ToolCallCard)
  - "Run" button for manual re-execution

**Est. effort:** 5–7 days

---

### 2.5 Scheduled Automations / Recurring Tasks

**What it does:** Users schedule prompts to run automatically (e.g., "Daily news summary at 9 AM"). Results stored as new chat messages or delivered via webhook.

**Why it matters:** Proactive agents — AgentHub becomes a background intelligence layer, not just a chat UI.

**Implementation sketch:**
- **Sub-task 2.5.1:** Schema
  - `automations` table: id, userId, agentId, prompt, cron, lastRun, nextRun, isActive, webhookUrl
- **Sub-task 2.5.2:** Scheduler
  - `node-cron` or `bullmq` (Redis already running)
  - Worker process that triggers agent runs
- **Sub-task 2.5.3:** Execution
  - Reuses existing `/api/chat/stream` logic but without SSE client
  - Stores result as new message in designated session
- **Sub-task 2.5.4:** UI
  - "Automations" page: create, edit, pause, delete
  - Run history log
  - "Create automation" from any chat message ("Repeat daily")

**Est. effort:** 4–5 days

---

### 2.6 Agent Opening Messages & Questions

**What it does:** When starting a chat with an agent, show 1–3 clickable starter questions (e.g., "Explain quantum computing", "Help me debug this code"). Also support an optional opening greeting message.

**Why it matters:** Onboarding — users don't know what to ask a new agent. Starter questions guide discovery.

**Implementation sketch:**
- **Sub-task 2.6.1:** Schema
  - `agents.openingMessage` (text, nullable)
  - `agents.openingQuestions` (text[] or JSONB, default [])
- **Sub-task 2.6.2:** UI
  - Empty chat state shows agent avatar + opening message + question chips
  - Click chip → sends as user message
- **Sub-task 2.6.3:** Agent Builder
  - Textarea for opening message
  - Dynamic list input for questions (add/remove)

**Est. effort:** 2–3 days

---

### 2.7 Inline Citation / Sources Panel for RAG

**What it does:** When RAG retrieves KB chunks, show a collapsible "Sources" panel below the assistant message listing the top retrieved documents with similarity scores and excerpt previews.

**Why it matters:** Trust and verification — users need to see *where* the answer came from. Currently citations exist in the raw prompt but are invisible to users.

**Implementation sketch:**
- **Sub-task 2.7.1:** Backend
  - Modify `/api/chat/stream` to emit `rag_sources` SSE event containing chunk metadata
- **Sub-task 2.7.2:** Frontend
  - `ChatMessage` receives `ragSources` prop
  - Collapsible "Sources" section with document name, similarity %, excerpt
  - Click source → navigate to KB document view
- **Sub-task 2.7.3:** Citations in text
  - Parse `[1]`, `[2]` markers in response
  - Render as superscript links to source entries

**Est. effort:** 3–4 days

---

### 2.8 Prompt Variables / Dynamic Substitution

**What it does:** System prompts and user messages support variables like `{{USER_NAME}}`, `{{CURRENT_DATE}}`, `{{KB_NAME}}` that are substituted at runtime.

**Why it matters:** Personalization without hardcoding. One agent template works for all users.

**Implementation sketch:**
- **Sub-task 2.8.1:** Substitution engine
  - `substituteVariables(text, context)` utility
  - Built-in vars: `user.name`, `date`, `time`, `agent.name`, `kb.name`
- **Sub-task 2.8.2:** Hook into chat stream
  - Substitute before passing to `AgentRuntime`
- **Sub-task 2.8.3:** Custom variables
  - Agent builder allows defining custom vars with defaults
  - User profile page for `{{USER_NAME}}`, `{{USER_ROLE}}`, etc.

**Est. effort:** 2–3 days

---

### 2.9 Conversation Analytics Dashboard

**What it does:** Personal analytics page showing: total messages, tokens used, most-used agents, conversation frequency over time, average response latency.

**Why it matters:** Users want visibility into their usage patterns. The `tokensUsed` and `latencyMs` fields exist but are never populated or visualized.

**Implementation sketch:**
- **Sub-task 2.9.1:** Populate metrics
  - Calculate tokens in chat stream route
  - Record `latencyMs` (time from first to last chunk)
- **Sub-task 2.9.2:** Aggregations
  - tRPC queries: messages per day, tokens per agent, avg latency
- **Sub-task 2.9.3:** UI
  - `/analytics` page with charts (recharts or similar)
  - Cards: total chats, total messages, favorite agent, tokens this week

**Est. effort:** 3–4 days

---

### 2.10 MCP Marketplace UI

**What it does:** Browse, install, configure, and manage MCP (Model Context Protocol) servers. Currently `MCPClient` exists in `agent-runtime` but has no UI.

**Why it matters:** MCP is the emerging standard for tool extensibility. AgentHub needs a first-class MCP experience.

**Implementation sketch:**
- **Sub-task 2.10.1:** Schema
  - `mcpServers` table: id, userId, name, transport (stdio/http), command, url, env, isEnabled
- **Sub-task 2.10.2:** tRPC router
  - CRUD for MCP servers
  - `testConnection` mutation
  - `discoverTools` mutation (introspects server, returns tool list)
- **Sub-task 2.10.3:** UI
  - Marketplace page with pre-configured templates (filesystem, github, postgres)
  - Server config form (command, args, env vars)
  - Tool enable/disable toggles per server
  - Connection status indicator

**Est. effort:** 4–5 days

---

## Tier 3: Hard Features (Weeks+)

### 3.1 A2UI — Declarative UI Rendering

**What it does:** Agents output structured JSON (A2UI schema) that renders as interactive React components inline in chat: charts, tables, forms, buttons, calendars. The agent can later update these components via follow-up messages.

**Why it matters:** This is AgentHub's biggest architectural differentiator. Chat is text-only; A2UI makes agents output *interfaces*. A data analyst agent outputs a live chart. A task manager outputs a checklist with checkboxes.

**Implementation sketch:**
- **Sub-task 3.1.1:** A2UI Schema Design
  - JSON Schema for components: `type: "chart"`, `type: "table"`, `type: "form"`, `type: "calendar"`
  - Each component has `id`, `state`, `actions` (what happens on interaction)
- **Sub-task 3.1.2:** Renderer Engine
  - `A2UIRenderer` component: takes JSON → renders matching React component
  - Component registry: `chart` → Recharts wrapper, `table` → TanStack Table, `form` → dynamic form
  - Validation with Zod
- **Sub-task 3.1.3:** Agent Training / Prompting
  - System prompt instructs agent when to emit A2UI vs. plain text
  - Examples: "If asked to analyze data, output a chart component"
- **Sub-task 3.1.4:** Interactive State
  - User interacts with rendered UI (clicks checkbox, submits form)
  - Frontend sends action back to agent as a tool call
  - Agent responds with updated component state
- **Sub-task 3.1.5:** Artifact Persistence
  - Store component state in `messages.artifacts` JSONB
  - Rehydrate on page reload

**Est. effort:** 3–4 weeks

---

### 3.2 Code Execution Sandbox (Full)

**What it does:** A secure, persistent computing environment where agents write, execute, and debug code. Supports multiple languages, package installation, file I/O, and returns rich outputs (plots, HTML, data tables). Think Jupyter notebook meets chat.

**Why it matters:** The lightweight Docker sandbox (Tier 2) is stateless. A full sandbox maintains files across turns, installs dependencies, and feels like a real dev environment.

**Implementation sketch:**
- **Sub-task 3.2.1:** Sandbox Infrastructure
  - Long-running Docker containers per user (or per session)
  - Volume persistence across chat turns
  - WebSocket or HTTP API for code execution
- **Sub-task 3.2.2:** Multi-language Support
  - Python (primary), JavaScript (Node), Rust, Go
  - Language detection from code block
- **Sub-task 3.2.3:** File System Integration
  - Agent can `read_file`, `write_file`, `list_dir` in sandbox
  - Files visible in sidebar file tree
  - Upload/download files
- **Sub-task 3.2.4:** Rich Outputs
  - Matplotlib/Plotly → interactive charts
  - HTML → iframe preview
  - DataFrame → sortable table
  - LaTeX → rendered math
- **Sub-task 3.2.5:** Security
  - Network isolation (no outbound except whitelisted)
  - CPU/memory limits per container
  - Timeout enforcement
  - Read-only host filesystem

**Est. effort:** 4–6 weeks

---

### 3.3 CRDT Local-First Sync

**What it does:** Conversations, agents, and memory sync across devices using Conflict-free Replicated Data Types. Works offline; syncs when online. Server is optional.

**Why it matters:** AgentHub's architecture doc mentions local-first as a differentiator. Currently everything is server-dependent.

**Implementation sketch:**
- **Sub-task 3.3.1:** Yjs Integration
  - `yjs` + `y-indexeddb` for local persistence
  - Shared types: `Y.Array` for messages, `Y.Map` for agent config
- **Sub-task 3.3.2:** Sync Protocol
  - WebSocket server for real-time sync
  - Binary diff sync (minimal bandwidth)
- **Sub-task 3.3.3:** Hybrid Mode
  - Local-first: everything works offline
  - Optional server sync for backup/multi-device
  - Conflict resolution for simultaneous edits
- **Sub-task 3.3.4:** Migration Path
  - Export server data to Yjs document format
  - Gradual adoption without data loss

**Est. effort:** 4–5 weeks

---

### 3.4 Agent Task System with Dependencies

**What it does:** Users create structured task plans that agents execute autonomously. Tasks have dependencies ("Research topic" → "Write outline" → "Write draft"), deadlines, and retry logic. Agents report progress and handle failures.

**Why it matters:** Transforms AgentHub from reactive chat to proactive automation. Users delegate multi-step workflows.

**Implementation sketch:**
- **Sub-task 3.4.1:** Task Schema
  - `tasks` table: id, userId, title, description, status, parentId, dependencies[], agentId, deadline, retryCount, maxRetries
  - DAG validation (no cycles)
- **Sub-task 3.4.2:** Task Executor
  - Topological sort of dependency graph
  - Worker pool executing tasks in parallel where possible
  - Failure handling: retry with backoff → escalate to user
- **Sub-task 3.4.3:** Agent Integration
  - Each task prompts its assigned agent with context from completed dependencies
  - Output of task N becomes input for task N+1
- **Sub-task 3.4.4:** UI
  - Kanban board view (To Do / In Progress / Done)
  - Gantt chart for timelines
  - Real-time progress updates
  - Manual intervention buttons (pause, skip, retry)

**Est. effort:** 4–5 weeks

---

### 3.5 Deep Research Mode

**What it does:** User asks a complex research question. The agent autonomously plans a multi-step research strategy: break into sub-questions, search web/KB, read sources, synthesize, and produce a cited report. Similar to Gemini Deep Research or Perplexity.

**Why it matters:** Local models + RAG + web search + reasoning = a private research assistant that rivals commercial tools.

**Implementation sketch:**
- **Sub-task 3.5.1:** Research Planner
  - Agent decomposes query into sub-questions
  - Generates research plan (what to search, what to read)
- **Sub-task 3.5.2:** Iterative Retrieval
  - For each sub-question: web search + KB query
  - Read top results, extract key facts
  - Decide if more searches needed (reflection loop)
- **Sub-task 3.5.3:** Synthesis
  - Combine findings into structured report
  - Citations with URLs and source titles
  - Confidence scoring per claim
- **Sub-task 3.5.4:** UI
  - "Research Mode" toggle in chat
  - Progress indicator: "Planning → Searching 3/5 topics → Synthesizing"
  - Final output: formatted report with TOC
  - Intermediate steps visible in expandable sections

**Est. effort:** 3–4 weeks

---

### 3.6 Trust Engine + Capability-Based Sandbox

**What it does:** Every tool execution runs through a permission layer. Tools declare required capabilities ("network", "filesystem", "shell"). Users grant capabilities per-agent or per-session. Unauthorized tool calls are blocked with an explanation.

**Why it matters:** Security is critical as agents gain tool access. Users should understand and control what agents can do.

**Implementation sketch:**
- **Sub-task 3.6.1:** Capability Schema
  - Tools declare `capabilities: ["network", "filesystem.read"]` in manifest
  - Agent config stores `grantedCapabilities`
- **Sub-task 3.6.2:** Policy Engine
  - Before tool execution: check agent capabilities vs. tool requirements
  - Missing capability → block + explain + prompt for approval
  - Approval can be one-time or persistent
- **Sub-task 3.6.3:** Sandbox Integration
  - Capabilities map to Docker seccomp profiles
  - "No network" → drop network namespace
  - "Read-only filesystem" → mount volumes RO
- **Sub-task 3.6.4:** Audit Log
  - Every tool call logged: agent, tool, args, result, capabilities used
  - Admin dashboard for reviewing tool usage

**Est. effort:** 3–4 weeks

---

### 3.7 A2A Protocol Gateway

**What it does:** AgentHub speaks the A2A (Agent-to-Agent) protocol. External agents can discover, message, and collaborate with AgentHub agents over HTTP. AgentHub agents can similarly reach out to external A2A endpoints.

**Why it matters:** Cross-framework interoperability. Your AgentHub researcher can collaborate with a LangChain agent or a CrewAI agent.

**Implementation sketch:**
- **Sub-task 3.7.1:** A2A Server
  - Implement A2A protocol endpoints: `/.well-known/agent.json`, `/tasks/send`, `/tasks/get`, `/tasks/list`
  - Agent card metadata (name, description, capabilities, skills)
- **Sub-task 3.7.2:** A2A Client
  - Discover agents via agent cards
  - Send tasks to remote agents
  - Receive and process responses
- **Sub-task 3.7.3:** Agent Registry
  - `a2aAgents` table: id, url, name, capabilities, lastSeen
  - Health checking (ping agents periodically)
  - Search/filter by capability
- **Sub-task 3.7.4:** Integration with Orchestrators
  - Group patterns can include *remote* A2A agents as members
  - Supervisor delegates to external specialist agents

**Est. effort:** 4–5 weeks

---

### 3.8 Real-Time Collaborative Channels

**What it does:** Persistent shared spaces where humans and AI agents chat together in real-time. Tag `@AgentName` to summon an agent into the conversation. Multiple models can participate simultaneously. Similar to OpenWebUI Channels or Slack with bots.

**Why it matters:** Team collaboration — brainstorm with colleagues + AI agents in one thread. Agents can be summoned on-demand.

**Implementation sketch:**
- **Sub-task 3.8.1:** Real-Time Transport
  - WebSocket or SSE for live message delivery
  - Presence indicators (who's online)
- **Sub-task 3.8.2:** Channel Schema
  - `channels` table: id, name, type (public/private/direct)
  - `channelMembers` table: userId + agentId (agents are members too)
  - `channelMessages` table (or reuse messages with channelId)
- **Sub-task 3.8.3:** @Agent Mentions
  - Parse `@AgentName` in messages
  - Trigger agent response with channel context
  - Agent sees full channel history as context
- **Sub-task 3.8.4:** Threading
  - Reply to specific messages
  - Threads collapse/expand
- **Sub-task 3.8.5:** Permissions
  - Who can add agents, who can view history
  - Agent access scopes

**Est. effort:** 4–5 weeks

---

### 3.9 Graph-Based RAG (Knowledge Graphs)

**What it does:** Beyond vector similarity, extract entities and relationships from documents to build a knowledge graph. Queries traverse the graph ("What projects does Alice work on?" → traverse `Person-worksOn->Project`).

**Why it matters:** Vector RAG answers "what is similar?" Graph RAG answers "what is connected?" Critical for structured domain knowledge.

**Implementation sketch:**
- **Sub-task 3.9.1:** Entity Extraction
  - Post-ingest step: run NER + relation extraction on chunks
  - Store entities in `entities` table (id, type, name, documentId)
  - Store relations in `relations` table (id, sourceId, targetId, type, documentId)
- **Sub-task 3.9.2:** Graph Database
  - Option A: Neo4j (powerful, external dependency)
  - Option B: PostgreSQL with `pg_graphql` or recursive CTEs
  - Option C: In-memory graph + periodic sync
- **Sub-task 3.9.3:** Query Interface
  - Natural language → graph traversal
  - "Who reports to Bob?" → `MATCH (e:Employee)-[:REPORTS_TO]->(b:Employee {name:"Bob"})`
  - Hybrid: vector + graph results combined
- **Sub-task 3.9.4:** Visualization
  - Force-directed graph of entities in KB manager
  - Click entity → see all connected documents

**Est. effort:** 5–6 weeks

---

### 3.10 Model Fine-Tuning Pipeline

**What it does:** Users export conversation data as training datasets and kick off local fine-tuning jobs (via Ollama, unsloth, or axolotl). Monitor training progress and deploy the fine-tuned model.

**Why it matters:** Personalized agents. Train a model on your writing style, domain knowledge, or conversation history.

**Implementation sketch:**
- **Sub-task 3.10.1:** Dataset Export
  - Filter conversations by agent → export as ShareGPT or Alpaca format
  - Deduplication and quality filtering
- **Sub-task 3.10.2:** Training Job Queue
  - Submit jobs to `unsloth` or `axolotl` (Python scripts)
  - Track progress (loss curves, epochs)
  - GPU scheduling (if multi-GPU)
- **Sub-task 3.10.3:** Model Deployment
  - Export to GGUF (quantized)
  - Register new model in Ollama
  - Auto-add to AgentHub model selector
- **Sub-task 3.10.4:** Evaluation
  - Benchmark against base model
  - A/B test in chat

**Est. effort:** 6–8 weeks

---

## Recommended Prioritization

### Immediate Next (Highest ROI)

| Feature | Tier | Why Now |
|---------|------|---------|
| Web Search with Citations (2.1) | Medium | Local models need current info; SearXNG is free/self-hosted |
| Prompt Library / Slash Commands (1.1) | Easy | Huge UX boost for power users; minimal code |
| Inline Citation / Sources Panel (2.7) | Medium | RAG is shipped but invisible; this surfaces it |
| Code Interpreter Sandbox (2.4) | Medium | Differentiator; Docker already in stack |
| Voice Input STT (2.2) | Medium | Accessibility + mobile; Web Speech API is free |

### Short-Term (Next 2–3 Sprints)

| Feature | Tier | Why Soon |
|---------|------|----------|
| Scheduled Automations (2.5) | Medium | Proactive agents > reactive chat |
| Model Comparison Mode (1.5) | Easy | Local-first users compare models constantly |
| MCP Marketplace UI (2.10) | Medium | MCP is the emerging tool standard |
| TTS for Responses (2.3) | Medium | Completes multimodal loop with STT |
| Agent Opening Messages (2.6) | Medium | Onboarding friction reduction |

### Long-Term (Strategic Differentiators)

| Feature | Tier | Why Strategic |
|---------|------|---------------|
| A2UI Declarative Rendering (3.1) | Hard | AgentHub's defining feature — agents output UI |
| Deep Research Mode (3.5) | Hard | Positions against Perplexity/ChatGPT |
| A2A Protocol Gateway (3.7) | Hard | Cross-framework interoperability |
| CRDT Local-First Sync (3.3) | Hard | Architecture differentiation |
| Agent Task System (3.4) | Hard | From chat to autonomous workflows |

---

## Out of Scope (Deliberately Excluded)

| Feature | Reason |
|---------|--------|
| 40+ cloud provider integrations | AgentHub is local-first; cloud is gateway-only |
| Image generation (DALL-E/FLUX) | Use ComfyUI/FLUX externally; not core to agent platform |
| Video recognition | Too niche; out of scope for v1 |
| Native mobile apps | PWA + responsive web sufficient |
| Desktop app (Electron/Tauri) | Web-first; packaging later if demand |
| Telegram/Discord bots | A2A protocol enables third-party bridges |
| Commercial white-label / license tiers | Open source only |
| Langfuse/observability dashboards | Out of scope; basic analytics in Tier 2 |
| SCIM 2.0 / enterprise provisioning | Single-tenant for now |

---

*This document should be reviewed quarterly. Features move between tiers as the codebase evolves and dependencies are resolved.*

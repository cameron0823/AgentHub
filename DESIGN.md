# AgentHub System Design

> **Version:** 1.0  
> **Status:** Archived design snapshot. `TODO.md` is the canonical current tracker and completion source.
> **Goal:** Complete feature-parity design for a local-first AI agent platform matching LobeHub capabilities.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Feature Specifications](#2-feature-specifications)
3. [Data Model](#3-data-model)
4. [Agent Runtime](#4-agent-runtime)
5. [Memory System](#5-memory-system)
6. [Plugin & MCP System](#6-plugin--mcp-system)
7. [Knowledge Base & RAG](#7-knowledge-base--rag)
8. [Voice System](#8-voice-system)
9. [Search Integration](#9-search-integration)
10. [Image Generation](#10-image-generation)
11. [Security Model](#11-security-model)

---

## 1. Design Principles

### 1.1 Local-First

- The application must function **fully without internet** after initial setup.
- All AI inference happens locally via Ollama or compatible runtimes.
- Data is stored locally in SQLite by default.
- Cloud services are **opt-in only**, never required.

### 1.2 Zero Configuration

- `npm run dev` should start a working application with sensible defaults.
- Ollama auto-detection on startup (ping `localhost:11434`).
- Default models are suggested but not auto-downloaded (respect user bandwidth).

### 1.3 Privacy by Default

- No telemetry without explicit opt-in.
- No data sent to external APIs unless user explicitly configures them.
- All file processing (PDF extraction, image analysis) happens locally.

### 1.4 Progressive Enhancement

- Core chat works with just Ollama.
- Knowledge base adds LanceDB.
- Voice adds Piper + Whisper.
- Image generation adds ComfyUI.
- Web search adds SearxNG.
- Each feature is independently enableable.

### 1.5 Model Agnostic

- Abstract `ModelProvider` interface allows swapping between local and cloud models.
- User can switch models mid-conversation.
- Each agent can be bound to a specific model.

---

## 2. Feature Specifications

### 2.1 Agent Builder

**User Story:** As a user, I want to create a specialized AI agent with a custom role, system prompt, and tools so that it can help me with specific tasks.

**Specification:**

- Agent config object:
  ```typescript
  interface Agent {
    id: string;
    name: string;
    description: string;
    avatar?: string;
    systemPrompt: string;
    model: string; // e.g., "qwen2.5:14b"
    temperature: number; // 0.0 - 2.0
    maxTokens: number;
    tools: string[]; // tool IDs or MCP server refs
    knowledgeBaseIds: string[];
    memoryEnabled: boolean;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
  }
  ```
- Builder UI: 3-step wizard
  1. **Basics:** Name, description, avatar upload/generation
  2. **Persona:** System prompt with template variables (`{{user_name}}`, `{{date}}`, `{{time}}`)
  3. **Capabilities:** Model selector, temperature slider, tool picker, knowledge base linker
- Template library: Pre-built agents (Coder, Writer, Researcher, etc.)
- Export/import: Share agents as JSON files

### 2.2 Agent Groups (Multi-Agent Collaboration)

**User Story:** As a user, I want multiple agents to collaborate on a task so that I get higher quality, cross-checked results.

**Specification:**

- Group config:

  ```typescript
  interface AgentGroup {
    id: string;
    name: string;
    description: string;
    pattern: "supervisor" | "parallel" | "sequential" | "debate";
    agents: GroupAgent[];
    sharedContext: boolean;
    maxRounds: number; // for debate
  }

  interface GroupAgent {
    agentId: string;
    role: "supervisor" | "executor" | "critic" | "judge";
    order?: number; // for sequential
  }
  ```

- **Supervisor-Executor Pattern:**
  1. Supervisor receives user task
  2. Supervisor breaks task into subtasks
  3. Subtasks dispatched to executors in parallel
  4. Results collected by supervisor
  5. Supervisor synthesizes final response

- **Parallel Pattern:**
  1. Same task sent to N agents simultaneously
  2. Results aggregated (concatenated, voted, or merged)

- **Sequential Pattern:**
  1. Agent A processes input → output
  2. Output becomes input for Agent B
  3. Chain continues...

- **Debate Pattern:**
  1. Two agents argue opposing sides
  2. Judge agent evaluates and picks winner / synthesizes
  3. Max rounds configurable

- UI: Visual workflow builder (react-flow) for designing groups

### 2.3 Branching Conversations

**User Story:** As a user, I want to fork a conversation at any point to explore different directions without losing the original thread.

**Specification:**

- Message schema with tree structure:
  ```typescript
  interface Message {
    id: string;
    sessionId: string;
    parentId: string | null; // null = root
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    reasoning?: string; // CoT content
    artifacts?: Artifact[];
    toolCalls?: ToolCall[];
    model?: string;
    createdAt: Date;
  }
  ```
- UI displays active branch as linear chat
- Side panel shows tree visualization (Git-like graph)
- "Fork Thread" action on any message creates new branch
- Two fork modes:
  - **Continuation:** New branch continues from this point
  - **Standalone:** New branch uses message as isolated context

### 2.4 Chain of Thought Visualization

**User Story:** As a user, I want to see an AI's reasoning process step by step so I can verify its logic.

**Specification:**

- Detect reasoning content from models that support it:
  - DeepSeek R1: `<think>...</think>` tags
  - QwQ: Implicit reasoning in output
  - OpenAI o1/o3: `reasoning_effort` parameter
- Stream reasoning content separately from final answer
- UI: Collapsible "Thinking..." panel above final response
- Reasoning is stored in `Message.reasoning` field
- User can expand/collapse per message

### 2.5 Artifacts Support

**User Story:** As a user, I want the AI to generate and render interactive content (code, SVG, HTML) directly in the chat.

**Specification:**

- Parser detects artifact blocks in LLM output:

  ````markdown
  :::artifact{type="react" title="Counter Component"}

  ```tsx
  export default function Counter() { ... }
  ```

  :::
  ````

- Supported artifact types:
  | Type | Renderer | Sandbox |
  |------|----------|---------|
  | `code` | react-syntax-highlighter | No |
  | `react` | react-live | Yes (iframe) |
  | `svg` | Inline SVG | Yes (sanitized) |
  | `html` | iframe | Yes ( CSP + sandbox ) |
  | `mermaid` | mermaid.js | No |
  | `markdown` | Custom MDX | No |
- Artifact sandbox: iframe with `sandbox="allow-scripts"` + strict CSP
- User can download, copy, or fork artifacts

### 2.6 Custom Themes

**Specification:**

- CSS variable-based theming:
  ```css
  :root {
    --background: #ffffff;
    --foreground: #171717;
    --primary: #3b82f6;
    --radius: 0.5rem;
    /* ... 50+ variables */
  }
  ```
- Preset themes: Light, Dark, Midnight, Solarized, High Contrast
- User can override any variable
- Import/export theme as JSON
- Sync with system preference by default

---

## 3. Data Model

### 3.1 Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    User     │◄──────┤   Session   │◄──────┤   Message   │
│             │   1:M │             │   1:M │             │
│ id          │       │ id          │       │ id          │
│ email       │       │ userId      │       │ sessionId   │
│ name        │       │ agentId     │       │ parentId    │
│ preferences │       │ title       │       │ role        │
│ createdAt   │       │ model       │       │ content     │
└─────────────┘       │ createdAt   │       │ reasoning   │
                      └─────────────┘       │ artifacts   │
                            │               │ createdAt   │
                            │               └─────────────┘
                            │
                      ┌─────┴─────┐
                      │  Agent    │
                      │           │
                      │ id        │
                      │ name      │
                      │ prompt    │
                      │ model     │
                      │ tools     │
                      │ memory    │
                      └─────┬─────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
  ┌─────┴─────┐      ┌─────┴─────┐      ┌─────┴─────┐
  │  Memory   │      │ Knowledge │      │  Tool     │
  │  Entry    │      │   Base    │      │  Config   │
  └───────────┘      └───────────┘      └───────────┘
```

### 3.2 Schema (SQLite)

```sql
-- Users (only needed when auth is enabled)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  avatar TEXT,
  preferences TEXT, -- JSON
  created_at INTEGER DEFAULT (unixepoch())
);

-- Sessions (conversations)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id),
  title TEXT DEFAULT 'New Chat',
  model TEXT,
  metadata TEXT, -- JSON: temperature, maxTokens, etc.
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Messages (tree structure for branching)
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES messages(id),
  role TEXT CHECK(role IN ('user', 'assistant', 'system', 'tool')) NOT NULL,
  content TEXT NOT NULL,
  reasoning TEXT,
  model TEXT,
  tool_calls TEXT, -- JSON array
  artifacts TEXT, -- JSON array
  tokens_used INTEGER,
  latency_ms INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Agents
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  avatar TEXT,
  system_prompt TEXT NOT NULL,
  model TEXT DEFAULT 'qwen2.5:7b',
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  tools TEXT DEFAULT '[]', -- JSON array of tool IDs
  knowledge_base_ids TEXT DEFAULT '[]',
  memory_enabled INTEGER DEFAULT 1,
  tags TEXT DEFAULT '[]',
  is_public INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Memory (white-box, structured)
CREATE TABLE memory_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT,
  category TEXT CHECK(category IN ('fact', 'preference', 'goal', 'context')),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  source_message_id TEXT,
  is_edited INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Knowledge Bases
CREATE TABLE knowledge_bases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  embedding_model TEXT DEFAULT 'nomic-embed-text',
  chunk_size INTEGER DEFAULT 512,
  chunk_overlap INTEGER DEFAULT 50,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Knowledge Base Documents
CREATE TABLE kb_documents (
  id TEXT PRIMARY KEY,
  kb_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  content_text TEXT,
  metadata TEXT, -- JSON: page count, etc.
  created_at INTEGER DEFAULT (unixepoch())
);

-- Agent Groups
CREATE TABLE agent_groups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  pattern TEXT CHECK(pattern IN ('supervisor', 'parallel', 'sequential', 'debate')),
  shared_context INTEGER DEFAULT 1,
  max_rounds INTEGER DEFAULT 3,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Group Members
CREATE TABLE group_members (
  group_id TEXT REFERENCES agent_groups(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  role TEXT CHECK(role IN ('supervisor', 'executor', 'critic', 'judge')),
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (group_id, agent_id)
);

-- MCP Servers
CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  transport TEXT CHECK(transport IN ('stdio', 'sse')),
  command TEXT, -- for stdio: "npx -y @modelcontextprotocol/server-filesystem"
  args TEXT, -- JSON array
  env TEXT, -- JSON object
  url TEXT, -- for sse
  status TEXT DEFAULT 'inactive', -- inactive, active, error
  tools TEXT, -- JSON: discovered tools cache
  created_at INTEGER DEFAULT (unixepoch())
);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);
```

---

## 4. Agent Runtime

### 4.1 Model Provider Interface

```typescript
interface ModelProvider {
  readonly id: string;
  readonly name: string;
  readonly type: "local" | "cloud";

  // Discovery
  listModels(): Promise<ModelInfo[]>;
  healthCheck(): Promise<{ status: "healthy" | "unhealthy"; latency: number }>;

  // Chat
  chat(options: ChatOptions): Promise<ChatResponse>;
  streamChat(options: ChatOptions): AsyncIterable<ChatStreamChunk>;

  // Embeddings
  embed(texts: string[]): Promise<number[][]>;
}

interface ChatOptions {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  tools?: Tool[];
  stream?: boolean;
}
```

### 4.2 Provider Implementations

| Provider  | Class               | Endpoint                    | Notes                              |
| --------- | ------------------- | --------------------------- | ---------------------------------- |
| Ollama    | `OllamaProvider`    | `http://localhost:11434`    | Primary. OpenAI-compatible subset. |
| LM Studio | `LMStudioProvider`  | `http://localhost:1234/v1`  | OpenAI-compatible                  |
| vLLM      | `VLLMProvider`      | `http://localhost:8000/v1`  | OpenAI-compatible                  |
| OpenAI    | `OpenAIProvider`    | `https://api.openai.com/v1` | Optional cloud fallback            |
| Anthropic | `AnthropicProvider` | `https://api.anthropic.com` | Optional cloud fallback            |

### 4.3 Tool Calling Flow

```
User Input
    │
    ▼
┌─────────────┐
│  LLM Call   │ ──(with tools schema)──►
└─────────────┘
    │
    ▼
[LLM requests tool call?]
    │ Yes              │ No
    ▼                  ▼
┌──────────┐    ┌────────────┐
│ Execute  │    │  Return    │
│  Tool    │    │  Response  │
└────┬─────┘    └────────────┘
     │
     ▼
┌─────────────┐
│  Tool Result │ ──(injected into context)──► Loop back to LLM Call
└─────────────┘
```

Tool execution is **synchronous** and **blocking** by default. Timeout: 30s per tool.

### 4.4 Streaming Protocol

Server-Sent Events (SSE) for streaming responses:

```
event: message
data: {"type": "reasoning", "content": "Let me think about this..."}

event: message
data: {"type": "content", "content": "The answer is"}

event: message
data: {"type": "tool_call", "tool": "calculator", "args": {"expr": "2+2"}}

event: message
data: {"type": "tool_result", "tool": "calculator", "result": "4"}

event: message
data: {"type": "content", "content": "42"}

event: done
data: {}
```

---

## 5. Memory System

### 5.1 White-Box Memory

Unlike opaque "memory" in most systems, AgentHub memory is:

- **Structured:** Key-value pairs with categories (fact, preference, goal, context)
- **Editable:** Users can view, modify, or delete any memory entry
- **Attributed:** Each entry tracks its source (which conversation it came from)
- **Scored:** Confidence score (0-1) based on extraction certainty

### 5.2 Memory Extraction Pipeline

After every conversation session:

```
Conversation History
        │
        ▼
┌───────────────────┐
│ Summarizer (LLM)  │ ──► Session summary
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Fact Extractor    │ ──► Proposed memory entries
│ (LLM + structured │     ["user_likes_dark_mode", "user_works_in_python"]
│   output)         │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Deduplication     │ ──► Merge with existing; update confidence
│ (Embedding sim)   │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ User Review       │ ──► (Optional) User approves/rejects proposed entries
│ (UI Notification) │
└───────────────────┘
```

### 5.3 Memory Retrieval

At the start of each conversation:

1. Embed the user's first message
2. Semantic search over memory entries (top-k = 5)
3. Inject retrieved memories into system prompt:
   ```
   [User Context]
   - User prefers dark mode
   - User is a Python developer
   - User is learning Rust
   ```

---

## 6. Plugin & MCP System

### 6.1 Architecture

```
┌─────────────────────────────────────────────┐
│              AgentHub Core                   │
│  ┌─────────────┐      ┌─────────────────┐   │
│  │  Tool Registry│◄────│  MCP Client     │   │
│  │             │      │  (stdio + SSE)  │   │
│  └──────┬──────┘      └─────────────────┘   │
│         │                                    │
│  ┌──────┴──────┐      ┌─────────────────┐   │
│  │  Custom Tools│      │  MCP Server     │   │
│  │  (built-in) │      │  (external)     │   │
│  └─────────────┘      └─────────────────┘   │
└─────────────────────────────────────────────┘
```

### 6.2 Built-in Custom Tools

| Tool           | Description         | Local Implementation      |
| -------------- | ------------------- | ------------------------- |
| `web_search`   | Search the internet | SearxNG API or DuckDuckGo |
| `read_file`    | Read local files    | Node.js fs                |
| `write_file`   | Write local files   | Node.js fs                |
| `execute_code` | Run Python/JS       | Deno sandbox or Docker    |
| `calculator`   | Math evaluation     | mathjs                    |
| `datetime`     | Current time/date   | Native                    |
| `fetch_url`    | Read web page       | fetch + readability       |

### 6.3 MCP Integration

**Discovery:**

1. User adds MCP server (command + args, or SSE URL)
2. AgentHub spawns process (stdio) or connects (SSE)
3. Call `tools/list` to discover available tools
4. Parse JSONSchema for each tool
5. Convert to internal Tool format
6. Cache tool definitions

**Execution:**

1. LLM generates tool call with name + arguments
2. MCP client validates arguments against schema
3. Call `tools/call` with arguments
4. Return result to LLM

**Security:**

- MCP servers run as separate processes
- File system access restricted to user-configured directories
- Network access: prompt user before external HTTP calls
- Code execution: isolated Docker/Deno sandbox

### 6.4 Agent Marketplace

- Agents stored as JSON files in a GitHub repository (agenthub-marketplace)
- Index file (`agents.json`) with metadata
- One-click import: fetch JSON → validate schema → insert into local DB
- Export: serialize agent config → generate shareable JSON
- Community voting / ratings (optional, requires server)

---

## 7. Knowledge Base & RAG

### 7.1 Document Ingestion Pipeline

```
File Upload
    │
    ▼
┌───────────────────┐
│ Format Detection  │ ──► mime-type from extension + magic bytes
└───────────────────┘
    │
    ▼
┌───────────────────┐
│ Text Extraction   │
│                   │
│ • PDF  ──► pdf-parse / pdfjs
│ • DOCX ──► mammoth.js
│ • TXT  ──► direct
│ • MD   ──► direct
│ • HTML ──► readability
│ • CSV  ──► direct
│ • Images ──► OCR (tesseract.js or LLaVA)
└───────────────────┘
    │
    ▼
┌───────────────────┐
│ Chunking          │ ──► Recursive character splitter
│                   │     Default: 512 tokens, 50 overlap
└───────────────────┘
    │
    ▼
┌───────────────────┐
│ Embedding         │ ──► Ollama embed endpoint
│                   │     Model: nomic-embed-text
└───────────────────┘
    │
    ▼
┌───────────────────┐
│ Storage           │ ──► LanceDB
│                   │     Collection per knowledge base
└───────────────────┘
```

### 7.2 Retrieval Strategy

**Hybrid Search:**

1. **Keyword Search:** SQLite FTS5 on document content
2. **Vector Search:** LanceDB cosine similarity on embeddings
3. **Reciprocal Rank Fusion (RRF):** Combine keyword + vector scores
4. **Re-ranking:** Cross-encoder re-ranker (optional, local model)

**Context Injection:**

- Retrieved chunks inserted into system prompt:
  ```
  [Knowledge Base: "Company Docs"]
  ---
  Chunk 1: ...
  Chunk 2: ...
  ---
  ```
- Max chunks: 5 (configurable)
- Max tokens per chunk: 512

---

## 8. Voice System

### 8.1 Text-to-Speech Pipeline

```
Assistant Response
        │
        ▼
┌───────────────────┐
│ Text Segmentation │ ──► Split by sentence / paragraph
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Piper TTS Server  │ ──► HTTP POST /synthesize
│ (localhost:5000)  │     Voice: user-selected
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Audio Streaming   │ ──► Stream PCM/WAV to Web Audio API
│ (Chunked)         │
└───────────────────┘
```

**Voices:**

- Piper ships with 20+ pre-trained voices
- User can download additional voice models
- Voice per agent configurable

### 8.2 Speech-to-Text Pipeline

```
Microphone Input
        │
        ▼
┌───────────────────┐
│ VAD (silero-vad)  │ ──► Detect speech start/end
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ faster-whisper    │ ──► Transcribe audio chunk
│ (localhost:8001)  │     Model: base / small / medium
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Text Injection    │ ──► Insert into chat input
└───────────────────┘
```

### 8.3 Voice Mode (Full-Duplex)

- Press-and-hold or toggle for voice mode
- STT continuously streams transcription
- LLM processes text and streams response
- TTS speaks response in real-time
- User can interrupt (barge-in) with new speech

---

## 9. Search Integration

### 9.1 SearxNG (Primary)

- Self-hosted meta-search engine
- Aggregates results from 70+ search engines
- No API keys required
- JSON API: `http://localhost:8080/search?q={query}&format=json`
- User can configure which engines to include

### 9.2 DuckDuckGo Lite (Fallback)

- HTML scraping of DuckDuckGo Lite
- No API key, no self-hosting
- Rate limit: conservative (1 req/sec)
- Less reliable (HTML changes)

### 9.3 Search Tool

```typescript
interface SearchTool {
  name: "web_search";
  parameters: {
    query: string;
    num_results?: number; // default 5, max 10
    recency_days?: number; // filter by date
  };
  returns: {
    results: {
      title: string;
      url: string;
      snippet: string;
      source: string;
    }[];
  };
}
```

---

## 10. Image Generation

### 10.1 ComfyUI Integration

- ComfyUI runs as separate service (localhost:8188)
- AgentHub communicates via ComfyUI HTTP API
- Pre-configured workflows:
  - **Text-to-Image:** Standard SDXL / Flux generation
  - **Image-to-Image:** Variation/editing
  - **Upscale:** 2x/4x upscaling

### 10.2 Image Tool

```typescript
interface ImageTool {
  name: "generate_image";
  parameters: {
    prompt: string;
    negative_prompt?: string;
    width?: number;
    height?: number;
    steps?: number;
    cfg_scale?: number;
    model?: string; // checkpoint name
  };
  returns: {
    image_url: string; // local path / data URL
    seed: number;
    metadata: object;
  };
}
```

### 10.3 Vision Tool

For image understanding (multimodal):

```typescript
interface VisionTool {
  name: "analyze_image";
  parameters: {
    image_url: string; // local path or data URL
    query?: string; // specific question about image
  };
  // Uses LLaVA / Qwen2-VL via Ollama
}
```

---

## 11. Security Model

### 11.1 Threat Model

| Threat                              | Severity     | Mitigation                                              |
| ----------------------------------- | ------------ | ------------------------------------------------------- |
| MCP server executes malicious code  | **Critical** | Sandboxed execution; readonly FS default; user approval |
| LLM generates harmful content       | Medium       | System prompt hardening; optional moderation model      |
| Local file exfiltration             | Medium       | Path traversal prevention; sandboxed paths              |
| API key leakage (if cloud used)     | Medium       | Server-side encryption; no client-side storage          |
| Prompt injection via uploaded files | Medium       | Content sanitization; prompt boundary markers           |
| Unauthorized access (multi-user)    | Medium       | Session management; CSRF protection; rate limiting      |

### 11.2 MCP Sandbox

```
┌─────────────────────────────────────────────┐
│  MCP Server Process                         │
│  ┌─────────────────────────────────────┐    │
│  │  Deno / Docker Sandbox              │    │
│  │  • No network (default)             │    │
│  │  • Read-only filesystem             │    │
│  │  • Resource limits (CPU, memory)    │    │
│  │  • Timeout: 30s per call            │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### 11.3 Content Security

- Artifact iframes: `sandbox="allow-scripts"` + strict CSP
- Markdown rendering: DOMPurify sanitization
- File uploads: Extension whitelist, size limits, virus scanning (ClamAV optional)

---

## Appendix A: Environment Variables

```bash
# === Required (have defaults) ===
DATABASE_URL="file:./data/agenthub.db"  # SQLite path
LANCEDB_PATH="./data/lancedb"           # Vector store path

# === Optional Local Services ===
OLLAMA_URL="http://localhost:11434"
LMSTUDIO_URL="http://localhost:1234/v1"
SEARXNG_URL="http://localhost:8080"
COMFYUI_URL="http://localhost:8188"
PIPER_URL="http://localhost:5000"
WHISPER_URL="http://localhost:8001"

# === Optional Cloud Providers (user opt-in) ===
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
GOOGLE_API_KEY=""
GROQ_API_KEY=""

# === Auth (optional for single-user mode) ===
BETTER_AUTH_SECRET=""
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# === Advanced ===
LOG_LEVEL="info"
MAX_UPLOAD_SIZE="50mb"
ENABLE_TELEMETRY="false"
```

---

## Appendix B: Directory Structure

```
AgentHub/
├── apps/
│   └── web/                    # Next.js 14 application
│       ├── src/
│       │   ├── app/            # App Router (SSR pages)
│       │   ├── spa/            # React Router SPA (chat UI)
│       │   ├── components/     # Shared UI components
│       │   ├── hooks/          # React hooks
│       │   ├── stores/         # Zustand stores
│       │   ├── lib/            # Utilities
│       │   ├── server/         # tRPC routers, API routes
│       │   └── types/          # TypeScript types
│       └── public/
├── packages/
│   ├── ai-providers/           # Model provider abstractions
│   ├── agent-runtime/          # Agent orchestration engine
│   ├── mcp-client/             # MCP client implementation
│   ├── knowledge-base/         # RAG pipeline
│   ├── memory-engine/          # White-box memory system
│   └── ui/                     # Shared UI components
├── services/
│   └── docker/                 # Docker compose files for local services
├── docs/
│   ├── DESIGN.md
│   ├── ARCHITECTURE.md
│   ├── IMPLEMENTATION_PLAN.md
│   └── RESEARCH.md
└── README.md
```

---

## 12. CRDT Sync & Multi-Device Architecture

> **Requirement 1.1:** Conflict-Free Replicated Data Type (CRDT) technology for seamless multi-device synchronization without a central server.

> Current implementation note: ADR 0002 supersedes this CRDT sync design. PostgreSQL + pgvector is the supported system of record in the current app, and IndexedDB/Yjs/WebRTC sync is future experimental work only behind `AGENTHUB_EXPERIMENTAL_LOCAL_SYNC`.

### 12.1 Design Goals

- **No central server required** for sync — devices communicate peer-to-peer or via optional relay.
- **Offline-first:** Each device maintains full local state (SQLite + LanceDB).
- **Eventual consistency:** Conflicts resolve automatically via CRDT semantics.
- **Selective sync:** Users choose which workspaces/agents sync across devices.

### 12.2 Technology Stack

| Layer         | Technology                                          | Role                                                |
| ------------- | --------------------------------------------------- | --------------------------------------------------- |
| Document sync | **Yjs**                                             | CRDT document for messages, sessions, agent configs |
| Database sync | **Electric SQL**                                    | SQLite replication with conflict-free merges        |
| Transport     | **WebRTC** (P2P) + **WebSocket relay** (fallback)   | Direct device-to-device or relayed sync             |
| Discovery     | **mDNS** (local network) + **sync tokens** (remote) | Device discovery without central registry           |

### 12.3 Sync Architecture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  Laptop     │◄───────►│   Phone     │◄───────►│   Desktop   │
│  (SQLite)   │  Yjs    │  (SQLite)   │  Yjs    │  (SQLite)   │
│  + LanceDB  │  sync   │  + LanceDB  │  sync   │  + LanceDB  │
└─────────────┘         └─────────────┘         └─────────────┘
       │                       │                       │
       └───────────────────────┼───────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │  Optional Relay     │
                    │  (WebSocket server) │
                    └─────────────────────┘
```

### 12.4 Data Structure Mapping

Yjs documents are organized by entity type:

```typescript
// y-doc structure per workspace
interface WorkspaceDoc {
  sessions: Y.Map<Session>; // Yjs Map for key-value CRDT
  messages: Y.Map<Y.Array<Message>>; // Yjs Array for ordered sequences
  agents: Y.Map<Agent>;
  memory: Y.Array<MemoryEntry>;
  settings: Y.Map<Setting>;
}
```

**CRDT rules:**

- `sessions`: Map CRDT — last-write-wins on scalar fields, merge on messages array
- `messages`: Array CRDT — insertions/deletions merge automatically; concurrent edits to same message: text CRDT resolves
- `agents`: Map CRDT — full agent config replicated; version vector tracks edits
- `memory`: Array CRDT — new entries append; no deletion without explicit user action

### 12.5 Conflict Resolution

| Conflict Type                | Resolution Strategy                                 |
| ---------------------------- | --------------------------------------------------- |
| Concurrent message edits     | Text CRDT (Y.Text) — preserves both edits           |
| Session title changes        | Last-write-wins with timestamp                      |
| Agent config changes         | Merge JSON deeply; conflicting keys → user prompt   |
| Memory entry edits           | Flag as "conflicted"; show both versions in UI      |
| Branching conversation forks | Both branches preserved; user chooses active branch |

### 12.6 Sync Flow

```
Device A makes change
        │
        ▼
┌───────────────────┐
│ Update Yjs Doc    │ ──► Local SQLite updated optimistically
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Encode Update     │ ──► Binary Yjs update (~100 bytes for text insert)
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Broadcast         │ ──► WebRTC to peers OR WebSocket relay
└───────────────────┘
        │
        ▼
Device B receives update
        │
        ▼
┌───────────────────┐
│ Apply to Yjs Doc  │ ──► CRDT merge (no conflicts for concurrent inserts)
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Sync to SQLite    │ ──► Electric SQL applies to local DB
└───────────────────┘
```

### 12.7 Security

- **End-to-end encryption:** All sync traffic encrypted with AES-256-GCM via shared sync key
- **Sync key:** Derived from user password + salt (PBKDF2); never transmitted
- **Relay server:** Cannot read document content; only routes encrypted blobs

---

## 13. Async Job Queue & Task Orchestration

> **Requirement 1.3:** Built-in Celery and Redis queuing to manage long-running asynchronous agentic flows.

### 13.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AgentHub API Server                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  API Routes │  │  tRPC       │  │  Task Enqueuer      │ │
│  │  (Next.js)  │  │  Routers    │  │  (BullMQ/Celery)    │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         └─────────────────┴────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼ enqueue job
┌─────────────────────────────────────────────────────────────┐
│                    Redis Broker (BullMQ)                     │
│  • Job queues: ingest, embed, generate-image, agent-flow    │
│  • Priority: high (user-facing), low (background)           │
│  • Delayed jobs: scheduled agent runs                       │
└─────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Worker: Ingest│    │ Worker: Agent │    │ Worker: Image │
│ (PDF→chunks)  │    │ (Long flows)  │    │ (ComfyUI)     │
└───────────────┘    └───────────────┘    └───────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ SQLite result │    │ SQLite result │    │ File storage  │
└───────────────┘    └───────────────┘    └───────────────┘
```

### 13.2 Job Types

| Queue            | Purpose                                 | Max Runtime | Retry Strategy                 |
| ---------------- | --------------------------------------- | ----------- | ------------------------------ |
| `ingest`         | Document parsing + chunking + embedding | 10 min      | 3 retries, exponential backoff |
| `agent-flow`     | Long-running multi-agent workflows      | 30 min      | 1 retry (checkpoint resume)    |
| `generate-image` | ComfyUI image generation                | 5 min       | 2 retries                      |
| `memory-extract` | Post-session memory extraction          | 2 min       | 2 retries                      |
| `sync`           | CRDT sync broadcast                     | 30s         | 5 retries                      |
| `email`          | Outbound notifications                  | 1 min       | 3 retries                      |

### 13.3 Celery-Equivalent in Node.js

Since AgentHub is TypeScript/Node.js based, we use **BullMQ** (Redis-backed) instead of Celery:

```typescript
// Task definition
interface AgentFlowJob {
  id: string;
  type: "agent-flow";
  payload: {
    groupId: string;
    task: string;
    context: ExecutionContext;
    checkpointInterval: number; // seconds
  };
  priority: number;
  timeout: number;
}

// Worker implementation
const agentFlowWorker = new Worker(
  "agent-flow",
  async (job) => {
    const checkpointManager = new CheckpointManager(job.id);
    const orchestrator = new StatefulGraphOrchestrator(checkpointManager);

    for await (const event of orchestrator.execute(job.data.payload)) {
      await job.updateProgress(event);
      // WebSocket broadcast to subscribed clients
      await broadcastToSession(job.data.payload.sessionId, event);
    }
  },
  {
    connection: redisConnection,
    concurrency: 2,
  },
);
```

### 13.4 Checkpointing for Long-Running Flows

Every 30 seconds (configurable), the worker persists:

- Current node in execution graph
- Full conversation context
- Tool call history
- Intermediate results

On crash/restart: worker resumes from last checkpoint.

---

## 14. Code Execution Sandbox

> **Requirement 2.2:** Native code execution sandboxing (Docker/local), allowing agents to iteratively write, test, and debug software through debate.

### 14.1 Sandbox Levels

| Level           | Technology          | Use Case         | Isolation                        |
| --------------- | ------------------- | ---------------- | -------------------------------- |
| **Lightweight** | Deno subprocess     | JS/TS execution  | Process isolation, no network    |
| **Standard**    | Docker container    | Python, Rust, Go | Container isolation, readonly FS |
| **Heavyweight** | Firecracker microVM | Untrusted code   | VM isolation, full sandbox       |

### 14.2 Agent Iterative Coding Loop

```
Agent A writes code
        │
        ▼
┌───────────────────┐
│ Execute in Sandbox│ ──► Run tests, capture output
└───────────────────┘
        │
        ▼
[Tests pass?]
    │ No              │ Yes
    ▼                 ▼
┌──────────┐    ┌────────────┐
│ Agent B  │    │  Deliver   │
│ (Critic) │    │  Result    │
│ reviews  │    │            │
│ error    │    │            │
└────┬─────┘    └────────────┘
     │
     ▼
[Debate round: A defends, B critiques]
     │
     ▼
┌───────────────────┐
│ Agent A revises   │ ──► Loop back to execution
└───────────────────┘
```

### 14.3 Docker Sandbox Spec

```dockerfile
# sandbox/Dockerfile
FROM node:20-alpine
RUN apk add --no-cache python3 py3-pip
RUN adduser -D -s /bin/sh sandbox
USER sandbox
WORKDIR /workspace
# Read-only mount of agent code; writeable /tmp for output
```

**Runtime constraints:**

- CPU: 1 core, max 60s execution
- Memory: 512 MB
- Network: disabled by default; enabled only for `fetch_url` tool with domain whitelist
- Filesystem: read-only except `/tmp` and `/output`
- No privilege escalation (no sudo, no setuid)

### 14.4 Sandbox API

```typescript
interface Sandbox {
  execute(
    language: "javascript" | "python" | "rust",
    code: string,
    tests?: string,
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    testResults?: TestResult[];
  }>;
}
```

---

## 15. A2UI: Agent-to-User Interface Standard

> **Requirement 2.3:** Agents do not just return text, but output declarative JSON that client applications natively render as interactive forms, tables, and charts.

### 15.1 Philosophy

Instead of agents returning Markdown with embedded instructions, agents return **structured UI declarations**. The client renders these natively, enabling:

- Interactive data entry (forms)
- Sortable/filterable data display (tables)
- Live visualizations (charts)
- Guided workflows (wizards, steppers)

### 15.2 A2UI Schema

```typescript
interface A2UIMessage {
  version: "1.0";
  type: "a2ui";
  components: A2UIComponent[];
}

type A2UIComponent = A2UIForm | A2UITable | A2UIChart | A2UIWizard | A2UICard | A2UIButtonRow;

interface A2UIForm {
  type: "form";
  id: string;
  title?: string;
  description?: string;
  fields: FormField[];
  submitLabel: string;
  // On submit, client POSTs form data back to agent
  callback: { action: "submit_form"; formId: string };
}

interface A2UITable {
  type: "table";
  id: string;
  title?: string;
  columns: { key: string; label: string; sortable?: boolean; filterable?: boolean }[];
  rows: Record<string, string | number | boolean>[];
  actions?: { label: string; action: string; rowId?: string }[];
}

interface A2UIChart {
  type: "chart";
  id: string;
  chartType: "bar" | "line" | "pie" | "area";
  title?: string;
  data: { label: string; value: number; series?: string }[];
  xAxis?: string;
  yAxis?: string;
}

interface A2UIWizard {
  type: "wizard";
  id: string;
  steps: { title: string; description: string; component: A2UIComponent }[];
  currentStep: number;
}
```

### 15.3 Client Renderer

```typescript
// React component that renders any A2UIComponent
function A2UIRenderer({ component, onAction }: { component: A2UIComponent; onAction: (action: string, data: unknown) => void }) {
  switch (component.type) {
    case 'form': return <A2UIFormRenderer form={component} onSubmit={onAction} />;
    case 'table': return <A2UITableRenderer table={component} onAction={onAction} />;
    case 'chart': return <A2UIChartRenderer chart={component} />;
    case 'wizard': return <A2UIWizardRenderer wizard={component} onAction={onAction} />;
    // ... etc
  }
}
```

### 15.4 Agent Prompting for A2UI

Agents are instructed via system prompt to output A2UI JSON when appropriate:

```
When presenting structured data, interactive inputs, or multi-step workflows,
output an A2UI JSON block wrapped in :::a2ui tags instead of Markdown.

Example:
:::a2ui
{"type": "table", "id": "leads", "columns": [...], "rows": [...]}
:::
```

---

## 16. A2A Protocol & Agent Communities

> **Requirement 2.4:** Persistent, open-network agent communities with native MCP and A2A protocol support, allowing cross-framework agent collaboration.

### 16.1 A2A Protocol Specification

The Agent-to-Agent (A2A) protocol enables agents built in different frameworks to discover and delegate tasks to each other.

**Core Primitives:**

```typescript
// Agent capability advertisement
interface A2ACapability {
  agentId: string;
  name: string;
  description: string;
  skills: A2ASkill[];
  endpoint: string; // HTTP or SSE URL
  protocols: ("a2a-v1" | "mcp")[];
}

interface A2ASkill {
  id: string;
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
}

// Task delegation
interface A2ATask {
  taskId: string;
  fromAgent: string;
  toAgent: string;
  skillId: string;
  input: unknown;
  priority: "low" | "normal" | "high" | "urgent";
  deadline?: Date;
  callbackUrl?: string;
}

// Task result
interface A2AResult {
  taskId: string;
  status: "success" | "failure" | "partial";
  output: unknown;
  logs: string[];
  latencyMs: number;
}
```

### 16.2 Discovery Mechanisms

| Mechanism      | Scope         | Technology                                  |
| -------------- | ------------- | ------------------------------------------- |
| Local network  | LAN           | mDNS (Bonjour/Avahi)                        |
| Agent registry | Internet      | Optional hosted registry (federated)        |
| Static config  | Known peers   | Manual endpoint configuration               |
| MCP bridge     | MCP ecosystem | MCP server that exposes A2A agents as tools |

### 16.3 Cross-Framework Delegation

```
LangGraph Agent (Python)
        │
        ▼ "delegate research task"
┌───────────────────┐
│ A2A Gateway       │ ──► Discovers available agents
│ (AgentHub)        │     Checks capabilities
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ CrewAI Agent      │ ──► Executes research task
│ (Python)          │     Returns structured result
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Result returned   │ ──► LangGraph agent continues workflow
│ to LangGraph      │
└───────────────────┘
```

### 16.4 Agent Communities

- **Community = persistent group of agents** across different frameworks
- Shared context via A2A context protocol
- Reputation system: agents rate each other's task completion quality
- Community memory: shared knowledge base of successful delegation patterns

### 16.5 MCP Server Mode

AgentHub can expose its agents as an MCP server:

```typescript
// AgentHub acts as MCP server
class AgentHubMCPServer {
  // Each agent becomes an MCP tool
  // Each knowledge base becomes an MCP resource
  // Agent groups become MCP prompts
}
```

This allows Claude, Cursor, and other MCP clients to use AgentHub agents as first-class tools.

---

## 17. Trust Engine & Desktop Automation

> **Requirement 3.1:** Process-isolated trust engine separating credentials from LLM + native Accessibility APIs for desktop application control.

### 17.1 Trust Engine Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Main Process (Next.js)                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Chat UI    │  │  Agent      │  │  Tool Router        │ │
│  │             │  │  Runtime    │  │  (no credentials)   │ │
│  └─────────────┘  └──────┬──────┘  └─────────────────────┘ │
│                          │                                   │
│  ┌───────────────────────┴───────────────────────────────┐  │
│  │  IPC (Unix socket / named pipe)                       │  │
│  └───────────────────────┬───────────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│  Trust Engine Process (isolated)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Credential │  │  Policy     │  │  Audit Log          │  │
│  │  Vault      │  │  Engine     │  │  (tamper-evident)   │  │
│  │  (encrypted)│  │             │  │                     │  │
│  └─────────────┘  └──────┬──────┘  └─────────────────────┘  │
│                          │                                    │
│  ┌───────────────────────┴───────────────────────────────┐   │
│  │  Tool calls arrive with tool name + args (NO creds)   │   │
│  │  Policy engine looks up required credential           │   │
│  │  Injects credential into tool execution               │   │
│  │  LLM never sees API keys, passwords, tokens           │   │
│  └───────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

### 17.2 Credential Vault

- **Storage:** AES-256-GCM encrypted file, key derived from user master password
- **Access:** Only Trust Engine process can decrypt; main process sends tool names, receives executed results
- **Rotation:** Automatic key rotation on schedule; old keys archived for 30 days
- **Audit:** Every credential use logged with timestamp, tool, hash of result (not result itself)

### 17.3 Desktop Automation via Accessibility APIs

| OS          | API           | Capabilities                                        |
| ----------- | ------------- | --------------------------------------------------- |
| **Linux**   | AT-SPI2       | Enumerate windows, read UI tree, click, type, focus |
| **macOS**   | AX API        | Same + VoiceOver integration                        |
| **Windows** | UI Automation | Same + MSAA legacy support                          |

**Agent capabilities:**

- "Click the Submit button in Chrome"
- "Type 'hello' into the focused text field"
- "Read the table from the Excel window"
- "Screenshot the current active window"

**Security:**

- User must explicitly grant accessibility permissions (OS-level)
- Agent actions are previewed before execution
- Sensitive applications (password managers, banking) are blocklisted
- All actions logged with before/after screenshots

---

## 18. Desktop File Agent

> **Requirement 3.2:** Unique desktop agent for local folder parsing, file preparation, renaming, sorting, and synthesis across local file systems while leveraging cloud models.

### 18.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Desktop File Agent (Node.js daemon / Electron main)        │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  File       │  │  Content    │  │  Action Engine      │ │
│  │  Watcher    │  │  Analyzer   │  │                     │ │
│  │  (chokidar) │  │  (local LLM │  │ • Rename            │ │
│  │             │  │   + cloud)  │  │ • Move/Sort         │ │
│  └──────┬──────┘  └──────┬──────┘  │ • Merge/Synthesize  │ │
│         │                │          │ • Tag/Classify      │ │
│         │                │          └─────────────────────┘ │
│         │                │                                   │
│         └────────────────┴───────────────────────────────────┘
│                          │
│                    Local File System
└─────────────────────────────────────────────────────────────┘
```

### 18.2 File Processing Pipeline

```
File detected in watched folder
        │
        ▼
┌───────────────────┐
│ Content Analysis  │ ──► File type, text extraction, image OCR
│ (Local: Tesseract │     (Cloud: Claude/GPT for complex docs)
│  + Ollama)        │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Classification    │ ──► Category, tags, priority, project
│ (Local LLM)       │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Action Selection  │ ──► Apply user-defined rules or suggest action
│ (Rule engine)     │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Execute Action    │ ──► Rename, move, merge, summarize
│ (User-approved)   │
└───────────────────┘
```

### 18.3 Example Rules

```yaml
# .agenthub/file-rules.yml
rules:
  - name: "Organize Invoices"
    when: "file.type == 'pdf' && content.contains('invoice')"
    action: "move"
    to: "~/Documents/Invoices/{year}/{month}/"
    rename: "Invoice_{vendor}_{date}.pdf"

  - name: "Sort Photos"
    when: "file.mime == 'image/*'"
    action: "move"
    to: "~/Photos/{exif.year}/{exif.month}/"

  - name: "Merge CSV Reports"
    when: "file.name.match(/report_.*\.csv/) && folder.name == 'Reports'"
    action: "synthesize"
    generate: "weekly_summary.csv"
    summary: "Combine all daily reports, deduplicate, sum totals"
```

### 18.4 Cloud Model Leverage

For complex analysis (document understanding, entity extraction), the File Agent:

1. Extracts text locally
2. Sends to cloud model with **strict data minimization** (only necessary text)
3. Receives structured analysis
4. Executes action locally

User controls: which folders sync to cloud, which stay local-only.

---

## 19. Mode-First Packaging

> **Requirement 3.3:** Ditches general-purpose "chat" interface for "mode-first" packaging with highly specific tools like "People Search" mode for CRM enrichment.

### 19.1 Mode Definition

A **Mode** is a complete, self-contained agent configuration package:

```typescript
interface Mode {
  id: string;
  name: string;
  description: string;
  version: string;

  // Agent configuration
  systemPrompt: string;
  model: string;
  temperature: number;

  // Specialized tools (subset of available tools)
  tools: string[];

  // UI configuration
  ui: {
    inputPlaceholder: string;
    welcomeMessage: string;
    a2uiComponents: string[]; // which A2UI components mode can emit
  };

  // Knowledge bases (pre-loaded)
  knowledgeBases: string[];

  // Memory namespace (isolated from other modes)
  memoryNamespace: string;

  // Example interactions
  examples: { user: string; assistant: string }[];

  // Mode-specific shortcuts
  shortcuts: { label: string; prompt: string }[];
}
```

### 19.2 Built-in Modes

| Mode              | Purpose                      | Tools                                 | A2UI Output                   |
| ----------------- | ---------------------------- | ------------------------------------- | ----------------------------- |
| **General Chat**  | Default conversational agent | web_search, calculator, datetime      | text, code                    |
| **Coder**         | Software development         | execute_code, read_file, write_file   | code, form (PR details)       |
| **People Search** | CRM enrichment, prospecting  | web_search, fetch_url, analyze_image  | table (leads), form (contact) |
| **Researcher**    | Deep research with citations | web_search, fetch_url, knowledge_base | table (sources), chart (data) |
| **Writer**        | Content creation             | web_search, read_file                 | text, form (feedback)         |
| **Data Analyst**  | CSV/JSON analysis            | execute_code, read_file               | chart, table, form (query)    |
| **DevOps**        | Infrastructure management    | execute_code (Docker), mcp_servers    | form (deploy config)          |

### 19.3 Mode Marketplace

Modes are distributed as `.mode.json` files via the AgentHub marketplace:

```bash
# Install a mode
agenthub mode install people-search

# Activate a mode
agenthub mode activate people-search

# Create custom mode
agenthub mode create --from-template coder
```

### 19.4 Mode Isolation

- Each mode has **isolated memory namespace** — memories from "People Search" don't leak into "Coder"
- Each mode has **isolated tool permissions** — "Coder" can write files; "General Chat" cannot
- Each mode has **isolated knowledge base** — pre-loaded domain documents
- Mode switching = full context switch (system prompt, tools, memory, examples)

---

## 20. Stateful Graph Orchestration

> **Requirement 4.1/4.2:** Directed cyclic graphs with deterministic state persistence, checkpointing, pause-and-resume, and human-in-the-loop for production reliability.

### 20.1 Graph Model

```typescript
interface AgentGraph {
  id: string;
  nodes: AgentNode[];
  edges: AgentEdge[];
  stateSchema: JSONSchema; // Typed state machine state
}

interface AgentNode {
  id: string;
  type: "agent" | "tool" | "decision" | "human" | "checkpoint";
  config: AgentConfig | ToolConfig | DecisionConfig | HumanConfig;
  retryPolicy?: RetryPolicy;
  timeout?: number;
}

interface AgentEdge {
  from: string;
  to: string;
  condition?: string; // JavaScript expression evaluated against state
}

interface GraphState {
  // User-defined state shape
  [key: string]: unknown;
  // System-managed
  _currentNode: string;
  _history: NodeExecution[];
  _checkpointId: string;
}
```

### 20.2 Checkpointing System

```typescript
interface Checkpoint {
  id: string;
  graphId: string;
  runId: string;
  timestamp: Date;
  state: GraphState;
  nodeResults: Record<string, unknown>;
  status: "running" | "paused" | "completed" | "failed" | "waiting_human";
}

class CheckpointManager {
  async save(checkpoint: Checkpoint): Promise<void>;
  async load(checkpointId: string): Promise<Checkpoint>;
  async list(graphId: string): Promise<Checkpoint[]>;
  async resume(checkpointId: string): Promise<AsyncIterable<GraphEvent>>;
}
```

**Checkpoint table (SQLite):**

```sql
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  graph_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  state TEXT NOT NULL, -- JSON
  node_results TEXT NOT NULL, -- JSON
  status TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
```

### 20.3 Pause & Resume

```
Graph executing
        │
        ▼
┌───────────────────┐
│ User clicks PAUSE │ ──► OR system detects long-running node
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Save Checkpoint   │ ──► Full state serialized to SQLite
│ (after current    │     Node execution completes gracefully
│  node completes)  │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Status: PAUSED    │ ──► User can review intermediate results
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ User clicks RESUME│ ──► Checkpoint loaded, execution continues
│                   │     from next node
└───────────────────┘
```

### 20.4 Human-in-the-Loop

| HITL Point         | Behavior                                           | UI                          |
| ------------------ | -------------------------------------------------- | --------------------------- |
| **Approval Gate**  | Agent proposes action; waits for user yes/no       | Modal with action preview   |
| **Edit Hook**      | Agent outputs draft; user can edit before continue | Inline editor               |
| **Override Point** | User can redirect graph to different node          | Dropdown of available nodes |
| **Question Node**  | Graph explicitly asks user for input               | Form rendered in chat       |

### 20.5 Production Reliability

| Feature               | Implementation                                                  |
| --------------------- | --------------------------------------------------------------- |
| **Retry logic**       | Exponential backoff, max 3 retries per node                     |
| **Dead letter queue** | Failed nodes moved to DLQ for manual inspection                 |
| **Observability**     | Every node execution logged with input, output, latency         |
| **Circuit breaker**   | If node fails 5x in 1 min, circuit opens; manual reset required |
| **Timeouts**          | Per-node timeout (default 30s, configurable)                    |
| **Resource limits**   | Max memory per node (512MB), max total graph runtime (1 hour)   |

### 20.6 Example: Research Workflow Graph

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  START  │────►│  Search │────►│  Scrape │────►│ Summarize│
└─────────┘     └─────────┘     └─────────┘     └────┬────┘
                                                      │
                              ┌───────────────────────┘
                              ▼
                         ┌─────────┐
                         │  Human  │ ──► "Approve summary?"
                         │ Approval│     Yes → continue, No → revise
                         └────┬────┘
                              │
                              ▼
                         ┌─────────┐
                         │  Format │
                         │ Output  │
                         └────┬────┘
                              │
                              ▼
                         ┌─────────┐
                         │  END    │
                         └─────────┘
```

---

_End of DESIGN.md v2.0_

---

## 21. Observability & APM (Application Performance Monitoring)

> **Requirement:** Tracks system performance, token consumption, latency, and step-by-step traces to help administrators manage costs and debug agent workflows.

### 21.1 Design Philosophy

AgentHub treats observability as a first-class citizen. Every interaction — from a single chat message to a complex multi-agent workflow — is traced, measured, and stored for analysis. This enables:

- **Cost transparency:** Users see exactly how many tokens each session consumed
- **Performance optimization:** Identify slow models, slow tools, bottlenecks
- **Debugging:** Step-by-step trace of agent decisions and tool calls
- **Capacity planning:** Historical usage patterns inform hardware decisions

### 21.2 Telemetry Types

| Type        | Data Collected                                          | Storage                                | Retention |
| ----------- | ------------------------------------------------------- | -------------------------------------- | --------- |
| **Metrics** | Token counts, latency, queue depth, error rates         | Time-series DB (Prometheus-compatible) | 90 days   |
| **Traces**  | End-to-end request flow (chat → LLM → tools → response) | SQLite trace table                     | 30 days   |
| **Logs**    | Structured application logs                             | SQLite log table + file rotation       | 7 days    |
| **Events**  | User actions, agent decisions, HITL approvals           | SQLite event table                     | 90 days   |

### 21.3 Metric Schema

```sql
-- Time-series metrics (aggregated per minute)
CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL, -- unixepoch
  metric_name TEXT NOT NULL,
  labels TEXT, -- JSON: {model: "qwen2.5:7b", provider: "ollama", workspace: "default"}
  value REAL NOT NULL,
  unit TEXT -- tokens, milliseconds, bytes, percent
);

-- Indexes for fast queries
CREATE INDEX idx_metrics_time_name ON metrics(timestamp, metric_name);
CREATE INDEX idx_metrics_labels ON metrics(labels);

-- Request traces (one per chat message or workflow run)
CREATE TABLE traces (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  name TEXT NOT NULL, -- "chat_completion", "agent_flow", "tool_call"
  session_id TEXT,
  workspace_id TEXT,
  status TEXT CHECK(status IN ('ok', 'error', 'timeout', 'cancelled')),
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  duration_ms INTEGER,
  tokens_prompt INTEGER DEFAULT 0,
  tokens_completion INTEGER DEFAULT 0,
  tokens_total INTEGER DEFAULT 0,
  model TEXT,
  provider TEXT,
  error_message TEXT,
  metadata TEXT -- JSON: custom dimensions
);

-- Trace spans (sub-operations within a trace)
CREATE TABLE trace_spans (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL REFERENCES traces(id),
  parent_span_id TEXT,
  name TEXT NOT NULL, -- "llm_call", "tool_execution", "embedding", "rag_retrieval"
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  duration_ms INTEGER,
  status TEXT,
  attributes TEXT -- JSON: tool_name, document_count, chunk_size, etc.
);

-- Event log (structured events for auditing and analytics)
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER DEFAULT (unixepoch()),
  level TEXT CHECK(level IN ('debug', 'info', 'warn', 'error')),
  category TEXT, -- "chat", "agent", "tool", "auth", "system"
  event_type TEXT NOT NULL, -- "message_sent", "agent_started", "tool_called", "error"
  actor_id TEXT, -- user_id or agent_id
  target_id TEXT, -- session_id or workspace_id
  message TEXT,
  metadata TEXT -- JSON
);
```

### 21.4 Key Metrics

| Metric                   | Description                                        | Source                       |
| ------------------------ | -------------------------------------------------- | ---------------------------- |
| `llm_tokens_total`       | Total tokens consumed per model/provider           | LLM response metadata        |
| `llm_latency_ms`         | Time from request to first token / full response   | Timer around LLM call        |
| `llm_cost_usd`           | Estimated cost (0 for local, calculated for cloud) | Token count × model rate     |
| `tool_execution_ms`      | Time to execute each tool                          | Timer around tool wrapper    |
| `rag_retrieval_ms`       | Time to perform vector + keyword search            | Timer around search pipeline |
| `agent_flow_duration_ms` | Total time for multi-agent workflow                | Trace span duration          |
| `agent_flow_steps`       | Number of agent/tool steps in workflow             | Counter                      |
| `active_sessions`        | Current number of open chat sessions               | Gauge                        |
| `queue_depth`            | Number of jobs waiting in BullMQ                   | Redis queue length           |
| `error_rate`             | Percentage of requests resulting in errors         | Error count / Total count    |
| `user_satisfaction`      | Thumbs up/down on assistant messages               | User feedback                |

### 21.5 Trace Collection

Every chat message generates a distributed trace:

```
Trace: chat_message (id: trace_abc123)
├── Span: build_prompt (2ms)
│   ├── Span: memory_retrieval (5ms)
│   └── Span: kb_retrieval (12ms)
├── Span: llm_call (1,250ms)
│   ├── Attribute: model = "qwen2.5:14b"
│   ├── Attribute: tokens_prompt = 1,200
│   └── Attribute: tokens_completion = 450
├── Span: tool_execution (800ms) [optional]
│   ├── Attribute: tool_name = "web_search"
│   └── Attribute: query = "current weather"
└── Span: persist_message (3ms)
```

### 21.6 APM Dashboard

Built-in observability UI at `/admin/observability`:

**Overview Panel:**

- Total tokens today / this week / this month
- Average response latency (trend line)
- Active users / sessions
- Error rate (with alert threshold)

**Model Performance:**

- Table: Model | Avg Latency | Tokens Used | Cost | Satisfaction
- Bar chart: Token consumption by model
- Line chart: Latency trend per model

**Agent Workflows:**

- Trace list: filterable by status, duration, agent group
- Trace detail: waterfall view of spans
- Heatmap: Step duration across workflow types

**Cost Management:**

- Estimated monthly spend (local = $0, cloud = calculated)
- Cost breakdown by model, by workspace, by user
- Budget alerts (configurable thresholds)

**Real-Time:**

- Live request rate (requests/sec)
- Live token consumption rate
- Queue depth visualization
- Active workflow monitor

### 21.7 Export & Integration

| Integration       | Format                  | Use Case                                       |
| ----------------- | ----------------------- | ---------------------------------------------- |
| **Prometheus**    | `/metrics` endpoint     | Scraping by external Prometheus/Grafana        |
| **OpenTelemetry** | OTLP exporter           | Integration with existing observability stacks |
| **CSV Export**    | Download from dashboard | Ad-hoc analysis in Excel/Sheets                |
| **SQLite Query**  | Direct SQL              | Power users, custom reports                    |

### 21.8 Alerting

```typescript
interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: "gt" | "lt" | "eq";
  threshold: number;
  duration: number; // seconds the condition must hold
  severity: "warning" | "critical";
  action: "notify" | "throttle" | "pause_workflow";
}

// Example rules
const defaultAlerts: AlertRule[] = [
  {
    name: "High Latency",
    metric: "llm_latency_ms",
    condition: "gt",
    threshold: 10000,
    duration: 300,
    severity: "warning",
  },
  { name: "Error Spike", metric: "error_rate", condition: "gt", threshold: 0.05, duration: 60, severity: "critical" },
  { name: "Queue Backlog", metric: "queue_depth", condition: "gt", threshold: 100, duration: 300, severity: "warning" },
];
```

---

_End of DESIGN.md v2.1 — Observability & APM added._

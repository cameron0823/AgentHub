# AgentHub Technical Architecture

> **Version:** 1.0  
> **Status:** Archived architecture snapshot. `TODO.md` is the canonical current tracker and completion source.
> **Scope:** Complete technical architecture for local-first AI agent platform

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Frontend Architecture](#2-frontend-architecture)
3. [Backend Architecture](#3-backend-architecture)
4. [AI Provider Layer](#4-ai-provider-layer)
5. [Agent Orchestration Engine](#5-agent-orchestration-engine)
6. [MCP Client Architecture](#6-mcp-client-architecture)
7. [Data Flow Diagrams](#7-data-flow-diagrams)
8. [Deployment Architectures](#8-deployment-architectures)
9. [Performance Considerations](#9-performance-considerations)
10. [Technology Stack](#10-technology-stack)

---

## 1. System Overview

### 1.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Browser    │  │   Desktop    │  │  Mobile PWA  │  │   External MCP   │  │
│  │    (SPA)     │  │  (Electron)  │  │   (Offline)  │  │     Servers      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────────────────┘  │
│         └─────────────────┴─────────────────┘                                │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │ HTTP / SSE / tRPC
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                            API GATEWAY LAYER                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐   │
│  │                    Next.js 14 (App Router + API Routes)                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐ │   │
│  │  │   tRPC      │  │   REST      │  │   SSE       │  │   WebSocket   │ │   │
│  │  │  Routers    │  │  (OpenAI    │  │  (Streaming │  │   (Voice)     │ │   │
│  │  │             │  │  compatible)│  │   Chat)     │  │               │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────────┘ │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
┌─────────────────────────────────┼────────────────────────────────────────────┐
│                         CORE SERVICES LAYER                                   │
│                                                                               │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌───────────────┐ │
│  │    Agent Runtime        │  │    Knowledge Engine     │  │  Memory Mgr   │ │
│  │  ┌─────────────────┐    │  │  ┌─────────────────┐    │  │               │ │
│  │  │  Orchestrator   │    │  │  │  Doc Parser     │    │  │ • Extraction  │ │
│  │  │  ├ Supervisor   │    │  │  │  ├ PDF/DOCX/TXT │    │  │ • Retrieval   │ │
│  │  │  ├ Executor     │    │  │  │  ├ OCR (tess)   │    │  │ • Deduplication│ │
│  │  │  ├ Debater      │    │  │  │  └ HTML/MD      │    │  │ • Injection   │ │
│  │  │  └ Judge        │    │  │  └─────────────────┘    │  └───────────────┘ │
│  │  └─────────────────┘    │  │  ┌─────────────────┐    │                    │
│  │  ┌─────────────────┐    │  │  │  Chunking       │    │  ┌───────────────┐ │
│  │  │  Model Router   │    │  │  │  ├ Recursive    │    │  │  Plugin Mgr   │ │
│  │  │  ├ Provider Reg │    │  │  │  ├ Semantic     │    │  │               │ │
│  │  │  ├ Health Check │    │  │  │  └ Token-based  │    │  │ • Registry    │ │
│  │  │  └ Load Balance │    │  │  └─────────────────┘    │  │ • Sandboxing  │ │
│  │  └─────────────────┘    │  │  ┌─────────────────┐    │  │ • Execution   │ │
│  │  ┌─────────────────┐    │  │  │  Vector Store   │    │  └───────────────┘ │
│  │  │  Tool Router    │    │  │  │  ├ LanceDB      │    │                    │
│  │  │  ├ Built-in     │    │  │  │  ├ ChromaDB     │    │  ┌───────────────┐ │
│  │  │  ├ MCP Tools    │    │  │  │  └ Hybrid Search│    │  │  Auth Layer   │ │
│  │  │  └ Custom FC    │    │  │  └─────────────────┘    │  │               │ │
│  │  └─────────────────┘    │  └─────────────────────────┘  │  │ • Better Auth │ │
│  └─────────────────────────┘                               │  │ • Sessions    │ │
│                                                             │  │ • MFA/OAuth   │ │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  │  └───────────────┘ │
│  │    Voice Pipeline       │  │    Image Pipeline       │  │                    │
│  │  ┌─────────────────┐    │  │  ┌─────────────────┐    │  │  ┌───────────────┐ │
│  │  │  STT (Whisper)  │    │  │  │  ComfyUI Client │    │  │  │  File Store   │ │
│  │  │  ├ VAD          │    │  │  │  ├ Workflow Mgmt│    │  │  │               │ │
│  │  │  ├ Transcribe   │    │  │  │  ├ Queue/Cache  │    │  │  │ • Local FS    │ │
│  │  │  └ Stream Text  │    │  │  │  └ Result Fetch │    │  │  │ • MinIO       │ │
│  │  └─────────────────┘    │  │  └─────────────────┘    │  │  └───────────────┘ │
│  │  ┌─────────────────┐    │  │  ┌─────────────────┐    │  └────────────────────┘
│  │  │  TTS (Piper)    │    │  │  │  Vision (LLaVA) │    │
│  │  │  ├ Synthesize   │    │  │  │  ├ Ollama API   │    │
│  │  │  ├ Stream Audio │    │  │  │  └ Image Encode │    │
│  │  │  └ Cache        │    │  │  └─────────────────┘    │
│  │  └─────────────────┘    │  └─────────────────────────┘
│  └─────────────────────────┘
└───────────────────────────────────────────────────────────────────────────────┘
                                  │
┌─────────────────────────────────┼─────────────────────────────────────────────┐
│                      LOCAL AI INFRASTRUCTURE                                  │
│                                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Ollama    │  │  SearxNG    │  │  ComfyUI    │  │    Piper / Whisper  │  │
│  │  :11434     │  │  :8080      │  │  :8188      │  │    :5000 / :8001    │  │
│  │             │  │             │  │             │  │                     │  │
│  │ • LLMs      │  │ • Search    │  │ • SDXL      │  │ • TTS               │  │
│  │ • Embeddings│  │ • Aggregator│  │ • Flux      │  │ • STT               │  │
│  │ • Vision    │  │ • No API key│  │ • ControlNet│  │ • VAD               │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
                                  │
┌─────────────────────────────────┼─────────────────────────────────────────────┐
│                         DATA LAYER (Local-First)                              │
│                                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   SQLite    │  │  LanceDB    │  │   Yjs /     │  │    Local Filesystem │  │
│  │  (Primary)  │  │  (Vectors)  │  │  Electric   │  │    (Uploads/Cache)  │  │
│  │             │  │             │  │  (Sync)     │  │                     │  │
│  │ • Users     │  │ • Embeddings│  │             │  │ • Documents         │  │
│  │ • Sessions  │  │ • Metadata  │  │ • CRDT      │  │ • Images            │  │
│  │ • Messages  │  │ • Indices   │  │ • Multi-dev │  │ • Audio             │  │
│  │ • Agents    │  │             │  │             │  │ • Artifacts         │  │
│  │ • Memory    │  │             │  │             │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                                                               │
│  [Optional Server Mode]                                                       │
│  ┌─────────────┐  ┌─────────────┐                                             │
│  │  PostgreSQL │  │    Redis    │                                             │
│  │  (Multi-User│  │   (Cache /  │                                             │
│  │   Server)   │  │   Sessions) │                                             │
│  └─────────────┘  └─────────────┘                                             │
└───────────────────────────────────────────────────────────────────────────────┘
```

Current implementation note: ADR 0002 supersedes local-first sync diagrams. The current supported runtime uses PostgreSQL + pgvector as the canonical data plane; Yjs, Electric SQL, WebRTC sync, SQLite replication, and IndexedDB mode are not production features.

### 1.2 Design Constraints

| Constraint                   | Decision                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------- |
| **Single binary deployment** | Next.js bundles frontend + backend; SQLite is embedded                       |
| **No runtime dependencies**  | Ollama is the only required external service; everything else is optional    |
| **Cross-platform**           | macOS, Linux, Windows — all local services run via Docker or native binaries |
| **Offline-first**            | Core features work without internet; sync is optional                        |
| **Horizontal scaling**       | Not a primary goal; designed for single-node or small-team deployment        |

---

## 2. Frontend Architecture

### 2.1 Routing Strategy

Following LobeHub's proven hybrid approach:

| Router                 | Use Case                                | Location          |
| ---------------------- | --------------------------------------- | ----------------- |
| **Next.js App Router** | Auth pages, settings, SSR, landing      | `src/app/(site)/` |
| **React Router DOM**   | Chat SPA, agent builder, knowledge base | `src/spa/`        |

**Why hybrid?**

- App Router handles auth callbacks, OAuth flows, and static marketing pages with SSR
- React Router DOM powers the chat interface — instant navigation, no full page reloads, reactive state

### 2.2 State Management (Zustand Slices)

```typescript
// stores/index.ts
import { create } from "zustand";

interface AppState {
  // Auth slice
  user: User | null;
  isAuthenticated: boolean;

  // Chat slice
  sessions: Session[];
  activeSessionId: string | null;
  messages: Record<string, Message[]>; // sessionId -> messages
  isGenerating: boolean;

  // Agent slice
  agents: Agent[];
  activeAgentId: string | null;

  // UI slice
  sidebarOpen: boolean;
  theme: Theme;
  modals: Record<string, boolean>;

  // Settings slice
  providers: ModelProvider[];
  activeProviderId: string;
  settings: AppSettings;
}
```

### 2.3 Component Hierarchy

```
App
├── AuthProvider (Better Auth)
├── ThemeProvider (CSS variables)
├── QueryProvider (tRPC + SWR)
│
└── Layout
    ├── Sidebar
    │   ├── SessionList
    │   ├── AgentList
    │   └── SettingsNav
    │
    └── Main Content
        ├── ChatView (React Router)
        │   ├── MessageList
        │   │   ├── UserMessage
        │   │   └── AssistantMessage
        │   │       ├── ReasoningPanel
        │   │       ├── ContentRenderer
        │   │       ├── ArtifactRenderer
        │   │       └── ToolCallPanel
        │   ├── ChatInput
        │   │   ├── TextInput
        │   │   ├── VoiceButton
        │   │   └── FileUpload
        │   └── BranchPanel (tree viz)
        │
        ├── AgentBuilder
        │   ├── BasicsStep
        │   ├── PersonaStep
        │   └── CapabilitiesStep
        │
        ├── AgentGroupBuilder
        │   └── ReactFlowCanvas
        │
        ├── KnowledgeBaseView
        │   ├── FileUploader
        │   ├── DocumentList
        │   └── SearchTester
        │
        └── SettingsView
            ├── ModelSettings
            ├── ProviderManager
            ├── MCPManager
            ├── VoiceSettings
            └── ThemeSettings
```

### 2.4 Data Fetching Strategy

| Pattern            | Technology         | Use Case                                         |
| ------------------ | ------------------ | ------------------------------------------------ |
| Server state       | tRPC + React Query | Sessions, messages, agents (cached, invalidated) |
| Real-time          | SSE (EventSource)  | Streaming chat responses                         |
| Local state        | Zustand            | UI state, ephemeral form data                    |
| Optimistic updates | React Query        | Sending messages (instant UI, rollback on error) |

---

## 3. Backend Architecture

### 3.1 API Structure

```
src/server/
├── routers/
│   ├── _app.ts                 # tRPC root router
│   ├── lambda/                 # Main business (synchronous)
│   │   ├── chat.ts             # CRUD for sessions/messages
│   │   ├── agent.ts            # Agent CRUD
│   │   ├── group.ts            # Agent groups
│   │   ├── knowledge.ts        # Knowledge base management
│   │   ├── memory.ts           # Memory entries
│   │   ├── provider.ts         # Model provider config
│   │   └── mcp.ts              # MCP server management
│   ├── async/                  # Long-running operations
│   │   ├── ingest.ts           # Document ingestion
│   │   ├── embed.ts            # Embedding generation
│   │   └── generate-image.ts   # Image generation
│   └── tools/                  # Tool invocation
│       ├── search.ts           # Web search
│       ├── mcp-invoke.ts       # MCP tool calls
│       └── builtin/            # Built-in tools
├── services/
│   ├── ai-provider.ts          # Provider registry & routing
│   ├── agent-runtime.ts        # Orchestration engine
│   ├── memory-engine.ts        # Memory extraction & retrieval
│   ├── knowledge-base.ts       # RAG pipeline
│   ├── mcp-client.ts           # MCP client implementation
│   ├── voice-pipeline.ts       # STT/TTS coordination
│   └── image-pipeline.ts       # ComfyUI integration
├── lib/
│   ├── db.ts                   # Drizzle ORM + SQLite setup
│   ├── lancedb.ts              # Vector store connection
│   ├── auth.ts                 # Better Auth configuration
│   └── sse.ts                  # SSE streaming utilities
└── types/
    └── index.ts                # Shared TypeScript types
```

### 3.2 Streaming Chat Endpoint

```typescript
// src/app/api/chat/stream/route.ts
export async function POST(req: Request) {
  const { sessionId, messages, model, tools } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const provider = providerRegistry.get(model.providerId);

      for await (const chunk of provider.streamChat({ model, messages, tools })) {
        const data = `data: ${JSON.stringify(chunk)}\n\n`;
        controller.enqueue(encoder.encode(data));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

### 3.3 Database Layer

**ORM:** Drizzle ORM with SQLite  
**Why Drizzle:** Type-safe, SQL-like syntax, excellent SQLite support, small bundle size  
**Alternative considered:** Prisma (larger, more complex for SQLite)

```typescript
// src/server/lib/db.ts
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database(process.env.DATABASE_URL || "./data/agenthub.db");
export const db = drizzle(sqlite, { schema });
```

---

## 4. AI Provider Layer

### 4.1 Provider Registry

```typescript
class ProviderRegistry {
  private providers = new Map<string, ModelProvider>();

  constructor() {
    // Auto-register based on availability
    this.register(new OllamaProvider());
    this.register(new LMStudioProvider());
    this.register(new VLLMProvider());

    // Cloud providers (opt-in)
    if (process.env.OPENAI_API_KEY) {
      this.register(new OpenAIProvider());
    }
  }

  async healthCheckAll(): Promise<ProviderHealth[]> {
    return Promise.all(
      Array.from(this.providers.values()).map(async (p) => ({
        id: p.id,
        name: p.name,
        ...(await p.healthCheck()),
      })),
    );
  }

  get(id: string): ModelProvider | undefined {
    return this.providers.get(id);
  }
}
```

### 4.2 Ollama Provider Implementation

```typescript
class OllamaProvider implements ModelProvider {
  readonly id = "ollama";
  readonly name = "Ollama";
  readonly type = "local";
  private baseUrl = process.env.OLLAMA_URL || "http://localhost:11434";

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`);
    const data = await res.json();
    return data.models.map((m: any) => ({
      id: m.name,
      name: m.name,
      size: m.size,
      parameters: this.parseParams(m.details),
      capabilities: this.inferCapabilities(m.name),
    }));
  }

  async *streamChat(options: ChatOptions): AsyncIterable<ChatStreamChunk> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: true,
        options: {
          temperature: options.temperature,
          num_predict: options.maxTokens,
        },
      }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        const data = JSON.parse(line);

        if (data.message?.content) {
          yield { type: "content", content: data.message.content };
        }
        if (data.done) {
          yield { type: "done", usage: data.eval_count };
        }
      }
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results = await Promise.all(
      texts.map(async (text) => {
        const res = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: "POST",
          body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
        });
        const data = await res.json();
        return data.embedding;
      }),
    );
    return results;
  }

  async healthCheck() {
    try {
      const start = Date.now();
      await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      return { status: "healthy" as const, latency: Date.now() - start };
    } catch {
      return { status: "unhealthy" as const, latency: -1 };
    }
  }
}
```

---

## 5. Agent Orchestration Engine

### 5.1 Orchestrator Design

```typescript
abstract class Orchestrator {
  abstract execute(task: string, context: ExecutionContext): AsyncIterable<OrchestratorEvent>;
}

interface ExecutionContext {
  group: AgentGroup;
  sessionId: string;
  userId: string;
  sharedContext: boolean;
  maxRounds: number;
}

type OrchestratorEvent =
  | { type: "agent_start"; agentId: string; role: string }
  | { type: "agent_output"; agentId: string; content: string }
  | { type: "agent_tool_call"; agentId: string; tool: string; args: unknown }
  | { type: "agent_complete"; agentId: string }
  | { type: "synthesis"; content: string }
  | { type: "error"; agentId: string; error: string };
```

### 5.2 Supervisor-Executor Implementation

```typescript
class SupervisorExecutorOrchestrator extends Orchestrator {
  async *execute(task: string, ctx: ExecutionContext): AsyncIterable<OrchestratorEvent> {
    const supervisor = ctx.group.agents.find((a) => a.role === 'supervisor')!;
    const executors = ctx.group.agents.filter((a) => a.role === 'executor');

    // Phase 1: Supervisor plans
    yield { type: 'agent_start', agentId: supervisor.agentId, role: 'supervisor' };
    const plan = await this.callAgent(supervisor, `Plan this task: ${task}`);
    yield { type: 'agent_output', agentId: supervisor.agentId, content: plan };
    yield { type: 'agent_complete', agentId: supervisor.agentId };

    // Phase 2: Executors work in parallel
    const subtasks = this.parseSubtasks(plan);
    const executorResults = await Promise.all(
      executors.map(async (exec, i) => {
        yield { type: 'agent_start', agentId: exec.agentId, role: 'executor' };
        const result = await this.callAgent(exec, subtasks[i] || task);
        yield { type: 'agent_output', agentId: exec.agentId, content: result };
        yield { type: 'agent_complete', agentId: exec.agentId };
        return { agentId: exec.agentId, result };
      })
    );

    // Phase 3: Supervisor synthesizes
    yield { type: 'agent_start', agentId: supervisor.agentId, role: 'supervisor' };
    const synthesis = await this.callAgent(
      supervisor,
      `Synthesize these results:\n${executorResults.map((r) => `- ${r.agentId}: ${r.result}`).join('\n')}`
    );
    yield { type: 'agent_output', agentId: supervisor.agentId, content: synthesis };
    yield { type: 'agent_complete', agentId: supervisor.agentId };

    yield { type: 'synthesis', content: synthesis };
  }
}
```

### 5.3 State Machine

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  IDLE   │────►│ PLANNING│────►│EXECUTING│────►│SYNTHESIS│
└─────────┘     └─────────┘     └─────────┘     └─────────┘
                                              │
                                              ▼
                                           ┌─────────┐
                                           │ COMPLETE│
                                           └─────────┘
```

---

## 6. MCP Client Architecture

### 6.1 Transport Abstraction

```typescript
interface MCPTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(request: JSONRPCRequest): Promise<JSONRPCResponse>;
  onNotification(handler: (notification: JSONRPCNotification) => void): void;
}

class StdioTransport implements MCPTransport {
  private process: ChildProcess;
  // Spawns subprocess, communicates via stdin/stdout
}

class SSETransport implements MCPTransport {
  private eventSource: EventSource;
  // Connects to SSE endpoint over HTTP
}
```

### 6.2 MCP Client Lifecycle

```
User Adds Server
      │
      ▼
┌─────────────────┐
│ Validate Config │ ──► Check command exists, URL is valid
└─────────────────┘
      │
      ▼
┌─────────────────┐
│ Spawn / Connect │ ──► stdio: spawn process; SSE: open EventSource
└─────────────────┘
      │
      ▼
┌─────────────────┐
│ Initialize      │ ──► Send initialize request, negotiate protocol version
└─────────────────┘
      │
      ▼
┌─────────────────┐
│ Discover Tools  │ ──► Call tools/list, cache tool schemas
└─────────────────┘
      │
      ▼
┌─────────────────┐
│ Ready           │ ──► Server available for tool calls
└─────────────────┘
```

### 6.3 Tool Execution Flow

```
LLM Output
    │
    ▼
[Contains tool_call?]
    │ Yes
    ▼
┌─────────────────┐
│ Parse Call      │ ──► Extract name + arguments
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Validate Schema │ ──► JSONSchema validation against tool definition
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ User Approval?  │ ──► If tool is destructive or network-accessing
└─────────────────┘
    │ Approved
    ▼
┌─────────────────┐
│ Execute via     │ ──► stdio: write to process stdin
│ MCP Transport   │     SSE: POST to server
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Parse Result    │ ──► Convert MCP result to chat message
└─────────────────┘
    │
    ▼
[Inject into context, loop back to LLM]
```

---

## 7. Data Flow Diagrams

### 7.1 Single Chat Message Flow

```
User types message
        │
        ▼
┌─────────────────┐
│ 1. Optimistic UI │ ──► Message appears instantly in chat
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 2. API Call     │ ──► POST /api/chat/stream
│    (tRPC/SSE)   │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 3. Retrieve     │ ──► Fetch relevant memory entries
│    Memory       │     Fetch knowledge base chunks
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 4. Build Prompt │ ──► System prompt + memory + KB + history + user message
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 5. LLM Call     │ ──► Provider.streamChat()
│    (Ollama)     │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 6. Stream Parse │ ──► Content chunks | Reasoning | Tool calls
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 7. Tool Exec    │ ──► If tool call: execute, inject result, re-call LLM
│    (if needed)  │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 8. Persist      │ ──► Save message to SQLite
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 9. Extract      │ ──► Async: extract facts/preferences for memory
│    Memory       │
└─────────────────┘
```

### 7.2 RAG Document Query Flow

```
User asks question
        │
        ▼
┌─────────────────┐
│ 1. Embed Query  │ ──► nomic-embed-text via Ollama
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 2. Parallel Search│
│                 │
│  ┌───────────┐  │
│  │ Keyword   │  │ ──► SQLite FTS5 on kb_documents
│  │ (BM25)    │  │
│  └───────────┘  │
│  ┌───────────┐  │
│  │ Vector    │  │ ──► LanceDB cosine similarity
│  │ (Cosine)  │  │
│  └───────────┘  │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 3. RRF Fusion   │ ──► Reciprocal Rank Fusion of keyword + vector results
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 4. Re-rank      │ ──► Optional: cross-encoder re-ranker
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 5. Inject       │ ──► Top-k chunks inserted into system prompt
│    Context      │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ 6. LLM Response │ ──► Answer grounded in retrieved documents
└─────────────────┘
```

---

## 8. Deployment Architectures

### 8.1 Local Development (Single User)

```yaml
# docker-compose.yml (minimal)
services:
  agenthub:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - OLLAMA_URL=http://host.docker.internal:11434
    # Ollama runs on host; everything else in container
```

**Prerequisites:**

- Node.js 20+ (for dev) or Docker
- Ollama installed on host

### 8.2 Full Local Stack (Recommended)

```yaml
# docker-compose.full.yml
services:
  agenthub:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - agenthub-data:/app/data
    environment:
      - DATABASE_URL=file:/app/data/agenthub.db
      - OLLAMA_URL=http://ollama:11434
      - SEARXNG_URL=http://searxng:8080
      - COMFYUI_URL=http://comfyui:8188

  ollama:
    image: ollama/ollama
    volumes:
      - ollama-data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  searxng:
    image: searxng/searxng
    ports:
      - "8080:8080"
    volumes:
      - ./searxng-settings.yml:/etc/searxng/settings.yml

  comfyui:
    image: yanwk/comfyui-boot:latest
    ports:
      - "8188:8188"
    volumes:
      - comfyui-models:/app/ComfyUI/models
      - comfyui-output:/app/ComfyUI/output

volumes:
  agenthub-data:
  ollama-data:
  comfyui-models:
  comfyui-output:
```

### 8.3 Server Deployment (Multi-User)

```yaml
# docker-compose.server.yml
services:
  agenthub:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/agenthub
      - REDIS_URL=redis://redis:6379
      - S3_ENDPOINT=http://minio:9000

  postgres:
    image: postgres:16-alpine
    volumes:
      - postgres-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=agenthub
      - POSTGRES_PASSWORD=password

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data
```

---

## 9. Performance Considerations

### 9.1 Caching Strategy

| Layer             | Cache            | TTL        | Invalidation     |
| ----------------- | ---------------- | ---------- | ---------------- |
| Model list        | In-memory        | 60s        | Manual refresh   |
| Agent configs     | Zustand + SQLite | Infinite   | On edit          |
| Memory embeddings | LanceDB          | Persistent | On memory update |
| Document chunks   | SQLite + LanceDB | Persistent | On re-ingest     |
| TTS audio         | File system      | Infinite   | Manual clear     |
| Web search        | SQLite           | 5 min      | Time-based       |

### 9.2 Optimization Targets

| Metric              | Target       | Strategy                                             |
| ------------------- | ------------ | ---------------------------------------------------- |
| Time to first token | < 2s         | Streaming, fast model loading, connection pooling    |
| RAG query latency   | < 2s         | Indexed embeddings, FTS5, cached chunks              |
| UI interaction      | < 100ms      | Optimistic updates, virtualization, code splitting   |
| App startup         | < 3s         | Lazy load non-critical components, SQLite is instant |
| Memory extraction   | < 5s (async) | Background job, small model, batched                 |

### 9.3 Resource Budgets

| Component          | CPU      | RAM    | GPU       | Notes                      |
| ------------------ | -------- | ------ | --------- | -------------------------- |
| Next.js app        | 1 core   | 512 MB | —         | Lightweight Node.js server |
| Ollama (7B model)  | 4 cores  | 8 GB   | Optional  | 6 GB VRAM if GPU           |
| Ollama (14B model) | 8 cores  | 16 GB  | Optional  | 10 GB VRAM                 |
| Ollama (70B model) | 16 cores | 64 GB  | Optional  | 40 GB VRAM                 |
| LanceDB            | —        | 256 MB | —         | Embedded, negligible       |
| ComfyUI (SDXL)     | 2 cores  | 4 GB   | 8 GB VRAM | Required for image gen     |
| Piper TTS          | —        | 128 MB | —         | Very light                 |
| Whisper (small)    | 2 cores  | 2 GB   | Optional  | Real-time capable          |

---

## 10. Technology Stack

### 10.1 Core Stack

| Layer           | Technology | Version | Rationale                              |
| --------------- | ---------- | ------- | -------------------------------------- |
| Framework       | Next.js    | 14+     | App Router, API routes, SSR/SPA hybrid |
| Language        | TypeScript | 5.4+    | Type safety, excellent DX              |
| Runtime         | Node.js    | 20 LTS  | Stable, good SQLite support            |
| Package Manager | pnpm       | 9+      | Fast, disk efficient                   |
| Monorepo        | Turborepo  | 2+      | Workspace management, caching          |

### 10.2 Frontend

| Category      | Technology                                | Rationale                            |
| ------------- | ----------------------------------------- | ------------------------------------ |
| UI Framework  | React 18 + Server Components              | Industry standard                    |
| Styling       | Tailwind CSS + shadcn/ui                  | Utility-first, accessible components |
| State         | Zustand                                   | Lightweight, slice pattern           |
| Data Fetching | tRPC + TanStack Query                     | End-to-end type safety               |
| Forms         | React Hook Form + Zod                     | Validation, performance              |
| Routing       | Next.js App Router + React Router DOM     | Hybrid approach matching LobeHub     |
| Visualization | react-flow (agent groups), D3 (branching) | Proven libraries                     |
| Markdown      | react-markdown + remark/rehype plugins    | Extensible rendering                 |
| Code          | react-syntax-highlighter + react-live     | Code display + live editing          |

### 10.3 Backend

| Category    | Technology                | Rationale                              |
| ----------- | ------------------------- | -------------------------------------- |
| API         | tRPC + Next.js API Routes | Type-safe, co-located                  |
| Auth        | Better Auth               | Modern, flexible, supports OAuth + MFA |
| ORM         | Drizzle ORM               | Type-safe, SQL-like, small             |
| DB (local)  | better-sqlite3            | Synchronous, fast, embedded            |
| DB (server) | PostgreSQL + pgvector     | Production multi-user                  |
| Vector DB   | LanceDB (embedded)        | Zero config, fast hybrid search        |
| Cache       | Redis (optional)          | Sessions, rate limiting                |
| Validation  | Zod                       | Shared between client/server           |

### 10.4 AI / ML

| Category      | Technology                      | Rationale                         |
| ------------- | ------------------------------- | --------------------------------- |
| LLM Runtime   | Ollama                          | Primary local inference           |
| Embeddings    | Ollama (nomic-embed-text)       | Local, no API cost                |
| Vector Search | LanceDB                         | Hybrid BM25 + cosine              |
| OCR           | tesseract.js                    | Pure JS, no external deps         |
| STT           | faster-whisper (Python service) | Fast, accurate                    |
| TTS           | Piper (HTTP service)            | Neural quality, minimal resources |
| Image Gen     | ComfyUI (Python service)        | Most flexible, latest models      |
| Vision        | Ollama (LLaVA / Qwen2-VL)       | Unified API                       |

### 10.5 DevOps

| Category  | Technology                            | Rationale             |
| --------- | ------------------------------------- | --------------------- |
| Container | Docker + Docker Compose               | Standard, portable    |
| CI/CD     | GitHub Actions                        | Free for public repos |
| Linting   | ESLint + Prettier + TypeScript strict | Code quality          |
| Testing   | Vitest (unit) + Playwright (E2E)      | Fast, modern          |

---

## Appendix: API Contract (OpenAI-Compatible)

To maximize compatibility with existing tools, AgentHub exposes an OpenAI-compatible chat completions API:

```
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer <token>

{
  "model": "qwen2.5:14b",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "stream": true,
  "tools": [...]
}
```

This allows any OpenAI-compatible client (including other agent frameworks) to use AgentHub as a local backend.

---

## 11. Async Worker Layer (Celery Equivalent)

> **Requirement 1.3:** Built-in Celery and Redis queuing for long-running asynchronous agentic flows.

### 11.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AgentHub API Server                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Next.js    │  │  tRPC       │  │  BullMQ Producers       │ │
│  │  API Routes │  │  Routers    │  │  (Job Enqueuer)         │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         └─────────────────┴─────────────────────┘              │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ enqueue
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Redis Broker (BullMQ)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  ingest     │  │ agent-flow  │  │  generate-image         │ │
│  │  queue      │  │  queue      │  │  queue                  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────┬───────────────────────────────┘
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Worker: Ingest  │    │ Worker: Agent   │    │ Worker: Image   │
│ (Node.js proc)  │    │ (Node.js proc)  │    │ (Node.js proc)  │
│                 │    │                 │    │                 │
│ • PDF parse     │    │ • Graph exec    │    │ • ComfyUI API   │
│ • Chunk         │    │ • Checkpoint    │    │ • Poll results  │
│ • Embed         │    │ • HITL notify   │    │ • Save file     │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ SQLite result   │    │ SQLite result   │    │ Local FS        │
│ LanceDB vectors │    │ + WebSocket     │    │ + SQLite ref    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 11.2 Worker Types

| Worker            | Queue            | Concurrency | Max Runtime |
| ----------------- | ---------------- | ----------- | ----------- |
| `IngestWorker`    | `ingest`         | 3           | 10 min      |
| `AgentFlowWorker` | `agent-flow`     | 2           | 30 min      |
| `ImageGenWorker`  | `generate-image` | 2           | 5 min       |
| `MemoryWorker`    | `memory-extract` | 4           | 2 min       |
| `SyncWorker`      | `sync`           | 5           | 30 sec      |

### 11.3 Checkpoint Resume for Agent Flows

```typescript
// Worker pseudo-code
const agentFlowWorker = new Worker("agent-flow", async (job) => {
  const checkpointManager = new CheckpointManager(job.id);
  const graph = await loadGraph(job.data.graphId);

  // Resume from checkpoint if exists
  const checkpoint = await checkpointManager.getLatest(job.data.runId);
  const initialState = checkpoint?.state || graph.initialState;

  const executor = new GraphExecutor(graph, {
    checkpointManager,
    checkpointInterval: 30_000, // 30s
    onCheckpoint: async (cp) => {
      await job.updateProgress({ checkpointId: cp.id, node: cp.state._currentNode });
    },
  });

  for await (const event of executor.run(initialState)) {
    // Broadcast to WebSocket subscribers
    await wsBroadcast(job.data.sessionId, event);

    // Handle HITL pause
    if (event.type === "human_input_required") {
      await job.updateProgress({ status: "waiting_human", prompt: event.prompt });
      // Worker yields; resumes when human response arrives via API
      const humanResponse = await waitForHumanResponse(job.id, event.nodeId);
      executor.injectHumanResponse(event.nodeId, humanResponse);
    }
  }
});
```

---

## 12. A2A Protocol Gateway

> **Requirement 2.4:** Native A2A protocol support for cross-framework agent collaboration.

### 12.1 Gateway Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    A2A Protocol Gateway                          │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  mDNS       │  │  HTTP       │  │  MCP Bridge             │ │
│  │  Discovery  │  │  Registry   │  │  (A2A ↔ MCP)            │ │
│  │  (LAN)      │  │  (Optional) │  │                         │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         └─────────────────┴─────────────────────┘              │
│                            │                                     │
│                   ┌────────┴────────┐                           │
│                   │  Agent Directory │                           │
│                   │  (capabilities)  │                           │
│                   └────────┬────────┘                           │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                 │
│         ▼                  ▼                  ▼                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│  │ LangGraph   │   │  CrewAI     │   │  AutoGen    │          │
│  │ Agent       │   │  Agent      │   │  Agent      │          │
│  │ (Python)    │   │  (Python)   │   │  (Python)   │          │
│  └─────────────┘   └─────────────┘   └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 12.2 Protocol Endpoints

| Endpoint                      | Method | Purpose                        |
| ----------------------------- | ------ | ------------------------------ |
| `/.well-known/a2a/agent.json` | GET    | Agent capability advertisement |
| `/a2a/tasks/send`             | POST   | Submit task to agent           |
| `/a2a/tasks/{id}/status`      | GET    | Poll task status               |
| `/a2a/tasks/{id}/cancel`      | POST   | Cancel running task            |
| `/a2a/skills`                 | GET    | List available skills          |

---

## 13. Trust Engine / Credential Vault

> **Requirement 3.1:** Process-isolated trust engine separating credentials from LLM view.

### 13.1 Isolation Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Main Process (Next.js + Agent Runtime)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  LLM Chat   │  │  Tool       │  │  IPC Client             │ │
│  │  Interface  │  │  Router     │  │  (Unix domain socket)   │ │
│  └─────────────┘  └──────┬──────┘  └─────────────────────────┘ │
│                          │ NO CREDENTIALS HERE                │
└──────────────────────────┼─────────────────────────────────────┘
                           │ IPC (protobuf / JSON)
┌──────────────────────────┼─────────────────────────────────────┐
│  Trust Engine Process (separate Node.js process)                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Credential │  │  Policy     │  │  Tool Execution         │ │
│  │  Vault      │  │  Engine     │  │  Wrapper                │ │
│  │  (AES-256)  │  │             │  │                         │ │
│  └─────────────┘  └──────┬──────┘  └─────────────────────────┘ │
│                          │                                      │
│  Flow: Tool name + args ─┼──► Policy lookup required cred     │
│          │               │      Decrypt from vault             │
│          │               │      Inject into tool call          │
│          │               │      Execute tool                   │
│          │               │      Return result (no cred leaked) │
│          ▼               │                                      │
│  Result returned to main │                                      │
└──────────────────────────┴─────────────────────────────────────┘
```

### 13.2 Credential Types

| Type                | Example           | Storage                                |
| ------------------- | ----------------- | -------------------------------------- |
| API Keys            | OpenAI, Anthropic | Vault, encrypted                       |
| OAuth Tokens        | GitHub, Google    | Vault, encrypted, auto-refresh         |
| Passwords           | Database, SSH     | Vault, encrypted, Argon2-hashed master |
| Certificates        | TLS client certs  | Vault, encrypted                       |
| Desktop Permissions | Accessibility     | OS keychain, vault reference           |

---

## 14. Desktop Agent Bridge

> **Requirement 3.1/3.2:** Accessibility API control + local file agent.

### 14.1 OS-Specific Bridges

```
┌─────────────────────────────────────────────────────────────────┐
│                    Desktop Agent Bridge                          │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  File       │  │  OS         │  │  App                    │ │
│  │  Watcher    │  │  Automation │  │  Controller             │ │
│  │  (chokidar) │  │  (AT-SPI/   │  │  (Accessibility APIs)   │ │
│  │             │  │   AX/UIA)   │  │                         │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          │                                      │
│                   ┌──────┴──────┐                               │
│                   │  Action     │                               │
│                   │  Queue      │                               │
│                   └──────┬──────┘                               │
│                          │                                      │
│    ┌─────────────────────┼─────────────────────┐               │
│    ▼                     ▼                     ▼               │
│ ┌──────┐            ┌──────┐            ┌──────┐              │
│ │Linux │            │macOS │            │Win   │              │
│ │AT-SPI│            │AX API│            │UIA   │              │
│ └──────┘            └──────┘            └──────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### 14.2 Action Types

| Action | Linux (AT-SPI)               | macOS (AX)                      | Windows (UIA)                        |
| ------ | ---------------------------- | ------------------------------- | ------------------------------------ |
| Click  | `atk_action_do_action`       | `AXUIElementPerformAction`      | `IUIAutomationElement.Click`         |
| Type   | `atk_text_set_text_contents` | `AXUIElementSetAttributeValue`  | `IUIAutomationValuePattern.SetValue` |
| Read   | `atk_text_get_text`          | `AXUIElementCopyAttributeValue` | `IUIAutomationElement.CurrentName`   |
| Focus  | `atk_component_grab_focus`   | `AXUIElementSetAttributeValue`  | `IUIAutomationElement.SetFocus`      |

---

## 15. Mode Runtime Engine

> **Requirement 3.3:** Mode-first packaging with specialized agent configurations.

### 15.1 Mode Execution Model

```
User selects Mode
        │
        ▼
┌───────────────────┐
│ Load Mode Config  │ ──► systemPrompt, tools, UI, KB, memoryNS
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Isolate Context   │ ──► New memory namespace, filtered tool registry
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Render Mode UI    │ ──► Custom welcome message, shortcuts, input placeholder
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Execute in Mode   │ ──► All agent responses use mode's system prompt
└───────────────────┘
```

### 15.2 Mode Registry

```typescript
interface ModeRegistry {
  builtinModes: Mode[]; // Shipped with AgentHub
  installedModes: Mode[]; // From marketplace
  customModes: Mode[]; // User-created

  activate(modeId: string): ActiveModeSession;
  deactivate(sessionId: string): void;
}
```

---

## 16. State Checkpoint Manager

> **Requirement 4.1/4.2:** Deterministic state persistence, checkpointing, pause/resume, human-in-the-loop.

### 16.1 Checkpoint Lifecycle

```
Graph Execution
        │
        ▼
┌───────────────────┐
│ Enter Node        │ ──► Save checkpoint before execution
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Execute Node      │ ──► Streaming output to client
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Exit Node         │ ──► Save checkpoint after execution
└────────────────────
        │
        ▼
[Human-in-the-loop?]
    │ Yes
    ▼
┌───────────────────┐
│ PAUSE             │ ──► Status = waiting_human
│ Save state        │     Notify user via WebSocket
└───────────────────┘
    │
    ▼
[Human responds]
    │
    ▼
┌───────────────────┐
│ RESUME            │ ──► Load checkpoint, inject human input
│ Continue          │     Execute next node
└───────────────────┘
```

### 16.2 Checkpoint Storage

```sql
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  graph_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  state TEXT NOT NULL,        -- JSON: full graph state
  node_results TEXT NOT NULL, -- JSON: map of nodeId -> result
  status TEXT NOT NULL CHECK(status IN ('running','paused','completed','failed','waiting_human')),
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX idx_checkpoints_run ON checkpoints(run_id, created_at DESC);
```

---

_End of ARCHITECTURE.md v2.0_

---

## 17. Observability & APM Layer

> **Requirement:** Application Performance Monitoring for token consumption, latency, traces, and cost management.

### 17.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Observability & APM Layer                     │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Metrics    │  │  Traces     │  │  Events                 │ │
│  │  Collector  │  │  Collector  │  │  Collector              │ │
│  │  (tRPC      │  │  (async     │  │  (sync)                 │ │
│  │   middleware│  │   hooks)    │  │                         │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          │                                      │
│                   ┌──────┴──────┐                               │
│                   │  SQLite     │                               │
│                   │  Store      │                               │
│                   │             │                               │
│                   │ • metrics   │                               │
│                   │ • traces    │                               │
│                   │ • spans     │                               │
│                   │ • events    │                               │
│                   └──────┬──────┘                               │
│                          │                                      │
│         ┌────────────────┼────────────────┐                   │
│         ▼                ▼                ▼                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ Dashboard   │  │ Prometheus  │  │ Alerts      │          │
│  │ (React)     │  │ /metrics    │  │ (in-app)    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 17.2 Collection Points

| Layer  | Hook               | Data Captured                                        |
| ------ | ------------------ | ---------------------------------------------------- |
| API    | tRPC middleware    | Request duration, status, user, endpoint             |
| LLM    | Provider wrapper   | Model, tokens, latency, cost                         |
| Tools  | Tool router        | Tool name, args (sanitized), duration, result status |
| Agents | Orchestrator hooks | Agent name, step number, decision, output size       |
| RAG    | KB pipeline        | Document count, chunk count, retrieval time          |
| Queue  | BullMQ events      | Job type, wait time, processing time, retry count    |

### 17.3 Dashboard Components

```
┌─────────────────────────────────────────────────────────────────┐
│  Observability Dashboard                                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │ Tokens  │ │ Latency │ │ Errors  │ │ Active  │              │
│  │ Today   │ │ Avg     │ │ Rate    │ │ Sessions│              │
│  │ 45.2K   │ │ 1.2s    │ │ 0.3%    │ │ 12      │              │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘              │
├─────────────────────────────────────────────────────────────────┤
│  Token Consumption (Line Chart: last 7 days)                    │
├─────────────────────────────────────────────────────────────────┤
│  Model Performance (Table)                                      │
│  Model          │ Avg Latency │ Tokens │ Cost  │ Satisfaction │
│  qwen2.5:7b     │ 1.1s        │ 32K    │ $0    │ 92%          │
│  qwen2.5:14b    │ 2.3s        │ 18K    │ $0    │ 95%          │
│  gpt-4o         │ 0.8s        │ 5K     │ $0.15 │ 96%          │
├─────────────────────────────────────────────────────────────────┤
│  Recent Traces (Filterable List)                                │
│  [trace_001] chat_message │ 1.5s │ OK │ qwen2.5:7b │ 12:34:56 │
│  [trace_002] agent_flow   │ 8.2s │ OK │ multi      │ 12:35:10 │
│  [trace_003] chat_message │ 0.5s │ ERR│ ollama     │ 12:36:01 │
└─────────────────────────────────────────────────────────────────┘
```

---

_End of ARCHITECTURE.md v2.1 — Observability layer added._

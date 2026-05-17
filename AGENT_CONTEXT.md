# AgentHub — Complete Agent Context Document

> **Purpose:** Comprehensive project documentation enabling AI agents to understand, navigate, and modify AgentHub without direct filesystem access.  
> **Audience:** AI coding agents, new team members, architectural reviewers  
> **Last Updated:** 2026-05-11  
> **Version:** 1.0

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture & Stack](#2-architecture--stack)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Database Schema (Complete)](#4-database-schema-complete)
5. [Authentication System](#5-authentication-system)
6. [API Layer](#6-api-layer)
7. [Provider System](#7-provider-system)
8. [Agent Runtime](#8-agent-runtime)
9. [Tool System](#9-tool-system)
10. [Orchestrator System](#10-orchestrator-system)
11. [Memory System](#11-memory-system)
12. [Knowledge Base & RAG](#12-knowledge-base--rag)
13. [Frontend Architecture](#13-frontend-architecture)
14. [State Management](#14-state-management)
15. [Environment & Configuration](#15-environment--configuration)
16. [Docker Infrastructure](#16-docker-infrastructure)
17. [Development Workflow](#17-development-workflow)
18. [Testing Strategy](#18-testing-strategy)
19. [Current Implementation Status](#19-current-implementation-status)
20. [Key Design Decisions](#20-key-design-decisions)
21. [Common Patterns & Conventions](#21-common-patterns--conventions)
22. [Troubleshooting Guide](#22-troubleshooting-guide)

---

## 1. Project Overview

**AgentHub** is an open-source, agent-first AI platform for self-hosted local inference. Unlike chat-first platforms (ChatGPT, LobeChat), AgentHub treats the **agent** as the primary entity — chat is merely one interaction mode among many (orchestration, automation, tool use).

### Core Philosophy

| Principle | Description |
|-----------|-------------|
| **Agent-first** | Agents are first-class entities with personas, tools, memory, and knowledge. Conversations happen *through* agents, not around models. |
| **Local-first** | Primary inference via Ollama, vLLM, LM Studio. No cloud API keys required. Optional cloud providers via OAuth. |
| **White-box memory** | User-editable, structured memory entries with categories, confidence scores, and manual curation. |
| **Deep orchestration** | 5 multi-agent patterns: sequential, parallel, supervisor, debate, groupchat. |
| **Extensibility** | MCP (Model Context Protocol) + A2A (Agent-to-Agent) protocol for tool and agent interoperability. |

### What AgentHub Is NOT

- NOT a LobeChat clone (different architecture, agent-first vs chat-first)
- NOT a cloud provider aggregator (deliberately minimal cloud support)
- NOT a consumer chatbot (target: developers, researchers, automation engineers)
- NOT a no-code platform (prosumer-oriented, code-friendly)

---

## 2. Architecture & Stack

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15.5.18 (App Router), React 18, TypeScript, Tailwind CSS |
| **State Management** | Zustand (client-side), tRPC + React Query (server state) |
| **API Layer** | tRPC 11 (typesafe RPC), Next.js API Routes (SSE streaming) |
| **ORM** | Drizzle ORM with PostgreSQL |
| **Database** | PostgreSQL 16 + pgvector extension |
| **Auth** | NextAuth v4 + Casdoor OIDC |
| **File Storage** | MinIO (S3-compatible, self-hosted) |
| **Cache** | Redis (future use, currently minimal) |
| **Package Manager** | pnpm 9 + Turborepo |
| **Monorepo** | 3 packages: `@agenthub/web`, `@agenthub/agent-runtime`, `@agenthub/ai-providers` |

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  React 18 + Next.js App Router + Tailwind + Zustand         │
└──────────────────────┬──────────────────────────────────────┘
                       │ tRPC / SSE
┌──────────────────────▼──────────────────────────────────────┐
│                    Next.js Server                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │ tRPC Router │  │ API Routes   │  │ NextAuth        │    │
│  │ (_app.ts)   │  │ (/api/*)     │  │ (Casdoor OIDC)  │    │
│  └──────┬──────┘  └──────┬───────┘  └─────────────────┘    │
│         │                │                                   │
│  ┌──────▼──────┐  ┌──────▼───────┐  ┌─────────────────┐    │
│  │ AgentRuntime│  │ SSE Stream   │  │ ProviderRegistry│    │
│  │ (pkg/agent) │  │ (/chat/stream)│  │ (pkg/ai)       │    │
│  └──────┬──────┘  └──────────────┘  └─────────────────┘    │
└─────────┼────────────────────────────────────────────────────┘
          │
┌─────────▼────────────────────────────────────────────────────┐
│              Infrastructure (Docker Compose)                 │
│  PostgreSQL 5432  │  MinIO 9000/9001  │  Casdoor 8000       │
│  Redis 6379       │  Ollama 11434 (host)                     │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Monorepo Structure

```
AgentHub/
├── apps/
│   └── web/                          # Next.js application
│       ├── src/
│       │   ├── app/                  # App Router routes
│       │   │   ├── api/
│       │   │   │   ├── auth/[...nextauth]/route.ts
│       │   │   │   ├── chat/stream/route.ts
│       │   │   │   ├── groups/stream/route.ts
│       │   │   │   ├── kb/ingest/route.ts
│       │   │   │   ├── kb/query/route.ts
│       │   │   │   ├── trpc/[trpc]/route.ts
│       │   │   │   └── upload/presigned/route.ts
│       │   │   ├── kb/page.tsx
│       │   │   ├── settings/page.tsx
│       │   │   ├── layout.tsx
│       │   │   └── page.tsx
│       │   ├── components/           # React components
│       │   │   ├── AgentBuilder.tsx
│       │   │   ├── AgentGroupBuilder.tsx
│       │   │   ├── AgentGroupList.tsx
│       │   │   ├── AgentList.tsx
│       │   │   ├── AgentMarketplace.tsx
│       │   │   ├── ChatInput.tsx
│       │   │   ├── ChatInterface.tsx
│       │   │   ├── ChatMessage.tsx
│       │   │   ├── KnowledgeBaseManager.tsx
│       │   │   ├── MemoryEditor.tsx
│       │   │   ├── ModelSelector.tsx
│       │   │   ├── ProviderSettings.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   ├── ThemeProvider.tsx
│       │   │   ├── ThemeToggle.tsx
│       │   │   ├── ToolCallCard.tsx
│       │   │   ├── UserNav.tsx
│       │   │   └── VirtualizedMessageList.tsx
│       │   ├── lib/                  # Utilities
│       │   │   ├── s3.ts             # MinIO client
│       │   │   ├── title.ts          # Auto title generation
│       │   │   └── trpc.ts           # tRPC client setup
│       │   ├── server/               # Server-side code
│       │   │   ├── auth.ts           # NextAuth config
│       │   │   ├── db/
│       │   │   │   ├── index.ts      # Drizzle client
│       │   │   │   └── schema.ts     # Full DB schema
│       │   │   ├── marketplace/
│       │   │   │   └── manifest.ts   # Agent manifest parser
│       │   │   ├── memory.ts         # Memory helpers
│       │   │   ├── routers/
│       │   │   │   └── _app.ts       # tRPC router (all procedures)
│       │   │   └── trpc.ts           # tRPC context + middleware
│       │   └── stores/
│       │       └── chatStore.ts      # Zustand store
│       ├── tests/e2e/                # Playwright E2E tests
│       ├── drizzle.config.ts
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── agent-runtime/                # Agent execution engine
│   │   ├── src/
│   │   │   ├── index.ts              # Exports
│   │   │   ├── runtime.ts            # AgentRuntime class
│   │   │   ├── types.ts              # Runtime types
│   │   │   ├── mcp/
│   │   │   │   └── client.ts         # MCP client (partial)
│   │   │   ├── orchestrators/
│   │   │   │   ├── base.ts           # BaseOrchestrator
│   │   │   │   ├── sequential.ts
│   │   │   │   ├── parallel.ts
│   │   │   │   ├── supervisor.ts
│       │   │   │   ├── debate.ts
│       │   │   │   ├── groupchat.ts
│       │   │   │   ├── types.ts
│       │   │   │   └── index.ts
│       │   │   └── tools/
│       │   │       ├── registry.ts   # Tool registry
│       │   │       └── builtin/
│       │   │           ├── calculator.ts
│       │   │           ├── datetime.ts
│       │   │           └── read-file.ts
│       │   ├── tests/
│       │   └── tsconfig.json
│       └── ai-providers/             # LLM provider abstraction
│           ├── src/
│           │   ├── index.ts
│           │   ├── types.ts
│           │   ├── registry.ts       # ProviderRegistry
│           │   └── providers/
│           │       ├── anthropic.ts
│           │       ├── gemini.ts
│           │       ├── lmstudio.ts
│           │       ├── moonshot.ts
│           │       ├── ollama.ts
│           │       ├── openai.ts
│           │       ├── openai-compatible.ts
│           │       └── vllm.ts
│           └── tsconfig.json
├── docker-compose.yml
├── E2E_FEATURE_PLANS.md
├── IMPLEMENTATION_ROADMAP.md
├── FEATURE_CATALOG.md
└── package.json
```

---

## 4. Database Schema (Complete)

All tables use Drizzle ORM with PostgreSQL. Key conventions:
- Primary keys: `uuid("id").primaryKey().defaultRandom()`
- Timestamps: `timestamp("created_at", { mode: "date" }).notNull().defaultNow()`
- Foreign keys: `references(() => table.id, { onDelete: "cascade" })` or `"set null"`
- JSON fields: `jsonb("field")` for arrays/objects
- Booleans: `boolean("flag").default(true/false)`

### Schema Overview

```typescript
// Auth (NextAuth)
users                    // id, name, email, emailVerified, image, role
accounts                 // NextAuth OAuth accounts
sessions                 // NextAuth session tokens
verificationTokens       // NextAuth email verification

// Core Entities
agents                   // Agent definitions (personas)
agentGroups              // Multi-agent groups
groupMembers             // Agent-to-group assignments

// Conversations
chatSessions             // Chat conversations
messages                 // Individual messages

// Knowledge Base
knowledgeBases           // KB collections
documents                // Uploaded files
documentChunks           // Chunked text with embeddings (pgvector)

// Memory
memoryEntries            // White-box memory facts

// Files
files                    // Generic file uploads

// Settings & Credentials
settings                 // Key-value user settings
providerCredentials      // OAuth/API key storage for cloud LLMs
```

### Detailed Schema

#### `users`
```typescript
id: uuid(pk)
name: text
email: text (unique, notNull)
emailVerified: timestamp
image: text
role: text (default "user")
createdAt: timestamp
createdAt: timestamp
```

#### `agents`
```typescript
id: uuid(pk)
userId: uuid (FK → users, onDelete: cascade)
name: text (notNull)
description: text
avatar: text
systemPrompt: text (notNull)
model: text (default "ollama:qwen2.5:7b")
temperature: real (default 0.7)
maxTokens: integer (default 4096)
tools: text (default "[]", JSON string)
memoryEnabled: boolean (default true)
knowledgeBaseId: uuid (FK → knowledgeBases, onDelete: set null)
tags: text (default "[]", JSON string)
isPublic: boolean (default false)
createdAt: timestamp
updatedAt: timestamp
```

#### `agentGroups`
```typescript
id: uuid(pk)
userId: uuid (FK → users)
name: text (notNull)
description: text
pattern: enum ["sequential", "parallel", "supervisor", "debate", "groupchat"] (default "sequential")
createdAt: timestamp
updatedAt: timestamp
```

#### `groupMembers`
```typescript
id: uuid(pk)
groupId: uuid (FK → agentGroups, cascade)
agentId: uuid (FK → agents, cascade)
role: text
sortOrder: integer (default 0)
```

#### `chatSessions`
```typescript
id: uuid(pk)
userId: uuid (FK → users, cascade)
agentId: uuid (FK → agents, set null)
groupId: uuid (FK → agentGroups, set null)
title: text (default "New Chat")
model: text (default "ollama:qwen2.5:7b")
metadata: jsonb
createdAt: timestamp
updatedAt: timestamp
```

#### `messages`
```typescript
id: uuid(pk)
sessionId: uuid (FK → chatSessions, cascade)
parentId: uuid
role: enum ["user", "assistant", "system", "tool"] (notNull)
content: text (notNull)
reasoning: text
model: text
toolCalls: jsonb
artifacts: jsonb
tokensUsed: integer
latencyMs: integer
createdAt: timestamp
```

#### `knowledgeBases`
```typescript
id: uuid(pk)
userId: uuid (FK → users, cascade)
name: text (notNull)
description: text
embeddingModel: text (default "nomic-embed-text")
chunkSize: integer (default 1000)
chunkOverlap: integer (default 200)
createdAt: timestamp
updatedAt: timestamp
```

#### `documents`
```typescript
id: uuid(pk)
userId: uuid (FK → users, cascade)
knowledgeBaseId: uuid (FK → knowledgeBases, cascade)
name: text (notNull)
mimeType: text (notNull)
size: integer (notNull)
s3Key: text (notNull)
s3Url: text (notNull)
content: text
metadata: jsonb
status: enum ["pending", "processing", "indexed", "error"] (default "pending")
errorMessage: text
createdAt: timestamp
updatedAt: timestamp
```

#### `documentChunks`
```typescript
id: uuid(pk)
documentId: uuid (FK → documents, cascade)
content: text (notNull)
embedding: vector("embedding", { dimensions: 768 })  // pgvector
metadata: jsonb
createdAt: timestamp
```
- Index: `embedding_index` using HNSW with `vector_cosine_ops`
- Additional: GIN index on `messages.content` via `pg_trgm` for text search

#### `memoryEntries`
```typescript
id: uuid(pk)
userId: uuid (FK → users)
agentId: uuid (FK → agents, set null)
category: text (notNull)
key: text (notNull)
value: text (notNull)
confidence: real (default 1)
sourceMessageId: uuid (FK → messages)
status: enum ["accepted", "proposed", "rejected", "archived"] (default "accepted")
isEdited: boolean (default false)
createdAt: timestamp
updatedAt: timestamp
```

#### `providerCredentials`
```typescript
id: uuid(pk)
userId: uuid (FK → users, cascade)
providerId: text (notNull)
providerName: text (notNull)
authType: enum ["api_key", "oauth"] (default "api_key")
apiKey: text
baseUrl: text
accessToken: text
refreshToken: text
expiresAt: timestamp
scope: text
isEnabled: boolean (default true)
createdAt: timestamp
updatedAt: timestamp
```

#### `files`
```typescript
id: uuid(pk)
userId: uuid (FK → users, cascade)
name: text (notNull)
mimeType: text (notNull)
size: integer (notNull)
s3Key: text (notNull)
s3Url: text (notNull)
metadata: jsonb
createdAt: timestamp
```

#### `settings`
```typescript
id: uuid(pk)
userId: uuid (FK → users)
key: text (notNull)
value: text (notNull)
updatedAt: timestamp
```

### Relations (Drizzle)

```typescript
users → agents (one-to-many)
users → chatSessions (one-to-many)
users → knowledgeBases (one-to-many)
users → documents (one-to-many)
users → files (one-to-many)
agents → memoryEntries (one-to-many)
agents → knowledgeBase (many-to-one)
chatSessions → agent (many-to-one)
chatSessions → group (many-to-one)
chatSessions → messages (one-to-many)
knowledgeBases → documents (one-to-many)
documents → knowledgeBase (many-to-one)
documents → chunks (one-to-many)
messages → session (many-to-one)
```

---

## 5. Authentication System

### NextAuth v4 + Casdoor

**Primary auth:** Casdoor OIDC running at `localhost:8000`
- Users click "Sign in with Casdoor" → redirect to Casdoor login → OIDC callback → session created
- Session stored in PostgreSQL via `@auth/drizzle-adapter`

**Session strategy:** JWT (not database sessions)
- Access token valid for short duration
- Refresh handled automatically by NextAuth

**User roles:**
- `"user"` (default)
- `"admin"` (has access to `adminProcedure` tRPC middleware)

**Auth flow:**
```
User clicks sign in
    → /api/auth/signin/casdoor
    → redirect to Casdoor (/login/oauth/authorize)
    → user logs in via Casdoor
    → redirect back to /api/auth/callback/casdoor
    → NextAuth validates code, creates session
    → redirect to app
```

**Middleware:** All tRPC procedures use either:
- `publicProcedure` — no auth required (marketplace catalog, health check)
- `authedProcedure` — requires valid session; injects `ctx.user`
- `adminProcedure` — requires `role === "admin"`

**Environment variables for auth:**
```
CASDOOR_CLIENT_ID=
CASDOOR_CLIENT_SECRET=
CASDOOR_ISSUER=http://localhost:8000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=
```

---

## 6. API Layer

### tRPC Router (`apps/web/src/server/routers/_app.ts`)

All data operations go through tRPC. The router is namespaced:

```typescript
appRouter = {
  health: publicProcedure.query(() => ({ status: "ok" })),

  marketplace: router({
    catalog: publicProcedure.query(),           // bundled catalog items
    validateManifest: publicProcedure.mutation(),
    installManifest: publicProcedure.mutation(),
    installCatalogItem: publicProcedure.mutation(),
  }),

  providers: router({
    list: publicProcedure.query(),              // all available models from all providers
    health: publicProcedure.query(),            // health check all providers
  }),

  agents: router({
    list: authedProcedure.query(),
    get: authedProcedure.input({ id }).query(),
    create: authedProcedure.input(agentInput).mutation(),
    update: authedProcedure.input(agentInput.partial() + id).mutation(),
    delete: authedProcedure.input({ id }).mutation(),
  }),

  agentGroups: router({
    list: authedProcedure.query(),
    get: authedProcedure.input({ id }).query(),
    create: authedProcedure.input(groupInput).mutation(),
    update: authedProcedure.input(groupInput.partial() + id).mutation(),
    delete: authedProcedure.input({ id }).mutation(),
    members: authedProcedure.query(),           // list members of a group
  }),

  memoryEntries: router({
    list: authedProcedure.input({ agentId?, category?, status? }).query(),
    create: authedProcedure.input(memoryEntryInput).mutation(),
    update: authedProcedure.input(memoryEntryInput.partial() + id).mutation(),
    delete: authedProcedure.input({ id }).mutation(),
  }),

  sessions: router({
    list: authedProcedure.query(),
    create: authedProcedure.input({ title?, model?, agentId?, groupId? }).mutation(),
    update: authedProcedure.input({ id, title?, model?, agentId?, groupId? }).mutation(),
    delete: authedProcedure.input({ id }).mutation(),
    fork: authedProcedure.input({ id, messageId }).mutation(),  // branch conversation
  }),

  messages: router({
    list: authedProcedure.input({ sessionId }).query(),
    create: authedProcedure.input(messageInput).mutation(),
    update: authedProcedure.input({ id, content?, reasoning?, model?, toolCalls? }).mutation(),
    delete: authedProcedure.input({ id }).mutation(),
    deleteAfter: authedProcedure.input({ sessionId, messageId }).mutation(),
    search: authedProcedure.input({ q, limit? }).query(),       // pg_trgm search
  }),

  knowledgeBases: router({
    list: authedProcedure.query(),
    create: authedProcedure.input(kbInput).mutation(),
    delete: authedProcedure.input({ id }).mutation(),
    documents: authedProcedure.input({ knowledgeBaseId }).query(),
    query: authedProcedure.input({ knowledgeBaseId, query, limit? }).mutation(),
    createDocument: authedProcedure.input(documentInput).mutation(),
    ingestDocument: authedProcedure.input({ documentId }).mutation(),
    deleteDocument: authedProcedure.input({ id }).mutation(),
  }),

  files: router({
    list: authedProcedure.query(),
    delete: authedProcedure.input({ id }).mutation(),
  }),

  providerCredentials: router({
    list: authedProcedure.query(),
    create: authedProcedure.input(credentialInput).mutation(),
    update: authedProcedure.input(credentialInput.partial() + id).mutation(),
    delete: authedProcedure.input({ id }).mutation(),
  }),
}
```

### REST API Routes (`apps/web/src/app/api/`)

These are Next.js App Router API routes (not tRPC):

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/[...nextauth]` | ALL | NextAuth handlers |
| `/api/chat/stream` | POST | SSE streaming for single-agent chat |
| `/api/groups/stream` | POST | SSE streaming for multi-agent groups |
| `/api/kb/ingest` | POST | Document chunking + embedding pipeline |
| `/api/kb/query` | POST | Vector similarity search |
| `/api/upload/presigned` | POST | Generate presigned S3 URL for file upload |
| `/api/trpc/[trpc]` | ALL | tRPC HTTP handler |

### SSE Streaming Format

Both `/api/chat/stream` and `/api/groups/stream` return Server-Sent Events:

```
data: {"type":"content","content":"Hello"}

data: {"type":"reasoning","content":"Let me think..."}

data: {"type":"tool_call","toolCall":{"id":"1","type":"function","function":{"name":"calculator","arguments":"{\"expression\":\"2+2\"}"}}}

data: {"type":"tool_result","toolCallId":"1","toolName":"calculator","result":"4"}

data: {"type":"done"}
```

**Group-specific events:**
```
data: {"type":"group_start","groupId":"...","groupName":"Dev Team","pattern":"supervisor","agentCount":3}

data: {"type":"agent_start","groupId":"...","agentId":"...","agentName":"Architect"}

data: {"type":"supervisor_plan","groupId":"...","plan":"1. Design API..."}

data: {"type":"group_complete","groupId":"...","synthesis":"...","outputs":[...]}
```

---

## 7. Provider System

### Provider Registry (`packages/ai-providers`)

The `ProviderRegistry` maintains a map of `providerId → ModelProvider`. Each provider implements:

```typescript
interface ModelProvider {
  readonly id: string;
  readonly name: string;
  readonly type: "local" | "cloud";
  listModels(): Promise<ModelInfo[]>;
  healthCheck(): Promise<HealthStatus>;
  streamChat(options: ChatOptions): AsyncGenerator<ChatStreamChunk>;
}
```

### Built-in Providers

| Provider | Type | Connection | Status |
|----------|------|------------|--------|
| **Ollama** | local | `OLLAMA_URL` env (default localhost:11434) | ✅ Primary, fully implemented |
| **LM Studio** | local | OpenAI-compatible endpoint | 🔧 Registered, untested |
| **vLLM** | local | OpenAI-compatible endpoint | 🔧 Registered, untested |
| **Anthropic** | cloud | API key or OAuth | ✅ Implemented |
| **OpenAI** | cloud | API key or OAuth | ✅ Implemented |
| **Gemini** | cloud | API key or OAuth | ✅ Implemented |
| **Moonshot** | cloud | API key or OAuth | ✅ Implemented |

### Model ID Format

Models are identified as `providerId:modelId`:
- `ollama:qwen2.5:7b`
- `ollama:llama3.1:8b`
- `anthropic:claude-3-sonnet`
- `openai:gpt-4o`

### Cloud Provider Credentials

Users add credentials at `/settings/providers`:
- **API Key mode:** Store encrypted key in `providerCredentials.apiKey`
- **OAuth mode:** Store access/refresh tokens in `providerCredentials.accessToken`

At runtime, `/api/chat/stream` loads the user's enabled credentials and calls `providerRegistry.loadUserCredentials()` before creating the `AgentRuntime`.

### Model Capabilities

Models declare capabilities: `chat`, `vision`, `tools`, `embeddings`, `reasoning`. The `ModelSelector` can filter by capability. Currently this is informational only — not enforced.

---

## 8. Agent Runtime

### `AgentRuntime` Class (`packages/agent-runtime/src/runtime.ts`)

The core execution engine for single-agent conversations.

```typescript
class AgentRuntime {
  constructor(options: AgentOptions)  // model, systemPrompt, temperature, maxTokens, etc.

  async *run(options: RunOptions): AsyncGenerator<AgentStreamChunk>
    // 1. Resolves model via ProviderRegistry
    // 2. Injects system prompt if not present
    // 3. Enables tools specified in RunOptions.tools
    // 4. Streams via provider.streamChat()
    // 5. Handles tool calls: executes tool → adds result to messages → continues streaming
    // 6. Repeats up to maxToolIterations (default 3)
}
```

### Configuration

```typescript
interface AgentOptions {
  model: string;              // "provider:modelId" format
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  maxToolIterations?: number; // default 3
  toolTimeoutMs?: number;     // default 30s
}

interface RunOptions {
  sessionId: string;
  messages: Message[];        // { role, content, tool_calls?, tool_call_id?, name? }
  tools?: string[];           // List of tool names to enable
  signal?: AbortSignal;
}
```

### Stream Chunk Types

```typescript
type AgentStreamChunk =
  | { type: "content"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "tool_result"; toolName: string; toolCallId?: string; result: any }
```

### Tool Execution Loop

```
1. Stream initial response from LLM
2. If LLM emits tool_call:
   a. Pause content streaming
   b. Execute tool via ToolRegistry
   c. Add tool_result to message history
   d. Send tool_result SSE event to client
   e. Continue streaming with updated context
3. Repeat up to maxToolIterations
4. Final content (or no content if only tool calls)
```

---

## 9. Tool System

### Tool Registry (`packages/agent-runtime/src/tools/registry.ts`)

Global singleton `globalToolRegistry` maintains all available tools.

```typescript
class ToolRegistry {
  register(tool: ToolDefinition): void
  list(): ToolDefinition[]
  find(name: string): ToolDefinition | undefined
  zodToJSONSchema(schema: ZodSchema): JSONSchema
}
```

### Tool Definition

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: ZodSchema;      // Zod schema converted to JSON Schema for LLM
  execute: (args: any) => Promise<any>;
}
```

### Built-in Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `calculator` | Evaluate math expressions | `{ expression: string }` |
| `datetime` | Get current date/time | `{}` |
| `read_file` | Read file content | `{ path: string }` |

### Tool Enablement

Tools are enabled per-agent or per-request:
- Agent config stores `tools` as JSON string array: `["calculator", "datetime"]`
- `AgentRuntime.run({ tools: ["calculator"] })` enables only specified tools
- Tools are converted to OpenAI function-calling format before being sent to the LLM

### Adding a New Tool

1. Create file in `packages/agent-runtime/src/tools/builtin/my-tool.ts`
2. Define Zod schema + execute function
3. Register in `packages/agent-runtime/src/index.ts`
4. Add to `TOOL_OPTIONS` in `AgentBuilder.tsx` for UI visibility

---

## 10. Orchestrator System

### Architecture

Orchestrators manage multi-agent group execution. All implement the `Orchestrator` interface:

```typescript
interface Orchestrator {
  run(options: OrchestratorRunOptions): AsyncGenerator<OrchestratorEvent>;
}
```

### Orchestrator Types

| Pattern | Class | Description |
|---------|-------|-------------|
| **Sequential** | `SequentialOrchestrator` | Agents run one after another. Each sees previous outputs. |
| **Parallel** | `ParallelOrchestrator` | All agents run simultaneously. Results synthesized at end. |
| **Supervisor** | `SupervisorOrchestrator` | Coordinator agent plans, delegates to workers, synthesizes. |
| **Debate** | `DebateOrchestrator` | Agents argue in rounds. Moderator synthesizes final position. |
| **GroupChat** | `GroupChatOrchestrator` | Turn-based conversation until consensus or max turns. |

### Event Types

```typescript
type OrchestratorEvent =
  // Lifecycle
  | { type: "group_start"; groupId; groupName; pattern; agentCount }
  | { type: "group_complete"; groupId; groupName; pattern; outputs; synthesis }
  | { type: "error"; groupId?; agentId?; error }

  // Agent events
  | { type: "agent_start"; groupId; agentId; agentName; role }
  | { type: "agent_output"; groupId; agentId; agentName; chunk }
  | { type: "agent_complete"; groupId; agentId; agentName; output }

  // Supervisor-specific
  | { type: "supervisor_start"; groupId; supervisor }
  | { type: "supervisor_thinking"; groupId; content }
  | { type: "supervisor_plan"; groupId; plan }
  | { type: "supervisor_review"; groupId; review }

  // Debate-specific
  | { type: "debate_start"; groupId; agents; rounds }
  | { type: "debate_round"; groupId; round; total }

  // GroupChat-specific
  | { type: "groupchat_start"; groupId; agents; maxTurns }
  | { type: "groupchat_turn"; groupId; turn; maxTurns }
```

### Execution Flow

```
User sends message to group
    → POST /api/groups/stream
    → Load group config + members
    → Instantiate orchestrator based on group.pattern
    → orchestrator.run({ group, agents, task, sessionId })
    → For each event:
        - Serialize to SSE
        - If group_complete: persist synthesis to messages table
        - If error: emit error event
```

### Role Assignment

Group members have optional `role` strings. Patterns use roles to assign responsibilities:
- **Supervisor:** Member with `role === "supervisor"` becomes coordinator; others are workers
- **Debate:** `role` can be "debater" or "moderator"
- **GroupChat:** `role` is informational (e.g., "optimist", "pessimist")

---

## 11. Memory System

### White-Box Memory

AgentHub uses **user-editable, structured memory** rather than black-box model memory.

**Memory Entry Schema:**
```typescript
{
  id: string;
  agentId: string | null;     // null = global memory
  category: string;            // e.g., "profile", "preference", "fact", "goal"
  key: string;                 // e.g., "favorite_language"
  value: string;               // e.g., "Python"
  confidence: number;          // 0.0 to 1.0
  sourceMessageId: string | null;
  status: "accepted" | "proposed" | "rejected" | "archived";
  isEdited: boolean;
}
```

### Memory Injection

Before each chat stream:
1. If `agent.memoryEnabled === true`:
   - Fetch `status = "accepted"` memories for this agent (up to 12)
   - Format as memory block:
     ```
     Relevant saved memories:
     - [profile] favorite_language: Python
     - [preference] code_style: functional
     ```
   - Append to system prompt

### Auto Extraction

After each assistant response:
1. If `agent.memoryEnabled === true`:
   - Send user message + assistant response to Ollama with extraction prompt
   - Parse returned `CATEGORY / KEY / VALUE` triples
   - Store as `status: "proposed"` memory entries
   - User reviews in Memory Editor and clicks Accept/Reject

### Memory Editor UI

`/memory-editor` route (accessed via sidebar):
- Create/edit/delete memory entries manually
- Filter by agent, category, status
- Pending review banner for proposed memories
- Accept/Reject inline buttons for proposed entries

---

## 12. Knowledge Base & RAG

### Pipeline

```
User uploads file to KB
    → Presigned URL from /api/upload/presigned
    → Upload to MinIO
    → Create document row (status: "pending")
    → Call knowledgeBases.ingestDocument
    → POST /api/kb/ingest
        → Fetch file content (text extraction)
        → Clean text (normalize whitespace)
        → Chunk text (configurable size/overlap, default 1000/200)
        → Generate embeddings via Ollama (/api/embeddings)
        → Store chunks in documentChunks (content + embedding vector)
        → Update document status: "indexed"
```

### Vector Search

When agent has `knowledgeBaseId` and user sends message:
1. Embed user's last message via Ollama
2. Query `documentChunks` using pgvector `<=>` (cosine distance) operator
3. Retrieve top-5 most similar chunks
4. Format as context block:
   ```
   ## Relevant Knowledge Base Context
   [1] <chunk content>
   [2] <chunk content>
   ...
   
   Use the above context to answer. Cite sources using [1], [2], etc.
   ```
5. Append to system prompt before streaming

### KB Configuration

Per-KB settings:
- `embeddingModel`: default `"nomic-embed-text"` (Ollama model)
- `chunkSize`: default 1000 characters
- `chunkOverlap`: default 200 characters

### UI

`/kb` route:
- List all KBs
- Create/delete KBs
- Per-KB: upload documents, view status, search/query, delete documents
- Document statuses: `pending`, `processing`, `indexed`, `error`

---

## 13. Frontend Architecture

### Component Hierarchy

```
Layout (Server Component)
└── ThemeProvider
    └── Sidebar
        ├── AgentList
        ├── AgentGroupList
        └── SessionList (with search)
    └── Main Content Area
        └── ChatInterface (when mainView === "chat")
            ├── VirtualizedMessageList
            │   └── ChatMessage (per message)
            │       └── ToolCallCard (if tool calls)
            ├── ChatInput
            └── ModelSelector (if no agent/group)
        └── AgentBuilder (when mainView === "agent-builder")
        └── AgentGroupBuilder (when mainView === "group-builder")
        └── MemoryEditor (when mainView === "memory-editor")
        └── AgentMarketplace (when mainView === "marketplace")
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `ChatInterface` | Main chat UI. Handles sending, streaming, stop, edit, regenerate, branch. |
| `ChatMessage` | Individual message rendering. Markdown (GFM + KaTeX + syntax highlighting). Edit mode for user messages. Action buttons (edit, regenerate, branch, feedback). |
| `ChatInput` | Message input with file upload, drag-and-drop, send button. |
| `VirtualizedMessageList` | Efficient scrolling for long conversations. |
| `Sidebar` | Navigation: agents, groups, sessions, search, quick actions. |
| `AgentBuilder` | Create/edit agents. Form with name, avatar, system prompt, model, temperature, max tokens, tools, memory enabled, KB selector. |
| `AgentGroupBuilder` | Create/edit groups. Pattern selector (5 options), member selection with roles. |
| `KnowledgeBaseManager` | KB management: create, upload, search, delete. |
| `MemoryEditor` | CRUD for memory entries. Filter, pending review. |
| `ModelSelector` | Dropdown of available models with health status. |
| `ProviderSettings` | Add/manage cloud provider credentials (OAuth/API key). |

### Routing

Next.js App Router:
- `/` — Main app (sidebar + chat)
- `/kb` — Knowledge Base manager
- `/settings` — Settings page (providers, etc.)
- `/api/*` — API routes

All UI state (main view, active session) is managed via Zustand, not URL routing.

---

## 14. State Management

### Zustand Store (`chatStore.ts`)

Single store managing all client-side state:

```typescript
interface ChatState {
  // Data
  sessions: ChatSession[];
  agents: Agent[];
  agentGroups: AgentGroup[];
  memoryEntries: MemoryEntry[];
  availableModels: ModelMetadata[];

  // Selection
  activeSessionId: string | null;
  activeAgentId: string | null;
  activeGroupId: string | null;
  selectedModel: string;
  mainView: "chat" | "agent-builder" | "group-builder" | "memory-editor" | "marketplace";

  // UI State
  isGenerating: boolean;
}
```

### Data Flow

```
Server (tRPC query)
    → Zustand setSessions/setAgents/etc.
    → React components re-render
    → User interacts
    → tRPC mutation
    → On success: invalidate queries, update Zustand
    → React components re-render
```

### tRPC Integration

```typescript
// Queries (auto-refetch)
const sessionList = trpc.sessions.list.useQuery();
const agentList = trpc.agents.list.useQuery();
const messageList = trpc.messages.list.useQuery({ sessionId });

// Mutations (manual invalidation)
const createSession = trpc.sessions.create.useMutation({
  onSuccess: () => utils.sessions.list.invalidate(),
});
```

### SSE Streaming

Chat streaming bypasses tRPC and uses raw `fetch()` for SSE:
```typescript
const res = await fetch("/api/chat/stream", {
  method: "POST",
  body: JSON.stringify({ sessionId, messages, model }),
});
const reader = res.body!.getReader();
// Parse SSE chunks, update Zustand message content incrementally
```

---

## 15. Environment & Configuration

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random-string>

# Casdoor
CASDOOR_CLIENT_ID=<from-casdoor>
CASDOOR_CLIENT_SECRET=<from-casdoor>
CASDOOR_ISSUER=http://localhost:8000

# MinIO / S3
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=agenthub_minio_user
S3_SECRET_KEY=agenthub_minio_password
S3_BUCKET=agenthub
S3_REGION=us-east-1

# Ollama
OLLAMA_URL=http://localhost:11434
```

### Optional Variables

```bash
# Cloud provider API keys (fallback if not using OAuth)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=

# App URL (for internal API calls)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Settings Table

User-specific settings stored in DB (key-value):
- `default_model`
- `theme` (light/dark/system)
- `language`
- Other preferences

Currently no UI for settings management beyond the provider credentials page.

---

## 16. Docker Infrastructure

### Services (`docker-compose.yml`)

| Service | Port | Purpose |
|---------|------|---------|
| `network` | 3000, 8000, 9000, 9001, 11434 | Shared network namespace container |
| `postgresql` | 5432 | PostgreSQL 16 + pgvector |
| `redis` | 6379 | Cache (minimal use currently) |
| `minio` | 9000/9001 | S3-compatible object storage |
| `minio-init` | — | Creates bucket on startup |
| `casdoor` | 8000 | OIDC provider |
| `agenthub` | 3000 | Next.js app (built from Dockerfile) |

### Network Mode

All services use `network_mode: service:network` — they share the same network namespace. From within any container, all services are accessible via `localhost`.

### Volumes

- `./data/postgres` → PostgreSQL data
- `./data/minio` → MinIO data
- `./data/casdoor` → Casdoor files
- `./data/redis` → Redis data

---

## 17. Development Workflow

### Commands

```bash
# Install dependencies
pnpm install

# Development (Turborepo runs all packages in parallel)
pnpm dev

# Type checking
pnpm typecheck

# Build
pnpm build

# Lint
pnpm lint

# E2E tests
pnpm test:e2e
```

### Package Scripts

Each package has its own scripts, orchestrated by Turborepo:

```json
// root package.json
{
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint"
  }
}
```

### Adding a New tRPC Procedure

1. Add Zod input schema to `apps/web/src/server/routers/_app.ts`
2. Add procedure to appropriate router namespace
3. Use in frontend via `trpc.namespace.procedure.useQuery()` or `useMutation()`
4. No manual type generation needed — tRPC is end-to-end typesafe

### Adding a New Component

1. Create `apps/web/src/components/MyComponent.tsx`
2. Import and use in parent component
3. Export from `apps/web/src/components/index.ts` if widely used

### Database Migrations

Drizzle Kit is used for schema management:
```bash
cd apps/web
npx drizzle-kit push              # Push schema changes to DB
npx drizzle-kit generate          # Generate migration files
npx drizzle-kit migrate           # Run pending migrations
```

---

## 18. Testing Strategy

### E2E Tests (Playwright)

Located in `apps/web/tests/e2e/`:

```
tests/e2e/
├── auth.setup.ts              # Casdoor login fixture
├── seed.ts                    # Test data seeding
└── specs/
    ├── phase-a/
    │   ├── auth.spec.ts
    │   ├── chat.spec.ts
    │   ├── agent.spec.ts
    │   ├── group.spec.ts
    │   └── marketplace.spec.ts
    ├── phase-b/
    │   └── branching.spec.ts
    ├── phase-c/
    │   └── kb-upload.spec.ts
    ├── phase-d/
    │   └── memory-injection.spec.ts
    ├── phase-e/
    │   └── orchestrator-supervisor.spec.ts
    ├── phase-f/
    │   └── mcp-client.spec.ts
    └── phase-g/
        └── theme.spec.ts
```

### Unit Tests

- `packages/agent-runtime/tests/runtime.test.ts` — AgentRuntime unit tests

### Test Data Strategy

- `seed.ts` creates standard test user + agents + KBs via tRPC
- Auth state shared via Playwright storage state
- Tests tagged `@ollama` skipped if Ollama unreachable

---

## 19. Current Implementation Status

### ✅ Complete (Shipped)

| Feature | Notes |
|---------|-------|
| Streaming chat | SSE via AgentRuntime |
| Markdown rendering | GFM + KaTeX math + Prism syntax highlighting |
| Reasoning/CoT display | `<think>` tag extraction + collapsible panel |
| Auto title generation | Based on first user message |
| Agent CRUD | Full UI + API |
| Agent Group CRUD | All 5 patterns supported |
| Built-in tools | calculator, datetime, read_file |
| Provider registry | Ollama, vLLM, LM Studio, Anthropic, OpenAI, Gemini, Moonshot |
| NextAuth + Casdoor | Full OIDC flow |
| Session forking | Branch conversations at any message |
| File attachments | Upload to MinIO, attach to chat |
| Message editing | Inline edit + truncate + regenerate |
| Message regeneration | Delete + re-run with same context |
| Conversation search | pg_trgm fuzzy search across messages |
| KB creation/management | UI + API |
| Document upload/ingest | Full pipeline: upload → chunk → embed → index |
| KB query | Vector similarity search |
| RAG in chat | Retrieve chunks, inject into system prompt |
| Agent-KB binding | Select KB per agent |
| Memory CRUD | Full UI + API |
| Memory injection | Accepted memories appended to system prompt |
| Auto memory extraction | Post-response extraction, pending review |
| All 5 orchestrators | Sequential, Parallel, Supervisor, Debate, GroupChat |
| Pattern selector UI | Dropdown with descriptions |
| Cloud provider credentials | OAuth + API key storage |
| Provider settings page | `/settings` with provider management |
| Marketplace | Bundled catalog + manifest import/export |
| ThemeProvider | Dark/light mode support (toggle exists but minimal) |

### ✅ Recently Shipped (was Partial or Not Started)

| Feature | Location |
|---------|----------|
| MCP client UI | `McpSettings.tsx`, `McpGovernancePanel.tsx`, `mcp-governance.ts` |
| MCP marketplace UI | `McpMarketplace.tsx` |
| Theme toggle | `ThemeToggle.tsx`, `ThemeSettings.tsx` |
| Admin panel UI | `AdminPanel.tsx` |
| Vision / image input | `packages/agent-runtime/src/tools/builtin/visual-understanding.ts` |
| Code interpreter / sandbox | `sandbox.ts`, `SandboxOutput.tsx` |
| TTS & STT voice | `TTSButton.tsx`, `VoiceInput.tsx` |
| Scheduled automations | `AutomationsManager.tsx`, `automationWorker.ts` |
| Prompt library / slash commands | `PromptLibraryManager.tsx` |
| Context window management | `ContextWindowBar.tsx` |
| Pattern visualizer | `PatternVisualizer.tsx` |
| A2A protocol | `apps/web/src/app/api/a2a/` |

### 🔧 Partial (Backend Ready, UI Incomplete)

| Feature | What's Missing |
|---------|----------------|
| Token tracking | `tokensUsed`/`latencyMs` columns exist but not populated in all code paths |
| Opening messages | Schema missing `openingMessage`/`openingQuestions` |

### ⬜ Not Started (On Roadmap)

| Feature | Priority |
|---------|----------|
| Inline citation UI for RAG | P2 |
| A2UI rendering | Strategic |
| CRDT sync | Strategic |
| Deep research mode | Strategic |

### ❌ Out of Scope

- 40+ cloud providers (deliberately minimal)
- Image generation (use ComfyUI/FLUX externally)
- Video recognition
- Native mobile apps (PWA sufficient)
- Telegram/Discord bots (A2A enables third-party)
- Commercial license tiers

---

## 20. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **PostgreSQL over SQLite** | Vector search (pgvector) + auth scalability |
| **NextAuth v4 over v5** | Stability; v5 beta lacked PG adapters at decision time |
| **Casdoor as primary auth** | Matches reference stack; self-hosted IAM |
| **Agent-first over chat-first** | Differentiation: agent is the entity |
| **White-box memory** | Transparency: user owns and curates memory |
| **Local providers primary** | Privacy-first: no cloud API keys required |
| **Manifest-based marketplace** | Portability: agents as JSON |
| **tRPC over REST** | End-to-end type safety |
| **Zustand over Redux** | Simplicity, minimal boilerplate |
| **Turborepo monorepo** | Shared packages (runtime, providers) with independent versioning |

---

## 21. Common Patterns & Conventions

### Naming Conventions

- **Components:** PascalCase (`ChatMessage.tsx`)
- **Utilities:** camelCase (`formatMemoryBlock`)
- **tRPC procedures:** camelCase (`createMessage`, `listAgents`)
- **Database tables:** snake_case (`chat_sessions`, `memory_entries`)
- **Environment variables:** UPPER_SNAKE_CASE

### Error Handling

- tRPC mutations: throw `new Error("message")` → caught by tRPC → returned as `{ error }`
- API routes: return `Response.json({ error }, { status })`
- Streaming: catch errors, emit `{"type":"error","error":"message"}` SSE event

### TypeScript Patterns

- Strict mode enabled
- Prefer `interface` over `type` for object shapes
- Use `satisfies` for inline validation
- Nullable fields: `field: string | null` (not `field?: string`)

### Component Patterns

- Server components by default (Next.js App Router)
- Client components marked with `"use client"`
- tRPC hooks only in client components
- Zustand store access via `useChatStore()` hook

---

## 22. Troubleshooting Guide

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `tsc` errors about `@agenthub/*` imports | Path aliases not resolving | Ensure `tsconfig.json` has `paths` configured; run `pnpm build` first |
| Drizzle push hangs | PostgreSQL not accessible | Check `docker ps`; ensure `agenthub-db` is healthy |
| Ollama models not appearing | Ollama not running | Start Ollama on host; verify `OLLAMA_URL` |
| MinIO upload fails | Bucket doesn't exist | Restart `minio-init` container: `docker compose up minio-init` |
| Casdoor login redirect fails | Callback URL mismatch | Check `CASDOOR_ISSUER` and `NEXTAUTH_URL` match Casdoor app config |
| Type error on `Map` iteration | Missing `target` in tsconfig | `agent-runtime` tsconfig has `target: "ES2022"` |

### Debug Commands

```bash
# Check all services
docker ps

# Check PostgreSQL
docker exec agenthub-db psql -U agenthub -d agenthub -c "SELECT 1;"

# Check Ollama
curl http://localhost:11434/api/tags

# Check MinIO
curl http://localhost:9000/minio/health/live

# View logs
docker logs agenthub-app
docker logs agenthub-db
docker logs agenthub-casdoor
```

### Reset Everything

```bash
# Stop all services
docker compose down

# Delete data volumes
rm -rf ./data/postgres ./data/minio ./data/casdoor ./data/redis

# Restart
docker compose up -d

# Push schema
npx drizzle-kit push
```

---

## Appendix: Quick Reference

### File Paths Cheat Sheet

| What | Where |
|------|-------|
| Add a tRPC procedure | `apps/web/src/server/routers/_app.ts` |
| Add a React component | `apps/web/src/components/MyComponent.tsx` |
| Add a tool | `packages/agent-runtime/src/tools/builtin/my-tool.ts` |
| Add a provider | `packages/ai-providers/src/providers/my-provider.ts` |
| Modify schema | `apps/web/src/server/db/schema.ts` |
| Add an API route | `apps/web/src/app/api/my-route/route.ts` |
| Modify chat stream | `apps/web/src/app/api/chat/stream/route.ts` |
| Modify group stream | `apps/web/src/app/api/groups/stream/route.ts` |
| Client state | `apps/web/src/stores/chatStore.ts` |
| Auth config | `apps/web/src/server/auth.ts` |
| DB client | `apps/web/src/server/db/index.ts` |
| tRPC context | `apps/web/src/server/trpc.ts` |
| S3/MinIO client | `apps/web/src/lib/s3.ts` |
| Theme config | `apps/web/tailwind.config.ts` |

### Model Capability Tags

```typescript
type Capability = "chat" | "vision" | "tools" | "embeddings" | "reasoning";
```

### Tool JSON Schema Conversion

Tools use Zod schemas that are automatically converted to JSON Schema for LLM function calling:
```typescript
const calculatorSchema = z.object({
  expression: z.string().describe("Math expression to evaluate"),
});
// Converts to OpenAI function schema
```

---

*This document is comprehensive but not exhaustive. When in doubt, check the source code — but this should provide enough context for 90% of development tasks without filesystem access.*

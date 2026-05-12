# AgentHub

> **The Ultimate Local-First AI Agent Platform** — Find, build, and collaborate with agent teammates that grow with you. Fully self-hosted, privacy-preserving, zero API cost, with enterprise-grade orchestration.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Local-First](https://img.shields.io/badge/architecture-local--first-green.svg)]()
[![Ollama](https://img.shields.io/badge/LLM-Ollama-ff6f00.svg)]()
[![MCP](https://img.shields.io/badge/protocol-MCP-blue.svg)]()
[![A2A](https://img.shields.io/badge/protocol-A2A-purple.svg)]()

## 🌟 Vision

AgentHub is a **100% free, local-first** alternative to cloud-dependent AI agent platforms. Inspired by [LobeHub](https://github.com/lobehub/lobehub), AgentHub delivers the same powerful multi-agent collaboration, knowledge bases, plugin ecosystems, and rich UI — but runs entirely on your hardware with **zero subscription fees**, **complete data privacy**, and **full offline capability**.

No API keys. No cloud lock-in. No data leaving your machine.

**What sets AgentHub apart:** Enterprise-grade features missing from other local platforms — CRDT multi-device sync, workspace isolation, A2A cross-framework agent communities, process-isolated credential vaults, desktop automation, mode-first packaging, and stateful graph orchestration with checkpointing.

---

## ✨ Features

### 🤖 Agent System
| Feature | Description | Local Stack |
|---------|-------------|-------------|
| **Agent Builder** | Create custom agents with roles, system prompts, and tool assignments | Ollama + Custom Runtime |
| **Agent Groups** | Multi-agent collaboration: parallel, sequential, debate, supervisor-executor, GroupChat | Custom Orchestrator |
| **Auto-Manager** | Hierarchical process mode auto-generates manager agent for task delegation | LLM-generated planner + reviewer |
| **Agent Marketplace** | Discover and share community-created agents | GitHub/Git-based Index |
| **White-Box Memory** | Structured, editable long-term memory per agent/user | SQLite + LanceDB |
| **Continual Learning** | Agents adapt from conversation history automatically | Local Embedding + Summarization |

### 🏢 Enterprise Workspaces
| Feature | Description |
|---------|-------------|
| **Workspace Isolation** | Strict silos — each workspace has unique LLMs, embeddings, documents, and access control |
| **CRDT Multi-Device Sync** | Yjs + Electric SQL sync across devices without central server; offline-first, end-to-end encrypted |
| **Mode-First Packaging** | Specialized modes (Coder, People Search, Researcher, Data Analyst) with isolated tools + memory |

### 🧠 AI Models (All Local, All Free)
| Feature | Local Alternative |
|---------|-------------------|
| **General Chat** | Llama 3.3, Qwen 2.5, Mistral Nemo, Gemma 2, Phi-4 |
| **Code Generation** | Qwen 2.5-Coder, DeepSeek Coder, CodeLlama |
| **Reasoning / CoT** | DeepSeek R1, QwQ |
| **Vision / Multimodal** | LLaVA, BakLLaVA, Qwen2-VL |
| **Embeddings** | Nomic Embed, All-MiniLM, MXBAI Embed |
| **Speech-to-Text** | Whisper (faster-whisper / whisper.cpp) |
| **Text-to-Speech** | Piper TTS, Coqui TTS |
| **Image Generation** | Stable Diffusion XL, Flux (via ComfyUI / A1111) |
| **Smart Search** | SearxNG (self-hosted) + DuckDuckGo Lite |

### 🔌 Extensibility & Protocols
| Feature | Implementation |
|---------|----------------|
| **MCP Plugin System** | Native MCP client (stdio + SSE transports). Connect to any MCP server. AgentHub can also BE an MCP server. |
| **A2A Protocol** | Cross-framework agent collaboration. LangGraph ↔ CrewAI ↔ AutoGen ↔ AgentHub. mDNS + HTTP discovery. |
| **Function Calling** | Local tool-use capable models + structured output (JSON mode) |
| **Knowledge Base / RAG** | File upload → chunk → embed (local) → hybrid search (BM25 + vector) |
| **A2UI Standard** | Agents output declarative JSON → client renders interactive forms, tables, charts, wizards |

### 💬 Conversation Experience
| Feature | Description |
|---------|-------------|
| **Branching Conversations** | Tree-like threads — fork from any message (continuation or standalone) |
| **Chain of Thought** | Visualize reasoning steps from thinking models |
| **File Upload** | PDF, DOCX, images, audio, video — extracted and embedded locally |
| **Voice Mode** | Full-duplex voice conversation (STT → LLM → TTS) |
| **Artifacts Support** | Live React components, SVG, interactive HTML, Mermaid diagrams |

### 🔒 Security & Trust
| Feature | Implementation |
|---------|----------------|
| **Process-Isolated Trust Engine** | Credentials stored in separate encrypted vault; LLM never sees API keys |
| **Code Execution Sandbox** | Docker container isolation + Deno subprocess for iterative agent coding |
| **Desktop Automation** | AT-SPI (Linux), AX API (macOS), UI Automation (Windows) for app control |
| **Audit Logging** | Tamper-evident log of every credential use and automation action |


### 🔍 Observability & APM
| Feature | Implementation |
|---------|----------------|
| **Token Tracking** | Per-message, per-session, per-model token consumption with trend lines |
| **Latency Monitoring** | End-to-end trace spans: LLM call, tool execution, RAG retrieval, agent flow steps |
| **Cost Estimation** | Automatic cost calculation for cloud models; $0 tracking for local models |
| **Trace Visualization** | Waterfall view of every request: build prompt → LLM → tools → response |
| **APM Dashboard** | Built-in React dashboard: metrics, model comparison, workflow traces, alerts |
| **Prometheus Export** | `/metrics` endpoint for external Prometheus/Grafana scraping |
| **Alerting** | Configurable rules: high latency, error spikes, queue backlog |
| **OpenTelemetry** | OTLP export for integration with existing observability stacks |

| **OpenTelemetry** | OTLP export for integration with existing observability stacks |
| Feature | Stack |
|---------|-------|
| **Web UI** | Next.js 14 (App Router), React, Tailwind CSS |
| **Desktop App** | Electron wrapper |
| **PWA** | Offline-capable Progressive Web App |
| **Mobile-First** | Responsive, touch-optimized |
| **Custom Themes** | CSS variables + user-defined themes |
| **Auth** | Better Auth (OAuth, email, credentials, MFA) |
| **Database** | SQLite (local-first) — zero config; optional PostgreSQL for server |
| **Vector Store** | LanceDB (embedded) — no separate server |
| **File Storage** | Local filesystem or MinIO (self-hosted S3) |
| **Async Queue** | BullMQ + Redis for long-running agentic flows |
| **Stateful Graphs** | Directed cyclic graphs with checkpointing, pause/resume, human-in-the-loop |

---

## 🏛️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AgentHub UI Layer                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Web App   │  │   Desktop   │  │         PWA             │  │
│  │  (Next.js)  │  │  (Electron) │  │      (Workbox)          │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         └─────────────────┴─────────────────────┘                │
│                              │                                   │
│                   ┌──────────┴──────────┐                       │
│                   │   Zustand Store     │                       │
│                   │  (Sliced State)     │                       │
│                   └──────────┬──────────┘                       │
└──────────────────────────────┼───────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────┐
│                         API / Runtime                            │
│  ┌─────────────┐  ┌─────────┴──────────┐  ┌─────────────────┐   │
│  │  tRPC/REST  │  │   MCP Client       │  │   Auth Layer    │   │
│  │   Routers   │  │ (stdio / SSE)      │  │  (Better Auth)  │   │
│  └──────┬──────┘  └─────────┬──────────┘  └─────────────────┘   │
│         │                   │                                    │
│  ┌──────┴───────────────────┴──────┐  ┌──────────────────────┐  │
│  │      Agent Orchestrator          │  │   Knowledge Engine   │  │
│  │  • Supervisor-Executor           │  │  • Document Parsing  │  │
│  │  • Parallel (Promise.all)        │  │  • Chunking          │  │
│  │  • Sequential (A→B→C)            │  │  • Local Embeddings  │  │
│  │  • Debate (A+B → Judge)          │  │  • Hybrid Search     │  │
│  │  • GroupChat (round-robin)       │  │                      │  │
│  │  • Hierarchical (auto-manager)   │  └──────────────────────┘  │
│  │  • Stateful Graphs (checkpoint)  │                            │
│  └──────────────────────────────────┘  ┌──────────────────────┐  │
│  ┌──────────────────────────────────┐  │   Trust Engine       │  │
│  │       Memory Engine              │  │  • Credential Vault  │  │
│  │  • Structured Facts (JSON)       │  │  • Policy Engine     │  │
│  │  • Preference Vectors            │  │  • Desktop Auto      │  │
│  │  • Editable Memory UI            │  │  • Audit Logging     │  │
│  └──────────────────────────────────┘  └──────────────────────┘  │
│  ┌──────────────────────────────────┐  ┌──────────────────────┐  │
│  │   Mode Runtime Engine            │  │   A2A Gateway        │  │
│  │  • Mode Isolation                │  │  • mDNS Discovery    │  │
│  │  • Tool Filtering                │  │  • Cross-Framework   │  │
│  │  • A2UI Renderer                 │  │  • MCP Bridge        │  │
│  └──────────────────────────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────┐
│           Local AI Infrastructure (Free / Open Source)           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │
│  │   Ollama    │  │  SearxNG    │  │  ComfyUI / A1111        │   │
│  │  (LLMs)     │  │  (Search)   │  │  (Image Generation)     │   │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │
│  │  Piper TTS  │  │  Whisper    │  │  MinIO (optional S3)    │   │
│  │  (Speech)   │  │  (STT)      │  │  (Object Storage)       │   │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────┐
│              Data Layer (Local-First, Zero Config)               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │
│  │   SQLite    │  │  LanceDB    │  │  Yjs / Electric SQL     │   │
│  │ (Primary)   │  │(Vector DB)  │  │  (CRDT Sync)            │   │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │
│  │   Redis     │  │  PostgreSQL │  │  BullMQ Workers         │   │
│  │  (Cache /   │  │  (Multi-User│  │  (Async Jobs)           │   │
│  │   Broker)   │  │   Server)   │  │                         │   │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start (Local-Only Mode)

### Prerequisites
- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) via Corepack
- [Ollama](https://ollama.com/) installed and running
- (Optional) [ComfyUI](https://github.com/comfyanonymous/ComfyUI) for image generation
- (Optional) [SearxNG](https://docs.searxng.org/) for web search

### 1. Clone & Install
```bash
git clone https://github.com/cameron0823/AgentHub.git
cd AgentHub
corepack enable
pnpm install
```

### 2. Pull Recommended Models
```bash
# General-purpose chat (7B, fast, good quality)
ollama pull qwen2.5:7b

# Coding assistant
ollama pull qwen2.5-coder:14b

# Vision
ollama pull llava:13b

# Embeddings
ollama pull nomic-embed-text

# Reasoning
ollama pull deepseek-r1:14b
```

### 3. Configure Environment
```bash
cp .env.example .env.local
# Edit .env.local if needed; all values are optional for local-only mode.
```

### 4. Prepare the Local Database
```bash
pnpm db:generate
pnpm db:push
```

`pnpm db:generate` creates migration files from the Drizzle schema. `pnpm db:push` applies the schema to your local SQLite database when you are ready to create or update runtime data.

### 5. Run
```bash
pnpm dev
# Open http://localhost:3000
```

---

## 🐳 Docker Deployment (Planned Full Stack)

Docker Compose files are not included in the current repository snapshot. Use the local pnpm workflow above until deployment manifests are added.

Expected future full-stack deployment targets include the app, Ollama, SearxNG, ComfyUI, and optional object storage.

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [`REQUIREMENTS_AUDIT.md`](./REQUIREMENTS_AUDIT.md) | Feature coverage audit — verifies all requirements exist in plans |
| [`DESIGN.md`](./DESIGN.md) | Complete system design with 20 feature specification sections |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Technical architecture with 16 component diagrams |
| [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) | 16-week phased execution with acceptance criteria |
| [`RESEARCH.md`](./RESEARCH.md) | Analysis of LobeHub and local AI ecosystem research |

---

## 🗺️ Roadmap

| Phase | Focus | Duration | Key Deliverables |
|-------|-------|----------|-----------------|
| **Phase 1** | Foundation — Local LLM bridge, SQLite schema, basic chat | Weeks 1-4 | Working chat with streaming |
| **Phase 2** | Agent System — Agent builder, groups, orchestration, memory, **workspaces, code sandbox, auto-manager, GroupChat** | Weeks 5-8 | Multi-agent collaboration |
| **Phase 3** | Extensibility — MCP plugins, knowledge base (RAG), file upload, **A2UI, async job queue** | Weeks 9-10 | Plugin ecosystem + RAG |
| **Phase 4** | UI/UX — Artifacts, branching, CoT, PWA, themes, voice, **A2A protocol, trust engine** | Weeks 11-12 | Rich interactive UI + protocols |
| **Phase 5** | Production — Auth, **desktop file agent, mode packaging, stateful graphs, CRDT sync**, Docker, desktop app | Weeks 13-16 | Enterprise-ready platform |

---

## 🤝 Contributing

AgentHub is built for the community. Contributions welcome — whether that's agents, plugins, models, modes, or core features.

---

## 📜 License

MIT License — see [LICENSE](./LICENSE) for details.

---

> **Built with ❤️ for the local AI community.** No cloud required. Enterprise grade.

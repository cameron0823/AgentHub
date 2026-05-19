# AgentHub LobeHub Parity Roadmap

> Created: 2026-05-15
> Source notebook: https://notebooklm.google.com/notebook/520e5e35-8068-421b-88d3-adf3cc6321e3
> Status: Design-first backlog. Root `TODO.md` remains the canonical tracker.
> Executable task plans: `docs/plans/2026-05-15-lobehub-feature-task-plans.md`

## Goal

Use NotebookLM's LobeHub corpus to identify how LobeHub implements each requested capability, compare that against the current AgentHub codebase, and define the missing AgentHub phases/tasks needed to reach the same or a locally optimal implementation.

This roadmap is intentionally scoped as planning work. It does not mark any Phase 33+ work complete.

## Evidence Inputs

NotebookLM was queried in five batches:

- Core AI/model/multimodal features: provider runtime abstraction, provider env configuration, per-agent model defaults, local providers, vision fallback tools, TTS/STT, image generation.
- Agent orchestration/extensibility: AI Agent Builder, remote agent marketplace, group orchestration, heterogeneous Claude/Codex runtime, scheduled runs, MCP, MCP marketplace, skills, built-in tools.
- Knowledge/workspace UI: Memory Agent, RAG, hybrid retrieval, file viewer, artifacts, reasoning visualization, branching, Pages, Projects/Notebooks, desktop/PWA, theming.
- Enterprise/workflow: deployment modes, PostgreSQL/server DB pivot, Better Auth, cloud sandbox, governance, tasks, page history, daily briefs, working panel, review tab.
- Interaction/channels/developer ecosystem: HITL, Agent Signal, inline mentions, file snapshots, prompt refinement, bot channels, governance bridge, tool profiles, SSRF/XSS, public APIs, CLI toolbox, editor kernel, desktop, cloud sync, automated i18n.

AgentHub was inspected locally with targeted searches and file reads across:

- `packages/ai-providers/src/registry.ts`
- `packages/agent-runtime/src/**`
- `apps/web/src/server/db/schema.ts`
- `apps/web/src/app/api/chat/stream/route.ts`
- `apps/web/src/server/routers/**`
- `apps/web/src/components/**`
- `tests/**`
- `README.md`, `TODO.md`, `docs/IMPLEMENTATION_PLANS.md`, `docker-compose.yml`

## Current Parity Map

| Feature                                         | LobeHub implementation from NotebookLM                                                                                            | Current AgentHub state                                                                                                                                                                                                                                          | Phase/task                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Massive multi-model provider support            | Unified `@lobechat/model-runtime`, 70+ providers, provider envs, OpenAI/Anthropic-compatible factories.                           | Partial: registry supports local providers plus OpenAI, Anthropic, Gemini, Moonshot, GitHub Copilot. No broad 70+ catalog or aggregator layer.                                                                                                                  | P33.1                                                   |
| Dynamic model switching and intelligent routing | Mid-chat switching, per-agent defaults, aggregators such as NewAPI/AIHubMix, cost/speed routing.                                  | Partial: per-session model selector and per-agent model field exist; no routing policies, cost metadata, fallback chains, or aggregators.                                                                                                                       | P33.2                                                   |
| Local LLM integration                           | Ollama, LM Studio, vLLM local endpoints for offline/private use.                                                                  | Covered foundation: Ollama, LM Studio, and vLLM are registered local providers.                                                                                                                                                                                 | No new parity task; preserve with P33 regression tests. |
| Vision and image understanding                  | Image/video upload, OCR-style analysis, fallback visual-understanding tool, SSRF checks for media conversion.                     | Partial: image content parts, provider mappings, model fallback visual tool, OCR-oriented tool mode, media SSRF checks, and image analysis upload affordance exist. Video flow remains.                                                                         | P34.1                                                   |
| Voice conversations                             | Provider-backed TTS/STT through `@lobehub/tts`, per-agent voices, audio cache, playback controls.                                 | Covered foundation: OpenAI Audio TTS/STT, Microsoft/Edge browser speech preference, browser fallback, per-agent voice settings, cached playback, speed/seek/download controls, and hands-free replay.                                                           | P34.2                                                   |
| Text-to-image generation                        | Runtime `createImage`, DALL-E/Flux/SDXL/fal.ai/Midjourney plugins, rendered and archived resources.                               | Covered foundation: provider `createImage` contract, OpenAI Images/OpenAI-compatible adapter path, `generate_image` runtime tool, persisted resources, and chat rendering. Dedicated fal.ai/ComfyUI/Midjourney bridges remain future provider-plugin expansion. | P34.3                                                   |
| Agent Builder                                   | AI-powered `lobe-agent-builder` config assistant that sets identity, model, tools, and prompt from natural language.              | Partial: manual Agent Builder form exists. No meta-agent assistant.                                                                                                                                                                                             | P35.1                                                   |
| Agent Marketplace                               | Remote/community agent index, publish/fork/version, multilingual agent listings.                                                  | Partial: local bundled marketplace/import/export only.                                                                                                                                                                                                          | P35.2                                                   |
| Agent groups and multi-agent collaboration      | Supervisor-executor, sequential, parallel, iterative, debate modes.                                                               | Partial: sequential, parallel, supervisor, debate, groupchat exist. Iterative mode and Lobe-style plan/execute semantics are missing.                                                                                                                           | P36.1                                                   |
| Heterogeneous agent runtime                     | Desktop/server mounting of Claude Code, Codex, and other CLI agents inside chat, persistent sessions, unified output.             | Missing. A2A delegate exists but does not mount CLI agents.                                                                                                                                                                                                     | P36.2                                                   |
| Scheduled agent runs                            | Server-side cron with timezone, max executions, run history as conversations, notifications.                                      | Partial: cron automations and BullMQ run history exist. Missing timezone/max execution policies, conversation creation semantics, and notification hooks.                                                                                                       | P36.4                                                   |
| MCP core                                        | JSON-RPC MCP over STDIO, streamable HTTP, and SSE/cloud modes with runtime tool discovery.                                        | Partial: stdio/http MCP client, DB settings, discovery/test, and chat tool injection exist. Streamable HTTP/SSE mode and config import/export need parity hardening.                                                                                            | P37.1                                                   |
| MCP marketplace and one-click install           | Marketplace with dependency checks, install prompts, desktop one-click STDIO install.                                             | Missing.                                                                                                                                                                                                                                                        | P37.2                                                   |
| Skills marketplace                              | First-class `skill.md`/manifest/resources/scripts packages, skill store, `runSkill`, `readReference`, `execScript`, `exportFile`. | Missing inside AgentHub product. Local Codex skills are separate from AgentHub runtime.                                                                                                                                                                         | P35.3                                                   |
| Built-in core tools                             | Web search, calculator, cloud sandbox, local system, GitHub/repo tools, tools manager.                                            | Partial: calculator/date/read_file/web_search/execute_code exist. No native GitHub repo interaction tool, tools manager, file-producing sandbox UX, or first-class local system desktop tool.                                                                   | P37.4                                                   |
| Personal white-box memory                       | Dedicated Memory Agent extracts, categorizes, maintains, edits, scopes shared vs agent-specific memory.                           | Partial: white-box memory table/UI/extraction/semantic search exists. No dedicated maintenance agent, conflict detection, decay, or shared-vs-agent-specific controls beyond agentId.                                                                           | P38.1                                                   |
| RAG                                             | Upload diverse files, chunk/embed, pgvector; also Qdrant/Milvus support.                                                          | Partial: PostgreSQL/pgvector KB, chunks, hybrid search. File parsers and alternate vector stores are incomplete.                                                                                                                                                | P38.2                                                   |
| Hybrid search                                   | Vector plus BM25 lexical search, RRF/reranking, PostgreSQL 17 `pg_search`/ICU.                                                    | Partial: pgvector plus Postgres full-text and RRF, optional Ollama rerank. No BM25 `pg_search`/ICU path.                                                                                                                                                        | P38.3                                                   |
| In-chat file viewer                             | Viewer pane for code, office docs, images, PDFs, citations with page/chunk navigation.                                            | Missing; attachments and KB lists exist but no full viewer.                                                                                                                                                                                                     | P38.4                                                   |
| Artifacts rendering                             | Dedicated preview/code panel for HTML/CSS/React/SVG in sandboxed iframe.                                                          | Missing as UI despite `messages.artifacts` schema field.                                                                                                                                                                                                        | P39.1                                                   |
| Chain-of-thought visualization                  | Streaming "Thinking" UI with expandable sequential reasoning/tool decision display.                                               | Partial: reasoning field/details exist. No step timeline, duration, or runtime instruction visualization.                                                                                                                                                       | P39.2                                                   |
| Branching conversations                         | Fork from any message with Continuation or Standalone mode and branch navigation.                                                 | Partial: fork and branch navigator exist. Standalone mode semantics are missing.                                                                                                                                                                                | P39.3                                                   |
| Pages                                           | Collaborative rich document editor with Page Agent Copilot and version support.                                                   | Missing.                                                                                                                                                                                                                                                        | P40.1                                                   |
| Projects and Notebooks                          | Project containers for agents/chats/pages/KB/tasks; notebook side panel for topic documents.                                      | Missing.                                                                                                                                                                                                                                                        | P40.2                                                   |
| Multi-platform PWA/Desktop                      | PWA plus Electron desktop with IPC, local filesystem, keychain/tray/window state.                                                 | Partial: PWA exists. Electron desktop is missing.                                                                                                                                                                                                               | P42.3                                                   |
| Custom theming                                  | Algorithmic design system, light/dark, custom colors, chat bubble vs document layouts.                                            | Partial: light/dark/system theme exists. No palette builder or layout mode switch.                                                                                                                                                                              | P39.4                                                   |
| Multi-deployment architecture                   | Vercel/Zeabur/Sealos plus Docker Compose full stack with database/cache/object storage.                                           | Partial: Docker Compose exists; README still contains stale planned-deployment language and no one-click platform templates.                                                                                                                                    | P41.1                                                   |
| Database flexibility                            | NotebookLM says legacy IndexedDB/CRDT existed, while LobeHub 2.0 pivots to server PostgreSQL.                                     | Partial: PostgreSQL server mode only. No optional local-first sync mode.                                                                                                                                                                                        | P41.2                                                   |
| Advanced authentication                         | Better Auth with email/password, magic links, SSO/OIDC, allowlists, SSO-only.                                                     | Partial/mismatch: AgentHub uses NextAuth/Casdoor/dev credentials plus role field. README claims Better Auth, but code does not.                                                                                                                                 | P41.3                                                   |
| Cloud sandbox                                   | Cloud/server isolated Python/JS/TS execution with temporary files and downloadable outputs.                                       | Partial: local Docker sandbox with network/memory limits exists. No cloud execution provider or artifact/file export flow.                                                                                                                                      | P37.5                                                   |
| Data sovereignty and governance                 | Encrypted key vaults, proxy/env controls, SSRF controls, MCP Governance Bridge.                                                   | Partial: encrypted credentials/trust policies/audit log exist. No centralized governance proxy or full policy layers.                                                                                                                                           | P37.6                                                   |
| Agent Tasks                                     | Linear/Jira-style tasks, subtasks, dependency order, parent fan-out, comments, status progression.                                | Partial: tasks table/router/worker/dependencies exist. Missing comments, templates, parent fan-out UX, and Lobe-style status vocabulary.                                                                                                                        | P36.5                                                   |
| Page edit history                               | Notion-style page timeline, compare, restore, retention.                                                                          | Missing because Pages are missing.                                                                                                                                                                                                                              | P40.3                                                   |
| Daily Brief                                     | Homepage summary across agents, powered by Agent Signal/self-review.                                                              | Missing.                                                                                                                                                                                                                                                        | P40.4                                                   |
| Agent Working Panel                             | Collapsible right-side document/task panel alongside conversation.                                                                | Missing.                                                                                                                                                                                                                                                        | P40.5                                                   |
| Review Tab                                      | Fast repo-wide git diff aggregation for code review.                                                                              | Missing.                                                                                                                                                                                                                                                        | P36.6                                                   |
| HITL approvals                                  | Runtime can pause for sensitive actions; unified UI plus headless CLI approval.                                                   | Partial: supervisor/debate checkpoints and UI approval exist. No generic tool-action policy approvals or headless CLI path.                                                                                                                                     | P36.7                                                   |
| Nightly self-review                             | Agent Signal pipeline runs skill-aware self-review and briefs.                                                                    | Missing.                                                                                                                                                                                                                                                        | P40.6                                                   |
| Inline agent mentioning                         | `lobeAgents` Markdown tags render clickable profile cards and invoke agents inline.                                               | Missing.                                                                                                                                                                                                                                                        | P39.5                                                   |
| Local file mention snapshots                    | Drag file into chat, capture snapshot for model reasoning.                                                                        | Partial: file attachments exist. No immutable local snapshot metadata, inline mention syntax, or desktop local file resolver.                                                                                                                                   | P39.6                                                   |
| Inline prompt refinement                        | Rewrite/translate prompts directly in chat input before sending.                                                                  | Missing.                                                                                                                                                                                                                                                        | P39.7                                                   |
| Messaging app deployments                       | Agents deploy to Discord/Slack/Telegram/Line/Messenger/WhatsApp with slash commands, DM policies, tool gating.                    | Missing.                                                                                                                                                                                                                                                        | P42.1                                                   |
| MCP Governance Bridge                           | Central proxy with monitoring, rate limits, policy layers, audit dashboard.                                                       | Missing as a bridge; trust engine is local policy storage only.                                                                                                                                                                                                 | P37.6                                                   |
| Tool profiles and tiered allow/deny             | Role-based profiles such as minimal/coding/messaging/full with restrictive allow/deny lists.                                      | Partial: agent tool list and trust `allowedTools` exist. No profile selection, deny rules, or context-pruning tool exposure.                                                                                                                                    | P37.7                                                   |
| SSRF and XSS protection                         | SSRF checks for media/crawling/proxy requests plus HTML/artifact sanitization.                                                    | Partial: targeted URL validation and safe markdown defaults exist. No centralized outbound request policy or artifact HTML sanitizer because artifacts are missing.                                                                                             | P37.8                                                   |
| Public API interfaces                           | REST APIs plus WebSocket Agent Gateway for real-time integrations.                                                                | Partial: OpenAI-compatible `/api/v1/chat/completions`, A2A, import/export exist. No complete REST surface or WebSocket gateway.                                                                                                                                 | P42.2                                                   |
| LobeHub CLI toolbox                             | AI commit/i18n/label CLIs and supporting terminal UI packages.                                                                    | Missing.                                                                                                                                                                                                                                                        | P43.1                                                   |
| Standalone CLI agent execution                  | `lh hetero exec` for Claude/Codex-style agents with multimodal input.                                                             | Missing.                                                                                                                                                                                                                                                        | P36.3                                                   |
| AIGC UI component libraries                     | Reusable AI chat UI, icons, TTS packages.                                                                                         | Missing as exported packages; AgentHub has app-local components only.                                                                                                                                                                                           | P43.2                                                   |
| Editor kernel                                   | Lexical-based editor kernel with React plugins and AI autocomplete.                                                               | Missing.                                                                                                                                                                                                                                                        | P43.3                                                   |
| Progressive Web App                             | Manifest, service worker, responsive installable app.                                                                             | Covered foundation: manifest/service worker/tests exist.                                                                                                                                                                                                        | No new parity task; preserve with P42 regression tests. |
| Desktop-native deep integrations                | Electron IPC, filesystem access, tray, keychain, window persistence, global commands.                                             | Missing.                                                                                                                                                                                                                                                        | P42.3                                                   |
| Cloud sync local-first                          | YJS/WebRTC local-first sync. NotebookLM notes this is legacy/experimental.                                                        | Missing.                                                                                                                                                                                                                                                        | P41.2                                                   |
| Automated i18n                                  | Automated ChatGPT/lobe-i18n pipeline, dynamic loading, direction control.                                                         | Partial: next-intl with en/es/fr exists. No automated translation/update pipeline or RTL direction support.                                                                                                                                                     | P43.4                                                   |

## Implementation Phases

### Phase 33 - Provider Catalog and Routing Parity

- [x] P33.1 Expand provider architecture from fixed adapters to a catalog-driven provider layer.
  - Add OpenAI-compatible provider factory entries for Azure OpenAI, AWS Bedrock, OpenRouter, Together AI, Groq, Fireworks, DeepSeek, Qwen, Zhipu, Hugging Face, xAI, Perplexity, Vercel AI Gateway, NewAPI, AIHubMix, and other high-value LobeHub-equivalent providers.
  - Store provider capability metadata: chat, vision, tool calling, embeddings, image generation, TTS, STT, local/cloud, region, pricing hints, auth type.
  - Add provider enable/disable flags and custom model list overrides.
  - Acceptance: provider catalog UI can enable a new OpenAI-compatible provider without code changes; `pnpm typecheck`, `pnpm test`, and provider-router tests pass.
- [x] P33.2 Add intelligent routing policies.
  - Support per-agent route strategy: fixed, speed-first, cost-first, reasoning-first, local-first, fallback-chain.
  - Add fallback provider chain on provider errors/rate limits.
  - Surface route decision metadata in chat message diagnostics.
  - Acceptance: tests prove route selection, fallback, and per-agent defaults.
- [x] P33.3 Preserve local LLM parity.
  - Add regression tests for Ollama, LM Studio, and vLLM model discovery and offline provider resolution.
  - Acceptance: local providers remain available with no cloud keys.

### Phase 34 - Multimodal Runtime

- [x] P34.1 Implement LobeHub-style vision fallback and media safety.
  - Add `visual_understanding` built-in tool for images and screenshots when the selected model has tool use but no native vision.
  - Add OCR-oriented prompt presets and optional video keyframe extraction.
  - Centralize media URL SSRF checks before base64/media conversion.
  - Acceptance: image input works with native vision and non-vision models through fallback.
- [x] P34.2 Replace browser-only voice with provider-backed voice conversations.
  - Add TTS/STT provider abstraction for OpenAI Audio, Microsoft Edge Speech, and local/browser fallback.
  - Add per-agent voice settings, audio cache, playback speed/seek/download controls, and hands-free mode.
  - Acceptance: user can speak a prompt, review transcript, send, and hear the response with cached replay.
- [x] P34.3 Add text-to-image generation.
  - Extend provider capability model with `createImage`.
  - Add DALL-E/OpenAI Images and OpenAI-compatible image adapter path; defer unverified provider-specific fal.ai, ComfyUI, and Midjourney bridges to the provider-plugin expansion.
  - Store generated images as resources and render them in chat/artifacts.
  - Acceptance: image generation creates an in-chat result and persisted resource.

### Phase 35 - Agent, MCP, and Skills Marketplaces

- [x] P35.1 Convert Agent Builder into an AI configuration assistant.
  - Add an internal builder agent that reads current agent config, available models/tools, and requested intent.
  - Apply changes in identity -> model/tools -> prompt order.
  - Show a review diff before applying config mutations.
  - Acceptance: natural language request creates or revises an agent with model, tools, prompt, opening questions, and KB linkage.
- [x] P35.2 Upgrade marketplace from local catalog to remote/community index.
  - Add remote index configuration, cache, search, categories, install/fork/update, version metadata, license/author fields, and safe import validation.
  - Keep local bundled manifests as offline fallback.
  - Acceptance: a remote marketplace item can be browsed, previewed, installed, forked, and exported.
- [x] P35.3 Add Skills marketplace and runtime.
  - Define AgentHub skill package schema: `SKILL.md`, manifest, references, scripts, templates, permissions.
  - Add skill store, install/update/delete UI, and runtime built-in operations: `runSkill`, `readReference`, `execScript`, `exportFile`.
  - Execute scripts only through sandbox/governance policies.
  - Acceptance: installed skill can be activated in chat and can read bundled references without exposing unrelated files.

### Phase 36 - Agent Runtime, Tasks, Heterogeneous CLI, and Review

- [x] P36.1 Add iterative orchestration mode.
  - Implement author/editor/reviser loop with max-iteration controls and HITL checkpoints.
  - Add UI pattern visualization and tests.
  - Acceptance: group can run sequential, parallel, supervisor, iterative, debate, and groupchat.
- [x] P36.2 Implement heterogeneous agent runtime.
  - Add CLI agent definitions for Claude Code, Codex, and generic executables.
  - Manage process lifecycle, working directory, environment, file permissions, streaming output, and persistent session state.
  - Connect outputs into existing chat/session/message model.
  - Acceptance: a configured CLI agent can be invoked from chat and produces streamed output without shell injection risk.
- [x] P36.3 Add standalone CLI execution.
  - Add `agenthub hetero exec` for running a configured heterogeneous agent from terminal with text and file inputs.
  - Support headless HITL prompts and approval/rejection.
  - Acceptance: CLI run persists a session and can be resumed in the web UI.
- [x] P36.4 Harden scheduled runs.
  - Add timezone, max executions, pause/resume, notification hooks, and run-created conversation labels.
  - Add schedule validation UI beyond raw cron.
  - Acceptance: scheduled run creates a traceable conversation and respects timezone/max-run limits.
- [x] P36.5 Upgrade Agent Tasks to Lobe-style task management.
  - Add comments, templates, parent/child task fan-out, task reassignment, filters, pagination, and status mapping `todo -> in progress -> done`.
  - Preserve dependency order and BullMQ retries.
  - Acceptance: parent task fans out subtasks and comments capture agent/human coordination.
- [x] P36.6 Add Review Tab.
  - Add git repository registration, diff aggregation, file tree, hunks, filters, and large-repo virtualization.
  - Gate local git access behind desktop/heterogeneous permissions or a server-side repo mount.
  - Acceptance: user can review bulk diffs across a repo tree from one tab.
- [x] P36.7 Generalize HITL approvals.
  - Move from group-checkpoint-only approvals to tool/action-level policy approvals.
  - Add approval persistence, timeout policy, headless CLI support, and audit log integration.
  - Acceptance: sensitive tool call pauses in UI and CLI before execution.

### Phase 37 - MCP, Built-In Tools, Sandbox, and Governance

- [x] P37.1 Complete MCP transport parity.
  - Add streamable HTTP/SSE support, config import/export, server health monitoring, and tool schema diffing.
  - Acceptance: stdio, HTTP, and streamable/SSE servers can be configured and invoked.
- [x] P37.2 Add MCP marketplace and one-click install.
  - Add marketplace browse/search, install preflight, dependency checks, permission prompts, and config templating.
  - For web/server mode, generate manual install instructions when desktop STDIO is not available.
  - Acceptance: marketplace item installs into MCP settings and exposes tools.
- [x] P37.4 Expand built-in tools.
  - Add GitHub repository interaction, tools manager UI, browser/web-fetch governance, and local system desktop-only tool surface.
  - Acceptance: GitHub MCP/native tool can inspect repos/issues/PRs under explicit credentials.
- [x] P37.5 Upgrade sandbox from local Docker execution to cloud/server sandbox workflows.
  - Add sandbox session storage, output file export/download, common Python/JS/TS libraries, and chart/document generation.
  - Keep local Docker mode for offline use.
  - Acceptance: executed code can return downloadable files and rendered charts.
- [x] P37.6 Implement MCP Governance Bridge.
  - Add central proxy service for MCP requests with per-server policies, rate limits, time windows, pattern blocking, audit logs, and dashboard.
  - Integrate with existing trust credentials and audit log tables where possible.
  - Acceptance: denied MCP tool call is blocked before target server and logged with policy reason.
- [x] P37.7 Add tool profiles and deny lists.
  - Define profiles: minimal, research, coding, messaging, admin, full.
  - Compile per-agent allowed/denied tools into the runtime prompt/tool list to reduce token bloat.
  - Acceptance: selecting a profile changes exposed tools and denies blocked calls.
- [x] P37.8 Centralize SSRF/XSS protection.
  - Add outbound request guard for media conversion, web crawling, proxy requests, and provider base URLs.
  - Add artifact HTML sanitizer and iframe sandbox policy before enabling artifacts.
  - Acceptance: tests cover private-IP block, allowed endpoint override, unsafe HTML stripping, and artifact sandboxing.

### Phase 38 - Knowledge and Memory

- [x] P38.1 Add Memory Agent maintenance.
  - Add background memory review for conflict detection, stale-memory suggestions, category normalization, and relevance decay.
  - Add shared vs agent-specific memory controls in UI.
  - Acceptance: memory review proposes edits/deletions without silently mutating accepted memories.
- [x] P38.2 Extend RAG ingestion and vector backends.
  - Add parsers for PDF, DOCX, CSV/XLSX, audio transcript, video transcript/keyframes, code, and markdown.
  - Add optional Qdrant/Milvus vector store adapters behind config.
  - Acceptance: each supported file type indexes and returns cited chunks.
- [x] P38.3 Upgrade hybrid search relevance.
  - Add BM25-style search path using `pg_search` or a compatible PostgreSQL fallback, ICU/tokenizer support, and reranking metrics.
  - Acceptance: exact-keyword and semantic queries both retrieve expected chunks.
- [x] P38.4 Build in-chat file viewer.
  - Add PDF page viewer, syntax-highlighted code viewer, image gallery, Office previews or extracted-text previews, and citation jump links.
  - Acceptance: clicking a citation opens the viewer at the cited chunk/page.

### Phase 39 - Chat UX and Interaction Controls

- [x] P39.1 Add artifacts panel.
  - Detect artifact blocks, store artifact metadata, render HTML/CSS/SVG/React in a sandboxed preview panel, and provide code/preview modes.
  - Acceptance: generated artifact previews safely beside chat and persists with message history.
- [x] P39.2 Improve reasoning visualization.
  - Convert raw reasoning text into a streaming step timeline with duration, tool decisions, and collapse controls.
  - Respect model/provider policies for hidden reasoning.
  - Acceptance: supported models show a non-misleading "thinking" timeline without exposing unavailable private reasoning.
- [x] P39.3 Complete branching modes.
  - Add Continuation vs Standalone fork modes and branch tree navigation.
  - Acceptance: standalone fork starts fresh from selected message while continuation preserves prior context.
- [x] P39.4 Add custom theme system.
  - Add accent palette selection, theme token persistence, document-style vs chat-bubble layout toggle, and system sync.
  - Acceptance: theme settings persist and apply across reloads without hydration mismatch.
- [x] P39.5 Add inline agent mentions.
  - Define `lobeAgents`-compatible Markdown/tag syntax or AgentHub equivalent.
  - Render clickable agent profile cards and route mentioned-agent execution into the current context.
  - Acceptance: typing an agent mention inserts a card and invokes the agent.
- [x] P39.6 Add local file mention snapshots.
  - Store immutable snapshot metadata/content pointer at drag time.
  - Support inline file mention chips and desktop local file resolver once desktop exists.
  - Acceptance: model reasons over the captured version even if source file changes later.
- [x] P39.7 Add inline prompt refinement.
  - Add rewrite, translate, shorten, expand, and media-prompt optimize actions in chat input.
  - Acceptance: prompt can be refined in place before sending without creating a chat message.

### Phase 40 - Pages, Projects, Briefs, and Working Documents

- [x] P40.1 Build Pages and editor kernel foundation.
  - Add Lexical-based rich text editor, page schema, page-agent copilot, comments/selection actions, markdown import/export.
  - Acceptance: user and agent can co-edit a page from chat context.
- [x] P40.2 Add Projects and Notebooks.
  - Add project containers linking agents, chats, pages, KBs, tasks, schedules, and resources.
  - Add topic-level notebook side panel with agent-readable documents.
  - Acceptance: project scope filters chats/agents/KB/tasks and notebook docs are retrievable in chat.
- [x] P40.3 Add page edit history.
  - Store versions, diffs, source attribution, retention policy, compare, and restore.
  - Acceptance: user can browse and restore a previous page version.
- [x] P40.4 Add Daily Brief.
  - Generate homepage brief from recent agent tasks, automations, memory changes, alerts, and scheduled summaries.
  - Acceptance: brief is generated on schedule and manually refreshable.
- [x] P40.5 Add Agent Working Panel.
  - Add right-side panel for active documents, task progress, run logs, citations, and document history.
  - Acceptance: panel can open beside chat without disrupting current conversation.
- [x] P40.6 Add nightly self-review.
  - Add Agent Signal pipeline with skill/tool-aware self-review policies and brief integration.
  - Acceptance: nightly run produces review items and links them to affected agents/tasks.

### Phase 41 - Enterprise Platform, Auth, Deploy, and Data

- [x] P41.1 Complete deployment templates and docs.
  - Align README with actual stack.
  - Add Vercel/Zeabur/Sealos templates and production Docker Compose docs covering app, Postgres/pgvector, Redis, MinIO/RustFS, SearXNG, workers, backup/restore.
  - Acceptance: fresh deploy guide can bring up a full stack and pass health checks.
- [x] P41.2 Decide and implement local-first sync strategy.
  - Because NotebookLM indicates LobeHub 2.0 is server-centric, decide whether AgentHub should implement the user-requested IndexedDB/YJS/WebRTC mode or document PostgreSQL-only parity.
  - If implemented, add IndexedDB/YJS sync behind an explicit experimental flag.
  - Acceptance: decision record exists; if built, sync conflict tests pass.
- [x] P41.3 Migrate or reconcile auth.
  - Either migrate to Better Auth with email/password, magic links, OIDC/SSO, allowlists, and SSO-only mode, or update docs to accurately state NextAuth/Casdoor.
  - Acceptance: auth docs match code and multi-user role tests pass.

### Phase 42 - Channels, Desktop, Sync, and Public APIs

- [x] P42.1 Add messaging app channel deployments.
  - Start with Discord and Slack, then Telegram, Line, Messenger, WhatsApp.
  - Add slash commands, DM pairing policy, per-sender tool gating, channel secrets, and message audit logs.
  - Acceptance: an AgentHub agent responds in one external channel under scoped permissions.
- [x] P42.2 Expand public API surface.
  - Add REST endpoints for agents, sessions, tasks, KB, files, tools, projects, and webhooks.
  - Add WebSocket Agent Gateway for low-latency streaming, keeping SSE fallback.
  - Acceptance: API keys can access documented REST/WebSocket flows with user isolation.
- [x] P42.3 Build desktop app.
  - Add Electron workspace with IPC, secure local file access, MCP STDIO support, keychain integration, window state persistence, tray/global command menu, and one-click CLI install.
  - Acceptance: desktop app can run chat, configure STDIO MCP, capture local files, and preserve window state.
- [x] P42.4 Preserve PWA parity.
  - Add regression tests for manifest, service worker, installability, offline shell, and responsive layout.
  - Acceptance: PWA tests continue passing after desktop/API changes.

### Phase 43 - Developer Ecosystem and Automated i18n

- [x] P43.1 Add AgentHub CLI toolbox.
  - Implement `agenthub commit`, `agenthub i18n`, and `agenthub label` or document why external equivalents are preferred.
  - Acceptance: CLI package has tests and can run from repo root.
- [x] P43.2 Extract AIGC UI component packages.
  - Move stable chat, model selector, provider icons, artifacts, TTS/voice controls, and markdown components into reusable package(s).
  - Acceptance: app imports components from the package and package builds independently.
- [x] P43.3 Formalize editor kernel package.
  - Build on P40.1 to expose framework-neutral editor primitives and React bindings.
  - Acceptance: Pages and chat input consume the shared editor package.
- [x] P43.4 Automate i18n.
  - Add translation update CLI, namespace organization, missing-key checks, browser language detection, dynamic bundle loading, and RTL direction support.
  - Acceptance: CI fails on missing translation keys and automated update produces reviewed diffs.

## Ordered Verification for Each Phase

Use the repo's existing commands discovered from `package.json` and `TODO.md`:

```bash
pnpm typecheck
pnpm test
pnpm -C apps/web test:e2e
```

Additional phase-specific verification:

- Provider/routing phases: add mocked provider registry tests and one browser path through Provider Settings and Model Selector.
- Multimodal phases: browser test upload, voice input/output, generated image rendering, and SSRF blocked media URL.
- Marketplace/skills/MCP phases: import/install through UI, invoke from chat, then verify permissions/audit logs.
- Heterogeneous/desktop phases: process lifecycle tests, shell-injection tests, file permission tests, and desktop smoke test.
- Pages/projects phases: Playwright coverage for create/edit/version/restore and project scoping.
- Channels/API phases: webhook/API integration tests with scoped API keys and channel-specific tool gating.

## Done When

- Every non-covered feature in the parity map has an implemented phase task and targeted tests.
- `pnpm typecheck`, `pnpm test`, and relevant `pnpm -C apps/web test:e2e` suites pass.
- Browser automation exercises each user-facing UI feature added in that phase.
- Security-sensitive work has tests for user isolation, permission enforcement, SSRF/XSS/tool injection, and audit logging.
- `TODO.md` is updated to move completed phase tasks out of backlog only after verified implementation.

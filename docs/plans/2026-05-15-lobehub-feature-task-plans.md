# LobeHub Feature Task Plans Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.
> **Status:** Archived plan pack. Root `TODO.md` is the canonical current tracker and completion source.

**Goal:** Turn every Phase 33-43 LobeHub parity backlog item into an executable AgentHub implementation task.

**Architecture:** Keep AgentHub as a modular monolith unless a feature already belongs in a reusable workspace package. Provider/runtime/tool capabilities should live in `packages/*`; authenticated data, workers, and product UI should remain in `apps/web/src/server`, `apps/web/src/app`, and `apps/web/src/components`. Cross-cutting safety work such as SSRF, XSS, tool policy, and audit logging must be implemented before UI features that depend on it.

**Tech Stack:** Next.js 15, React 18, tRPC, Drizzle/PostgreSQL/pgvector, BullMQ/Redis, Playwright, Node test runner, TypeScript, pnpm/turbo.

---

## How To Execute This Plan Pack

Execute in phase order unless a task is explicitly marked as a dependency. For each task:

1. Write the failing source or behavior test first.
2. Run the narrow test and confirm it fails for the expected reason.
3. Implement the smallest durable slice.
4. Add or update browser automation for user-facing UI.
5. Run the task's narrow command, then `pnpm typecheck`, `pnpm test`, and relevant `pnpm -C apps/web test:e2e` specs.
6. Commit the task separately with the suggested commit message.

Global commands:

```bash
pnpm typecheck
pnpm test
pnpm -C apps/web test:e2e
git diff --check
```

## Architecture Decision Gates

- Provider expansion stays catalog-driven: do not add another fixed-provider `switch` without a catalog entry and capability metadata.
- User isolation is mandatory for every DB-backed feature: every query and mutation must scope by `ctx.user.id` or API-key user ID.
- Desktop/local-file/CLI features must remain disabled in web-only mode until Electron permissions exist.
- Artifacts and file viewers must wait for centralized SSRF/XSS controls from P37.8.
- Pages history, notebooks, editor kernel, and reusable UI packages should reuse the same document model rather than inventing parallel document stores.
- The LobeHub 2.0 NotebookLM evidence says server PostgreSQL is the current primary architecture; local-first sync must be an explicit opt-in decision, not an accidental fork of persistence.

## Phase 33 - Provider Catalog and Routing Parity

### Task P33.1: Catalog-Driven Provider Layer

**Files:**

- Create: `packages/ai-providers/src/catalog.ts`
- Create: `packages/ai-providers/src/factories.ts`
- Modify: `packages/ai-providers/src/types.ts`
- Modify: `packages/ai-providers/src/registry.ts`
- Modify: `apps/web/src/server/routers/providers.ts`
- Modify: `apps/web/src/components/ProviderSettings.tsx`
- Test: `tests/provider-catalog.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/provider-catalog.spec.ts`

**Steps:**

1. Write `tests/provider-catalog.test.mjs` asserting catalog entries exist for OpenAI, Anthropic, Gemini, Moonshot, Copilot, Ollama, LM Studio, vLLM, OpenRouter, Together, Groq, Fireworks, DeepSeek, Qwen, Zhipu, Hugging Face, xAI, Perplexity, Vercel AI Gateway, NewAPI, and AIHubMix.
2. Run `pnpm test -- provider-catalog.test.mjs`; expect FAIL because `catalog.ts` is missing.
3. Add provider capability types: `chat`, `vision`, `toolCalling`, `embeddings`, `imageGeneration`, `tts`, `stt`, `local`, `cloud`, `authType`, `baseUrlMode`, `modelListMode`.
4. Implement `createProviderFromCatalogCredential()` using the existing OpenAI-compatible provider for compatible services and existing native adapters where present.
5. Replace hard-coded UI provider cards with catalog data while preserving existing credential rows.
6. Add Playwright coverage for enabling one catalog provider and seeing its model namespace in `ModelSelector`.
7. Run `pnpm typecheck`, `pnpm test`, and `pnpm -C apps/web test:e2e -- apps/web/tests/e2e/specs/phase-h/provider-catalog.spec.ts`.
8. Commit: `feat: add catalog-driven provider registry`.

### Task P33.2: Intelligent Routing Policies

**Files:**

- Create: `packages/ai-providers/src/routing.ts`
- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/drizzle/0006_model_routing.sql`
- Modify: `apps/web/src/server/routers/agents.ts`
- Modify: `apps/web/src/app/api/chat/stream/route.ts`
- Modify: `apps/web/src/components/AgentBuilder.tsx`
- Modify: `apps/web/src/components/ChatMessage.tsx`
- Test: `tests/provider-routing.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/model-routing.spec.ts`

**Steps:**

1. Write failing tests for fixed, local-first, speed-first, cost-first, reasoning-first, and fallback-chain route selection.
2. Add schema fields for agent route strategy and fallback model list.
3. Implement `resolveRoute({ agent, requestedModel, providerHealth, policy })`.
4. Wire route resolution into chat stream before `AgentRuntime` creation.
5. Persist route decision metadata on assistant messages.
6. Add UI controls in Agent Builder and display route diagnostics in ChatMessage.
7. Run `pnpm test -- provider-routing.test.mjs`, `pnpm typecheck`, and routing E2E.
8. Commit: `feat: add model routing policies`.

### Task P33.3: Local Provider Regression Coverage

**Files:**

- Modify: `tests/repository.test.mjs`
- Modify: `packages/agent-runtime/tests/runtime.test.ts`
- Browser: `apps/web/tests/e2e/specs/phase-h/local-providers.spec.ts`

**Steps:**

1. Add tests proving Ollama, LM Studio, and vLLM remain registered without cloud credentials.
2. Add runtime tests proving unqualified model IDs still fall back to Ollama.
3. Add E2E coverage for local providers appearing in Provider Settings/Model Selector.
4. Run `pnpm test -- repository.test.mjs`, `pnpm -C packages/agent-runtime test`, and local-provider E2E.
5. Commit: `test: preserve local provider behavior`.

## Phase 34 - Multimodal Runtime

### Task P34.1: Vision Fallback and Media Safety

**Files:**

- Create: `packages/agent-runtime/src/tools/builtin/visual-understanding.ts`
- Modify: `packages/agent-runtime/src/tools/registry.ts`
- Create: `apps/web/src/server/media-safety.ts`
- Modify: `apps/web/src/app/api/chat/stream/route.ts`
- Modify: `apps/web/src/components/ChatInput.tsx`
- Modify: `apps/web/src/components/ChatMessage.tsx`
- Test: `tests/vision-fallback.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/vision-fallback.spec.ts`

**Steps:**

1. Write tests for native vision path, fallback tool injection, OCR prompt affordance, and blocked private-IP media URLs.
2. Implement centralized media URL validation using URL parsing, protocol allowlist, private-network denial, and explicit admin override.
3. Add `visual_understanding` tool that calls a configured vision-capable model.
4. Inject fallback only when active model lacks native vision but supports tool calling.
5. Update UI copy and chips to show image/screenshot analysis mode without exposing implementation detail text in the app.
6. Add browser test uploading an image under a non-vision model and seeing a fallback result.
7. Run narrow tests, `pnpm typecheck`, and E2E.
8. Commit: `feat: add vision fallback tool`.

### Task P34.2: Provider-Backed Voice Conversations

**Files:**

- Create: `packages/ai-providers/src/audio.ts`
- Create: `apps/web/src/server/routers/voice.ts`
- Modify: `apps/web/src/server/routers/_app.ts`
- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/drizzle/0007_voice_settings.sql`
- Modify: `apps/web/src/components/VoiceInput.tsx`
- Modify: `apps/web/src/components/TTSButton.tsx`
- Create: `apps/web/src/components/VoiceSettings.tsx`
- Test: `tests/voice-conversations.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/voice-conversation.spec.ts`

**Steps:**

1. Add tests for provider STT, provider TTS, browser fallback, per-agent voice settings, and cached replay.
2. Add voice settings schema keyed by user and agent.
3. Implement `voice.transcribe`, `voice.synthesize`, and `voice.cache` router procedures.
4. Replace direct browser-only TTS with provider-first playback controls and browser fallback.
5. Add hands-free mode behind an explicit user setting.
6. Mock audio APIs in Playwright and test transcript review/send plus cached playback.
7. Run `pnpm test -- voice-conversations.test.mjs`, `pnpm typecheck`, and E2E.
8. Commit: `feat: add provider-backed voice conversations`.

### Task P34.3: Text-to-Image Generation

**Files:**

- Modify: `packages/ai-providers/src/types.ts`
- Create: `packages/ai-providers/src/image-generation.ts`
- Create: `packages/agent-runtime/src/tools/builtin/image-generation.ts`
- Modify: `packages/agent-runtime/src/tools/registry.ts`
- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/drizzle/0008_resources.sql`
- Modify: `apps/web/src/app/api/chat/stream/route.ts`
- Modify: `apps/web/src/components/ChatMessage.tsx`
- Test: `tests/image-generation.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/image-generation.spec.ts`

**Steps:**

1. Write failing tests for `createImage` capability, tool schema, persisted resource, and chat rendering.
2. Add image-generation capability metadata to provider catalog.
3. Implement adapter interface for OpenAI DALL-E style APIs and OpenAI-compatible image providers.
4. Add `resources` table for generated images with ownership and source message.
5. Render generated images in chat with resource metadata.
6. Add E2E with mocked provider response.
7. Run tests, typecheck, and image E2E.
8. Commit: `feat: add text-to-image generation`.

## Phase 35 - Agent, MCP, and Skills Marketplaces

### Task P35.1: AI Agent Builder

**Files:**

- Create: `apps/web/src/server/agent-builder.ts`
- Create: `apps/web/src/server/routers/agentBuilder.ts`
- Modify: `apps/web/src/server/routers/_app.ts`
- Modify: `apps/web/src/components/AgentBuilder.tsx`
- Create: `apps/web/src/components/AgentBuilderAssistant.tsx`
- Test: `tests/agent-builder-assistant.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/agent-builder-assistant.spec.ts`

**Steps:**

1. Test that a natural-language request returns a structured diff for identity, model, tools, prompt, opening questions, and KB.
2. Implement builder prompt assembly using provider catalog, tool registry, and current agent config.
3. Add Zod validation for builder output and reject unsafe tool/model references.
4. Add UI diff review with Apply/Reject actions.
5. Add E2E creating a new agent from a natural-language request with mocked builder output.
6. Run tests, typecheck, and E2E.
7. Commit: `feat: add AI agent builder assistant`.

### Task P35.2: Remote Agent Marketplace

**Files:**

- Modify: `apps/web/src/server/marketplace/manifest.ts`
- Modify: `apps/web/src/server/routers/marketplace.ts`
- Modify: `apps/web/src/components/AgentMarketplace.tsx`
- Create: `apps/web/src/server/marketplace/remote.ts`
- Test: `tests/remote-marketplace.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/remote-marketplace.spec.ts`

**Steps:**

1. Test remote index fetch, cache, signature/version metadata, fork, update, install, and offline fallback.
2. Add `AGENTHUB_AGENT_INDEX_URL` config and server-side fetch with timeout and schema validation.
3. Extend manifests with author, license, version, source URL, and upstream ID.
4. Add marketplace tabs for Local, Remote, Installed, and Updates.
5. Add E2E for mocked remote catalog install/fork/export.
6. Run tests and E2E.
7. Commit: `feat: add remote agent marketplace`.

### Task P35.3: Skills Marketplace and Runtime

**Files:**

- Create: `apps/web/src/server/skills/schema.ts`
- Create: `apps/web/src/server/skills/runtime.ts`
- Create: `apps/web/src/server/routers/skills.ts`
- Modify: `apps/web/src/server/routers/_app.ts`
- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/drizzle/0009_skills.sql`
- Create: `apps/web/src/components/SkillsMarketplace.tsx`
- Modify: `packages/agent-runtime/src/tools/registry.ts`
- Test: `tests/skills-runtime.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/skills-marketplace.spec.ts`

**Steps:**

1. Test skill package schema for `SKILL.md`, manifest, resources, scripts, templates, permissions.
2. Add DB tables for installed skills and skill resources.
3. Implement `runSkill`, `readReference`, `execScript`, and `exportFile` as governed tools.
4. Add UI to browse, install, inspect permissions, update, and remove skills.
5. Execute scripts only through sandbox/tool-policy checks.
6. Add E2E installing a mocked skill and invoking it from chat.
7. Run tests and E2E.
8. Commit: `feat: add skills marketplace runtime`.

## Phase 36 - Agent Runtime, Tasks, Heterogeneous CLI, and Review

### Task P36.1: Iterative Orchestration Mode

**Files:**

- Create: `packages/agent-runtime/src/orchestrators/iterative.ts`
- Modify: `packages/agent-runtime/src/orchestrators/index.ts`
- Modify: `packages/agent-runtime/src/orchestrators/types.ts`
- Modify: `apps/web/src/app/api/chat/stream/route.ts`
- Modify: `apps/web/src/components/AgentGroupBuilder.tsx`
- Modify: `apps/web/src/components/PatternVisualizer.tsx`
- Test: `tests/iterative-orchestration.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/iterative-orchestration.spec.ts`

**Steps:**

1. Test author/editor/reviser loop, max iterations, synthesis, and checkpoint event.
2. Implement `IterativeOrchestrator` by reusing `BaseOrchestrator.runAgent`.
3. Add pattern enum support in DB validation and UI selector.
4. Stream iterative events into existing pattern visualizer.
5. Add E2E creating a group and selecting iterative mode.
6. Run tests, typecheck, and E2E.
7. Commit: `feat: add iterative orchestration`.

### Task P36.2: Heterogeneous Agent Runtime

**Files:**

- Create: `packages/agent-runtime/src/heterogeneous/types.ts`
- Create: `packages/agent-runtime/src/heterogeneous/runner.ts`
- Create: `apps/web/src/server/routers/heterogeneous.ts`
- Modify: `apps/web/src/server/routers/_app.ts`
- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/drizzle/0010_heterogeneous_agents.sql`
- Create: `apps/web/src/components/HeterogeneousAgentSettings.tsx`
- Test: `tests/heterogeneous-runtime.test.mjs`

**Steps:**

1. Test command allowlist, arg-array spawning, environment scoping, working-directory validation, process cleanup, streaming output, and persisted session state.
2. Add DB tables for CLI agent profiles and runs.
3. Implement runner with `spawn`, never shell execution.
4. Wire router CRUD and run streaming endpoint.
5. Add settings UI behind a feature flag and permission warning.
6. Run tests and typecheck.
7. Commit: `feat: add heterogeneous agent runtime`.

### Task P36.3: Standalone CLI Execution

**Files:**

- Create: `packages/agenthub-cli/package.json`
- Create: `packages/agenthub-cli/src/index.ts`
- Create: `packages/agenthub-cli/src/hetero-exec.ts`
- Modify: `pnpm-workspace.yaml`
- Test: `tests/agenthub-cli.test.mjs`

**Steps:**

1. Test `agenthub hetero exec --agent <id> --input <file>` argument parsing and API call shape.
2. Add CLI package with subcommand routing.
3. Implement headless HITL prompts through stdin/stdout and API callbacks.
4. Persist CLI run as a chat session.
5. Run CLI unit tests, `pnpm typecheck`, and `pnpm test`.
6. Commit: `feat: add hetero exec CLI`.

### Task P36.4: Scheduled Run Hardening

**Files:**

- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/drizzle/0011_automation_hardening.sql`
- Modify: `apps/web/src/server/routers/automations.ts`
- Modify: `apps/web/src/server/workers/automationWorker.ts`
- Modify: `apps/web/src/components/AutomationsManager.tsx`
- Test: `tests/automations.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/automations-hardening.spec.ts`

**Steps:**

1. Add failing tests for timezone, max executions, pause/resume, conversation creation, and notification hook fields.
2. Extend schema and router validation.
3. Update worker to label generated sessions and enforce execution limits.
4. Add UI controls for timezone, frequency presets, max runs, and run-created session links.
5. Run tests and E2E.
6. Commit: `feat: harden scheduled agent runs`.

### Task P36.5: Lobe-Style Agent Tasks

**Files:**

- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/drizzle/0012_agent_task_threads.sql`
- Modify: `apps/web/src/server/routers/tasks.ts`
- Modify: `apps/web/src/server/workers/taskWorker.ts`
- Modify: `apps/web/src/components/TaskManager.tsx`
- Test: `tests/tasks.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/agent-tasks.spec.ts`

**Steps:**

1. Add tests for comments, templates, parent task fan-out, reassignment, status aliases, pagination, and filters.
2. Add task comments/templates/parent columns.
3. Update worker dependency resolver for parent fan-out.
4. Add task thread UI and filters.
5. Add E2E for parent task with two dependent subtasks and comments.
6. Run tests and E2E.
7. Commit: `feat: expand agent task workflows`.

### Task P36.6: Review Tab

**Files:**

- Create: `apps/web/src/server/git/diff.ts`
- Create: `apps/web/src/server/routers/review.ts`
- Modify: `apps/web/src/server/routers/_app.ts`
- Create: `apps/web/src/components/ReviewTab.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx`
- Test: `tests/review-tab.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/review-tab.spec.ts`

**Steps:**

1. Test repo path validation, `git diff --no-ext-diff --` invocation, large diff pagination, and no shell execution.
2. Add review router with repo registration and diff listing.
3. Render virtualized file tree and hunk list.
4. Gate local repo access until desktop/server mount is configured.
5. Add E2E with mocked diff response.
6. Run tests and E2E.
7. Commit: `feat: add review tab`.

### Task P36.7: General HITL Approvals

**Files:**

- Create: `packages/agent-runtime/src/approvals.ts`
- Modify: `packages/agent-runtime/src/runtime.ts`
- Modify: `apps/web/src/server/checkpoint-registry.ts`
- Modify: `apps/web/src/app/api/chat/checkpoint/route.ts`
- Modify: `apps/web/src/components/ChatInterface.tsx`
- Modify: `apps/web/src/server/routers/trust.ts`
- Test: `tests/hitl-approvals.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/hitl-approvals.spec.ts`

**Steps:**

1. Test action-level approval request, approve, reject, timeout, audit log, and headless continuation hook.
2. Generalize checkpoint registry from group-only to action approvals.
3. Add runtime hook before sensitive tool calls.
4. Persist approval events in audit log.
5. Add unified approve/reject UI.
6. Run tests and E2E.
7. Commit: `feat: generalize human approvals`.

## Phase 37 - MCP, Built-In Tools, Sandbox, and Governance

### Task P37.1: Complete MCP Transport Parity

**Files:**

- Modify: `packages/agent-runtime/src/mcp/client.ts`
- Modify: `apps/web/src/server/routers/mcp.ts`
- Modify: `apps/web/src/components/McpSettings.tsx`
- Test: `tests/mcp-settings.test.mjs`
- Test: `tests/mcp-security.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/mcp-transports.spec.ts`

**Steps:**

1. Test stdio, HTTP, streamable HTTP/SSE config validation, import/export, health, and schema diff.
2. Implement streamable transport support without weakening stdio process safety.
3. Add config import/export JSON UI.
4. Add server health and tool schema diff display.
5. Run MCP tests and E2E.
6. Commit: `feat: complete mcp transports`.

### Task P37.2: MCP Marketplace and One-Click Install

**Files:**

- Create: `apps/web/src/server/mcp/marketplace.ts`
- Modify: `apps/web/src/server/routers/mcp.ts`
- Create: `apps/web/src/components/McpMarketplace.tsx`
- Modify: `apps/web/src/components/McpSettings.tsx`
- Test: `tests/mcp-marketplace.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/mcp-marketplace.spec.ts`

**Steps:**

1. Test marketplace fetch, dependency preflight, install templates, permission prompts, and web-mode manual instructions.
2. Add server-side marketplace index loader with schema validation.
3. Add UI to browse/install into existing MCP settings.
4. For desktop-only STDIO installs, render explicit manual commands until Electron support lands.
5. Run tests and E2E.
6. Commit: `feat: add mcp marketplace`.

### Task P37.4: Expanded Built-In Tools

**Files:**

- Create: `packages/agent-runtime/src/tools/builtin/github.ts`
- Create: `packages/agent-runtime/src/tools/builtin/web-fetch.ts`
- Modify: `packages/agent-runtime/src/tools/registry.ts`
- Create: `apps/web/src/components/ToolsManager.tsx`
- Modify: `apps/web/src/server/routers/trust.ts`
- Test: `tests/builtin-tools.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/tools-manager.spec.ts`

**Steps:**

1. Test GitHub tool auth requirements, repo/issue/PR read operations, tool manager profile visibility, and governed fetch.
2. Implement GitHub read-only tool first; defer write actions behind HITL.
3. Add tools manager UI showing built-ins, MCP, skills, and permissions.
4. Route web fetch through outbound request guard.
5. Run tests and E2E.
6. Commit: `feat: expand built-in tools`.

### Task P37.5: Cloud/Server Sandbox Workflow

**Files:**

- Modify: `packages/agent-runtime/src/tools/builtin/executeCode.ts`
- Modify: `apps/web/src/server/sandbox.ts`
- Create: `apps/web/src/server/routers/sandbox.ts`
- Modify: `apps/web/src/server/routers/_app.ts`
- Create: `apps/web/src/components/SandboxOutput.tsx`
- Test: `tests/sandbox-workflow.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/sandbox-workflow.spec.ts`

**Steps:**

1. Test session storage, generated file metadata, downloadable outputs, chart rendering metadata, and network isolation.
2. Keep local Docker path as default offline mode.
3. Add optional cloud sandbox provider interface behind env config.
4. Persist sandbox outputs as resources.
5. Render files/charts from tool results.
6. Run tests and E2E.
7. Commit: `feat: add sandbox output workflows`.

### Task P37.6: MCP Governance Bridge

**Files:**

- Create: `apps/web/src/server/mcp/governance.ts`
- Create: `apps/web/src/server/routers/mcpGovernance.ts`
- Modify: `apps/web/src/server/routers/_app.ts`
- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/drizzle/0013_mcp_governance.sql`
- Create: `apps/web/src/components/McpGovernanceDashboard.tsx`
- Test: `tests/mcp-governance.test.mjs`

**Steps:**

1. Test rate limits, allowed hours, pattern blocking, per-server policy, allowed/denied audit log, and dashboard metrics.
2. Add governance policy and audit tables.
3. Wrap MCP tool execution through governance middleware.
4. Add dashboard for recent calls, violations, and server status.
5. Run tests and typecheck.
6. Commit: `feat: add mcp governance bridge`.

### Task P37.7: Tool Profiles and Deny Lists

**Files:**

- Create: `packages/agent-runtime/src/tools/profiles.ts`
- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/drizzle/0014_tool_profiles.sql`
- Modify: `apps/web/src/server/routers/trust.ts`
- Modify: `apps/web/src/components/AgentBuilder.tsx`
- Modify: `apps/web/src/app/api/chat/stream/route.ts`
- Test: `tests/tool-profiles.test.mjs`

**Steps:**

1. Test profile expansion, deny-list precedence, token-pruned exposed tools, and blocked call audit.
2. Add profile selection to agents/trust policy.
3. Compile runtime tool list from profile plus explicit allow/deny.
4. Update Agent Builder UI.
5. Run tests and typecheck.
6. Commit: `feat: add tool profiles`.

### Task P37.8: Centralized SSRF/XSS Protection

**Files:**

- Create: `apps/web/src/server/security/outbound.ts`
- Create: `apps/web/src/server/security/sanitize.ts`
- Modify: `apps/web/src/server/kb-search.ts`
- Modify: `apps/web/src/app/api/chat/stream/route.ts`
- Modify: `apps/web/src/components/ChatMessage.tsx`
- Test: `tests/security-coverage.test.mjs`
- Test: `tests/artifact-security.test.mjs`

**Steps:**

1. Test private IP block, protocol denial, explicit allowlist, provider base URL validation, unsafe HTML stripping, and iframe sandbox attributes.
2. Move scattered URL checks into `security/outbound.ts`.
3. Add sanitizer for any future artifact HTML and markdown-adjacent rich content.
4. Refactor callers to use centralized guards.
5. Run security tests and `pnpm test`.
6. Commit: `security: centralize outbound and html guards`.

## Phase 38 - Knowledge and Memory

### Task P38.1: Memory Agent Maintenance

**Files:**

- Create: `apps/web/src/server/memory-maintenance.ts`
- Modify: `apps/web/src/server/routers/memory.ts`
- Modify: `apps/web/src/components/MemoryEditor.tsx`
- Test: `tests/memory-maintenance.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/memory-maintenance.spec.ts`

**Steps:**

1. Test stale memory proposal, conflict proposal, category normalization, relevance decay, shared scope, and agent-specific scope.
2. Add proposal-only maintenance job; never silently mutate accepted memories.
3. Add UI for review, accept, edit, reject.
4. Add E2E for conflict proposal review.
5. Run tests and E2E.
6. Commit: `feat: add memory maintenance agent`.

### Task P38.2: Expanded RAG Ingestion and Vector Backends

**Files:**

- Create: `apps/web/src/server/ingest/parsers.ts`
- Create: `apps/web/src/server/vector-stores/index.ts`
- Modify: `apps/web/src/app/api/kb/ingest/route.ts`
- Modify: `apps/web/src/server/routers/kb.ts`
- Modify: `apps/web/src/components/KnowledgeBaseManager.tsx`
- Test: `tests/kb-rag.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/kb-ingestion.spec.ts`

**Steps:**

1. Add tests for PDF, DOCX, CSV/XLSX, audio transcript, video transcript/keyframe metadata, code, markdown, Qdrant, and Milvus adapter selection.
2. Implement parsers in smallest supported order: text/markdown/code, CSV, PDF, DOCX, audio/video metadata.
3. Add vector store interface with Postgres default and optional Qdrant/Milvus.
4. Update upload UI accepted types and status messages.
5. Run tests and E2E with mocked parser outputs.
6. Commit: `feat: expand knowledge ingestion`.

### Task P38.3: BM25-Grade Hybrid Search

**Files:**

- Modify: `apps/web/src/server/kb-search.ts`
- Create: `apps/web/drizzle/0015_bm25_search.sql`
- Modify: `apps/web/src/server/routers/kb.ts`
- Test: `tests/kb-rag.test.mjs`

**Steps:**

1. Add tests proving exact-token query beats semantic-only miss and semantic query still returns conceptual matches.
2. Add `pg_search`/BM25 path when available and fallback to existing full-text/RRF path when not.
3. Add ICU/tokenizer config docs in migration comments or deployment docs.
4. Add metrics for vector score, lexical score, fused score, and rerank score.
5. Run `pnpm test -- kb-rag.test.mjs`.
6. Commit: `feat: improve hybrid search relevance`.

### Task P38.4: In-Chat File Viewer

**Files:**

- Create: `apps/web/src/components/FileViewerPanel.tsx`
- Create: `apps/web/src/components/viewers/PdfViewer.tsx`
- Create: `apps/web/src/components/viewers/CodeViewer.tsx`
- Create: `apps/web/src/components/viewers/ImageViewer.tsx`
- Create: `apps/web/src/components/viewers/OfficeTextViewer.tsx`
- Modify: `apps/web/src/components/ChatMessage.tsx`
- Modify: `apps/web/src/components/KnowledgeBaseManager.tsx`
- Test: `tests/file-viewer.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/file-viewer.spec.ts`

**Steps:**

1. Test citation payload includes document/chunk/page metadata and viewer opens from a citation.
2. Implement viewer shell and safe file download URL resolution.
3. Add code/image/text viewers first; add PDF page navigation next.
4. Add Office extracted-text preview rather than binary rendering for MVP.
5. Add E2E opening a cited chunk from ChatMessage.
6. Run tests and E2E.
7. Commit: `feat: add in-chat file viewer`.

## Phase 39 - Chat UX and Interaction Controls

### Task P39.1: Artifacts Panel

**Files:**

- Create: `apps/web/src/components/ArtifactsPanel.tsx`
- Create: `apps/web/src/components/ArtifactFrame.tsx`
- Create: `apps/web/src/server/artifacts.ts`
- Modify: `apps/web/src/components/ChatInterface.tsx`
- Modify: `apps/web/src/components/ChatMessage.tsx`
- Modify: `apps/web/src/server/db/schema.ts`
- Test: `tests/artifacts.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/artifacts.spec.ts`

**Steps:**

1. Depend on P37.8 before implementation.
2. Test artifact detection, persistence, sanitized iframe render, preview/code switch, and history reload.
3. Add artifact parser for fenced HTML/SVG/React metadata.
4. Store artifact metadata on messages/resources.
5. Render side panel with code and preview tabs.
6. Add E2E for mocked artifact message.
7. Commit: `feat: add artifacts panel`.

### Task P39.2: Reasoning Timeline

**Files:**

- Modify: `packages/ai-providers/src/types.ts`
- Modify: `packages/agent-runtime/src/runtime.ts`
- Modify: `apps/web/src/app/api/chat/stream/route.ts`
- Create: `apps/web/src/components/ReasoningTimeline.tsx`
- Modify: `apps/web/src/components/ChatMessage.tsx`
- Test: `tests/reasoning-timeline.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/reasoning-timeline.spec.ts`

**Steps:**

1. Test reasoning event stream, duration tracking, collapse state, and provider policy redaction.
2. Add structured reasoning events without inventing hidden chain-of-thought content.
3. Render timeline from provider/runtime-visible reasoning only.
4. Add E2E with mocked reasoning events.
5. Run tests and E2E.
6. Commit: `feat: add reasoning timeline`.

### Task P39.3: Branching Modes

**Files:**

- Modify: `apps/web/src/server/routers/sessions.ts`
- Modify: `apps/web/src/components/ChatInterface.tsx`
- Modify: `apps/web/src/components/BranchNavigator.tsx`
- Test: `tests/branching-modes.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-b/branching.spec.ts`

**Steps:**

1. Test continuation fork copies prior context and standalone fork starts from selected message only.
2. Extend `sessions.fork` input with `mode`.
3. Add mode selector in branch action.
4. Add branch tree/navigator labels.
5. Run tests and existing branching E2E.
6. Commit: `feat: add conversation branching modes`.

### Task P39.4: Custom Theme System

**Files:**

- Modify: `apps/web/src/components/ThemeProvider.tsx`
- Modify: `apps/web/src/components/ThemeToggle.tsx`
- Create: `apps/web/src/components/ThemeSettings.tsx`
- Modify: `apps/web/src/app/settings/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `tests/theme-system.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-g/theme.spec.ts`

**Steps:**

1. Test persisted accent palette, chat/document layout mode, system sync, and no hydration mismatch markers.
2. Add theme tokens to provider and local/server setting persistence.
3. Add settings UI with swatches and segmented layout control.
4. Apply layout mode in ChatMessage/ChatInterface.
5. Run tests and theme E2E.
6. Commit: `feat: add custom theme settings`.

### Task P39.5: Inline Agent Mentions

**Files:**

- Create: `apps/web/src/lib/agent-mentions.ts`
- Modify: `apps/web/src/components/ChatInput.tsx`
- Modify: `apps/web/src/components/ChatMessage.tsx`
- Modify: `apps/web/src/app/api/chat/stream/route.ts`
- Test: `tests/agent-mentions.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/agent-mentions.spec.ts`

**Steps:**

1. Test mention parser, profile-card render, user ownership check, and mentioned-agent execution routing.
2. Add input autocomplete for local agents.
3. Render mention cards in messages.
4. Route mentioned agent context into stream handler under user ownership.
5. Run tests and E2E.
6. Commit: `feat: add inline agent mentions`.

### Task P39.6: Local File Mention Snapshots

**Files:**

- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/drizzle/0016_file_snapshots.sql`
- Modify: `apps/web/src/app/api/upload/presigned/route.ts`
- Modify: `apps/web/src/components/ChatInput.tsx`
- Modify: `apps/web/src/components/ChatMessage.tsx`
- Test: `tests/file-snapshots.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/file-snapshots.spec.ts`

**Steps:**

1. Test immutable snapshot metadata, content hash, source name, and unchanged snapshot after source metadata changes.
2. Store file snapshot rows at drag/upload time.
3. Add inline file mention chips.
4. Defer desktop local path resolution until P42.3.
5. Add E2E dragging a file and seeing snapshot chip.
6. Commit: `feat: add file mention snapshots`.

### Task P39.7: Inline Prompt Refinement

**Files:**

- Create: `apps/web/src/server/routers/promptRefinement.ts`
- Modify: `apps/web/src/server/routers/_app.ts`
- Create: `apps/web/src/components/PromptRefinementMenu.tsx`
- Modify: `apps/web/src/components/ChatInput.tsx`
- Test: `tests/prompt-refinement.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/prompt-refinement.spec.ts`

**Steps:**

1. Test rewrite, translate, shorten, expand, and media prompt optimize actions return replacement text without creating a message.
2. Implement router with model call and strict length limits.
3. Add input menu actions with preview/apply/cancel.
4. Add E2E for mocked rewrite before send.
5. Run tests and E2E.
6. Commit: `feat: add inline prompt refinement`.

## Phase 40 - Pages, Projects, Briefs, and Working Documents

### Task P40.1: Pages and Editor Foundation

**Files:**

- Create: `packages/editor-kernel/package.json`
- Create: `packages/editor-kernel/src/index.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/drizzle/0017_pages.sql`
- Create: `apps/web/src/server/routers/pages.ts`
- Modify: `apps/web/src/server/routers/_app.ts`
- Create: `apps/web/src/components/pages/PageEditor.tsx`
- Test: `tests/pages.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/pages.spec.ts`

**Steps:**

1. Test page CRUD, user isolation, markdown import/export, and page-agent edit proposal.
2. Add page tables and router.
3. Add minimal editor kernel package and React editor surface.
4. Add page copilot proposal/apply flow.
5. Add E2E for creating and editing a page.
6. Commit: `feat: add pages editor foundation`.

### Task P40.2: Projects and Notebooks

**Files:**

- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/drizzle/0018_projects_notebooks.sql`
- Create: `apps/web/src/server/routers/projects.ts`
- Create: `apps/web/src/server/routers/notebooks.ts`
- Modify: `apps/web/src/server/routers/_app.ts`
- Create: `apps/web/src/components/projects/ProjectWorkspace.tsx`
- Create: `apps/web/src/components/notebooks/NotebookPanel.tsx`
- Test: `tests/projects-notebooks.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/projects-notebooks.spec.ts`

**Steps:**

1. Test project scoping for agents, sessions, pages, KBs, tasks, schedules, resources, and notebooks.
2. Add projects, project links, notebooks, and notebook documents.
3. Add side panel and workspace filters.
4. Inject notebook docs into chat context only when scoped to active project/session.
5. Run tests and E2E.
6. Commit: `feat: add projects and notebooks`.

### Task P40.3: Page Edit History

**Files:**

- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/drizzle/0019_page_history.sql`
- Modify: `apps/web/src/server/routers/pages.ts`
- Create: `apps/web/src/components/pages/PageHistory.tsx`
- Test: `tests/page-history.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/page-history.spec.ts`

**Steps:**

1. Test version creation, diff metadata, restore, retention, and user isolation.
2. Add page versions table.
3. Capture version on edits and agent proposals.
4. Add history timeline, compare, restore UI.
5. Run tests and E2E.
6. Commit: `feat: add page edit history`.

### Task P40.4: Daily Brief

**Files:**

- Create: `apps/web/src/server/briefs.ts`
- Create: `apps/web/src/server/routers/briefs.ts`
- Modify: `apps/web/src/server/routers/_app.ts`
- Modify: `apps/web/src/instrumentation.ts`
- Create: `apps/web/src/components/DailyBrief.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Test: `tests/daily-brief.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/daily-brief.spec.ts`

**Steps:**

1. Test brief aggregates recent tasks, automations, memory changes, alerts, and scheduled summaries.
2. Add brief generator and cache table if persistence is needed.
3. Schedule nightly generation and manual refresh.
4. Render homepage module.
5. Run tests and E2E.
6. Commit: `feat: add daily brief`.

### Task P40.5: Agent Working Panel

**Files:**

- Create: `apps/web/src/components/AgentWorkingPanel.tsx`
- Modify: `apps/web/src/components/ChatInterface.tsx`
- Modify: `apps/web/src/components/TaskManager.tsx`
- Modify: `apps/web/src/components/pages/PageEditor.tsx`
- Test: `tests/agent-working-panel.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/working-panel.spec.ts`

**Steps:**

1. Test panel state, active documents, task progress, run logs, citations, and no chat reset on open/close.
2. Build collapsible right panel with tabs.
3. Connect tasks/pages/resources/citations via existing routers.
4. Add E2E opening panel beside active chat.
5. Run tests and E2E.
6. Commit: `feat: add agent working panel`.

### Task P40.6: Nightly Self-Review

**Files:**

- Create: `apps/web/src/server/agent-signal.ts`
- Create: `apps/web/src/server/workers/agentSignalWorker.ts`
- Modify: `apps/web/src/instrumentation.ts`
- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/drizzle/0020_agent_signal.sql`
- Test: `tests/agent-signal.test.mjs`

**Steps:**

1. Test nightly review scheduling, policy-aware review prompt, findings persistence, and brief integration.
2. Add Agent Signal tables and worker.
3. Add skill/tool-aware policy inputs.
4. Link results into Daily Brief.
5. Run tests and typecheck.
6. Commit: `feat: add nightly agent self-review`.

## Phase 41 - Enterprise Platform, Auth, Deploy, and Data

### Task P41.1: Deployment Templates and Docs

**Files:**

- Modify: `README.md`
- Create: `docs/deployment/docker-compose-production.md`
- Create: `docs/deployment/vercel.md`
- Create: `docs/deployment/zeabur.md`
- Create: `docs/deployment/sealos.md`
- Modify: `docker-compose.yml`
- Test: `tests/deployment-docs.test.mjs`

**Steps:**

1. Test README no longer claims missing Docker Compose and docs include required env/service names.
2. Align docs with actual NextAuth/Casdoor/Postgres/Redis/MinIO/SearXNG/worker stack.
3. Add platform-specific templates and health-check sequence.
4. Run docs tests and `git diff --check`.
5. Commit: `docs: add production deployment plans`.

### Task P41.2: Local-First Sync Decision and Implementation Gate

**Files:**

- Create: `docs/architecture/adr-001-local-first-sync.md`
- Optional Create: `apps/web/src/sync/yjs.ts`
- Optional Test: `tests/local-first-sync.test.mjs`

**Steps:**

1. Write ADR comparing PostgreSQL-only parity, optional IndexedDB/YJS/WebRTC, and no local-first implementation.
2. If the decision is build, add failing conflict-resolution and offline-write tests.
3. Implement behind `NEXT_PUBLIC_EXPERIMENTAL_LOCAL_SYNC=1`.
4. Add warning UI and export/backup safety.
5. Run tests and typecheck.
6. Commit ADR first, then implementation if approved: `docs: decide local-first sync strategy`.

### Task P41.3: Auth Reconciliation or Better Auth Migration

**Files:**

- Create: `docs/architecture/adr-002-auth-stack.md`
- Modify: `README.md`
- Modify if migrating: `apps/web/src/server/auth.ts`
- Modify if migrating: `apps/web/src/app/api/auth/[...nextauth]/route.ts`
- Test: `tests/auth-stack.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-a/auth.spec.ts`

**Steps:**

1. Write ADR comparing current NextAuth/Casdoor, Better Auth migration, and docs-only correction.
2. Add failing test for whichever decision is chosen: docs match current code, or Better Auth routes/envs exist.
3. Implement the chosen path.
4. Run auth tests and auth E2E.
5. Commit: `docs: reconcile auth architecture` or `feat: migrate to better auth`.

## Phase 42 - Channels, Desktop, Sync, and Public APIs

### Task P42.1: Messaging App Channels

**Files:**

- Create: `apps/web/src/server/channels/types.ts`
- Create: `apps/web/src/server/channels/discord.ts`
- Create: `apps/web/src/server/channels/slack.ts`
- Create: `apps/web/src/server/routers/channels.ts`
- Modify: `apps/web/src/server/routers/_app.ts`
- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/drizzle/0021_channels.sql`
- Create: `apps/web/src/components/ChannelSettings.tsx`
- Test: `tests/channels.test.mjs`

**Steps:**

1. Test Discord and Slack webhook verification, slash command parsing, DM pairing, per-sender tool gating, and audit logs.
2. Add channel accounts and sender policies tables.
3. Implement Discord and Slack first; leave Telegram/Line/Messenger/WhatsApp as follow-up adapters under same interface.
4. Add settings UI for secrets and policy.
5. Run tests and typecheck.
6. Commit: `feat: add agent channel deployments`.

### Task P42.2: REST and WebSocket API Expansion

**Files:**

- Create: `apps/web/src/app/api/v1/agents/route.ts`
- Create: `apps/web/src/app/api/v1/sessions/route.ts`
- Create: `apps/web/src/app/api/v1/tasks/route.ts`
- Create: `apps/web/src/app/api/v1/kb/route.ts`
- Create: `apps/web/src/app/api/v1/ws/route.ts`
- Modify: `apps/web/src/server/routers/apiKeys.ts`
- Test: `tests/public-api.test.mjs`

**Steps:**

1. Test API-key auth, user isolation, REST validation, SSE fallback, and WebSocket gateway handshake or documented unsupported runtime fallback.
2. Add REST route handlers using existing routers/service functions.
3. Add gateway abstraction with SSE fallback if Next runtime cannot host raw WebSocket.
4. Add API docs in `docs/api.md`.
5. Run public API tests and behavioral stream tests.
6. Commit: `feat: expand public api`.

### Task P42.3: Electron Desktop App

Expanded execution plan: `docs/plans/2026-05-15-electron-desktop-shell-stabilization-plan.md`.

**Files:**

- Create: `apps/desktop/package.json`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/main/ipc.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/renderer/App.tsx`
- Modify: `pnpm-workspace.yaml`
- Test: `tests/desktop-architecture.test.mjs`

**Steps:**

1. Test package scripts, IPC allowlist, local file permission boundaries, keychain abstraction, window state store, and MCP STDIO availability.
2. Add Electron app shell loading the web UI.
3. Add IPC channels for local file snapshots, STDIO MCP, keychain, tray/global command menu, and window state.
4. Keep all local capabilities disabled unless desktop runtime is detected.
5. Run tests and typecheck.
6. Commit: `feat: scaffold desktop app`.

### Task P42.4: PWA Regression Coverage

**Files:**

- Modify: `tests/repository.test.mjs`
- Modify: `apps/web/tests/e2e/specs/phase-g/theme.spec.ts`
- Create: `apps/web/tests/e2e/specs/phase-h/pwa.spec.ts`

**Steps:**

1. Add tests for manifest, service worker registration, installability metadata, offline shell, and responsive layout.
2. Fix regressions from desktop/API work.
3. Run PWA E2E and `pnpm test`.
4. Commit: `test: preserve pwa behavior`.

## Phase 43 - Developer Ecosystem and Automated i18n

### Task P43.1: AgentHub CLI Toolbox

**Files:**

- Modify: `packages/agenthub-cli/package.json`
- Create: `packages/agenthub-cli/src/commit.ts`
- Create: `packages/agenthub-cli/src/i18n.ts`
- Create: `packages/agenthub-cli/src/label.ts`
- Test: `tests/agenthub-cli-toolbox.test.mjs`

**Steps:**

1. Test `agenthub commit`, `agenthub i18n`, and `agenthub label` command parsing with mocked providers/GitHub.
2. Implement commit message generation with dry-run default.
3. Implement i18n update helper for local message files.
4. Implement label sync with explicit source/target and dry-run default.
5. Run CLI tests and typecheck.
6. Commit: `feat: add agenthub cli toolbox`.

### Task P43.2: Reusable AIGC UI Packages

**Files:**

- Create: `packages/ui/package.json`
- Create: `packages/ui/src/index.ts`
- Move or wrap: `apps/web/src/components/ChatMessage.tsx`
- Move or wrap: `apps/web/src/components/ModelSelector.tsx`
- Move or wrap: `apps/web/src/components/TTSButton.tsx`
- Move or wrap: `apps/web/src/components/ArtifactsPanel.tsx`
- Modify: `pnpm-workspace.yaml`
- Test: `tests/ui-package.test.mjs`

**Steps:**

1. Test package exports and app imports from `@agenthub/ui`.
2. Extract stable, prop-driven components only; keep app-specific tRPC wiring in app wrappers.
3. Add package typecheck script.
4. Update imports incrementally.
5. Run package and app typecheck.
6. Commit: `refactor: extract reusable ui package`.

### Task P43.3: Editor Kernel Package

**Files:**

- Modify: `packages/editor-kernel/src/index.ts`
- Create: `packages/editor-kernel/src/plugins/markdown.ts`
- Create: `packages/editor-kernel/src/plugins/ai-complete.ts`
- Modify: `apps/web/src/components/pages/PageEditor.tsx`
- Modify: `apps/web/src/components/ChatInput.tsx`
- Test: `tests/editor-kernel.test.mjs`

**Steps:**

1. Test kernel exports, markdown plugin, AI-complete plugin contract, and React binding consumption.
2. Move editor primitives out of app code into `packages/editor-kernel`.
3. Wire Pages and optional ChatInput enhancement to shared package.
4. Run tests and typecheck.
5. Commit: `feat: formalize editor kernel`.

### Task P43.4: Automated i18n Pipeline

**Files:**

- Create: `apps/web/src/i18n/namespaces.ts`
- Create: `scripts/i18n-check.ts`
- Create: `scripts/i18n-update.ts`
- Modify: `apps/web/src/i18n/request.ts`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/package.json`
- Test: `tests/i18n-automation.test.mjs`
- Browser: `apps/web/tests/e2e/specs/phase-h/i18n.spec.ts`

**Steps:**

1. Test missing-key detection, namespace loading, browser language detection, RTL `dir`, and generated diff output.
2. Add `pnpm -C apps/web i18n:check` and `i18n:update`.
3. Load translations by namespace where practical.
4. Set `<html dir>` from locale direction.
5. Add E2E for locale switch and RTL sample locale if added.
6. Run i18n tests, typecheck, and E2E.
7. Commit: `feat: automate i18n checks`.

## Final Verification Before Marking Any Task Done

Run:

```bash
pnpm typecheck
pnpm test
pnpm -C apps/web test:e2e
git diff --check
git status --short --branch
```

Done when:

- The task's failing tests fail before implementation and pass after implementation.
- Browser automation covers every visible UI control added by the task.
- Security-sensitive tasks include isolation, permission, SSRF/XSS, shell-injection, and audit-log coverage as applicable.
- `TODO.md` and `docs/plans/2026-05-15-lobehub-parity-roadmap.md` are updated only after verified implementation.

# AgentHub Roadmap / TODO

> Single source of truth for remaining AgentHub completion work.
> Last verified: 2026-05-19 from `/home/coxar/projects/AgentHub`.
> Source evidence: `docs/reports/2026-05-17-e2e-semantic-debugging-report.md` and `/mnt/e/developer/references/Docs/AgentHub/Kimi_Agent_LobeHub Feature Gaps/lobehub_gap_analysis.agent.final.md`.
> GitHub issue audit: `docs/reports/2026-05-17-github-issues-audit.md`.
> GitHub issue state: all tracked issues `#2` through `#46` are closed as of 2026-05-19.

## Agent Instructions

- Start here before using older planning docs.
- Treat `IMPLEMENTATION_PLAN.md`, `DESIGN.md`, `ARCHITECTURE.md`, `REQUIREMENTS_AUDIT.md`, and `docs/plans/*` as reference/archive unless this file links a task to them.
- Do not create another canonical roadmap. Add new completion work to this file and keep detailed investigation notes in `docs/reports/`.
- Do not mark future work complete because static tests pass. Mark it complete only after the listed verification commands pass on the current checkout.
- Do not close future GitHub issues from local-only evidence. Land and push the implementation first, then use the GitHub issue audit pattern for closure comments.
- Keep work scoped. The current tree is heavily dirty; do not revert unrelated user changes.
- If a task exposes another blocker, add it under the nearest priority section with the command or runtime evidence that proved it.

## Current Status

Latest local verification is green for the current checkout. The previously documented P0 runtime blockers are resolved: production build, Drizzle migration application, web Playwright setup, live Ollama browser E2E, desktop smoke E2E, dependency health, i18n, moderate-level audit, frozen install, and standalone health probes all passed on 2026-05-19.

On 2026-05-18, `pnpm -C apps/web db:pglite:smoke` also passed. That smoke creates a fresh PGlite data directory, installs pgvector and pg_trgm, applies all 32 Drizzle journal migrations through the PGlite simple execution path, verifies key tables and vector indexes, and reopens the app runtime database client with `AGENTHUB_DB_DRIVER=pglite`.

Also on 2026-05-18, the Phase H E2E synthetic-test inventory found 20 `page.setContent(...)` specs. All 20 were converted to app-backed flows and verified against the standalone app. See `docs/reports/2026-05-18-phase-h-e2e-inventory.md`.

The same 2026-05-18 verification pass found and fixed a Trusted Types CSP report from service-worker registration. The standalone tool-profile E2E was rerun after the fix, and the rebuilt server emitted no new CSP violation output during that browser flow.

Later on 2026-05-18, the iterative orchestration E2E conversion found additional Trusted Types CSP reports from Mermaid rendering in the group pattern visualizer. The visualizer now uses a React-rendered graph instead of the Mermaid runtime, and the rebuilt standalone iterative E2E emitted no CSP violation output during that browser flow.

Later on 2026-05-18, the memory maintenance E2E conversion replaced a static browser contract with a real app flow that seeds shared and agent-specific memories, verifies both scope filters, runs maintenance review, applies a category-normalization suggestion, and verifies the normalized entry against the standalone app.

Later on 2026-05-18, the page history and reasoning timeline E2E conversions replaced static browser contracts with real app flows. Page history now verifies persisted version snapshots, compare activation, and restore through `/pages`; reasoning timeline now verifies persisted assistant-message metadata hydration, expand/collapse behavior, and provider-visible metadata through the chat UI.

Later on 2026-05-18, the remaining Phase H synthetic specs were converted: prompt refinement, working panel, artifacts, image generation, KB file viewer, sandbox workflow, file mentions, remote marketplace, agent builder assistant, and HITL approvals. A final sweep of `apps/web/tests/e2e/specs/phase-h` found zero remaining `page.setContent(...)` usage.

That final conversion pass exposed and fixed two real runtime issues. The artifact panel now uses a dedicated Trusted Types policy for sanitized iframe `srcdoc`, and the agent builder assistant sanitizes blank current-form fields before calling the preview mutation so New Agent drafts work from an empty form. The HITL approval panel also now exposes stable selectors for tool-action approvals and legacy checkpoints.

Later on 2026-05-18, the public API streaming compatibility gap was given a running-app proof. `public-api-streaming.spec.ts` seeds a real API key in the E2E database, verifies unauthenticated `/api/v1/chat/completions` requests fail before provider execution, then calls the same route with `Authorization: Bearer ah_...`, `stream=true`, and live local Ollama to verify OpenAI-compatible `text/event-stream` chunks and `[DONE]` termination.

Later on 2026-05-18, the MinIO upload path was given a running-app proof. `minio-upload.spec.ts` signs in through the normal E2E setup, requests a real `/api/upload/presigned` URL, uploads bytes through the returned MinIO PUT URL, completes server-side object validation, retrieves the stored object from `s3Url`, and verifies persisted file metadata through `/api/v1/files` using a seeded API key.

Later on 2026-05-18, the Redis worker path was given a live BullMQ proof. `pnpm -C apps/web redis:worker:proof` starts an isolated automation worker queue prefix, enqueues a real `automations` job against Redis, verifies the worker persists the expected `max_executions_reached` automation-run state in Postgres, then closes the worker and removes temporary Redis/database artifacts.

Later on 2026-05-18, the MCP execution path was given an app-backed proof. `mcp-execution.spec.ts` starts a real HTTP MCP fixture server, registers it through the E2E database, calls the running app's authenticated `/api/mcp/call` endpoint, verifies an allowed `echo` tool executes, and verifies a denied `delete_all` tool is rejected by governance before the fixture server receives it.

Later on 2026-05-18, the local Casdoor OAuth path was given a browser proof beyond dev credentials. `casdoor-oauth.spec.ts` seeds the local Casdoor `app-built-in` OIDC application with AgentHub callback URLs, starts OAuth through NextAuth's CSRF-protected Casdoor provider endpoint, signs in as the built-in Casdoor admin user, returns to AgentHub, and verifies `/api/auth/session` reports `admin@example.com` in a fresh browser context without Playwright's dev-credentials storage state.

On 2026-05-19, the full web Playwright MVP suite was rerun against the standalone app with Docker-backed services, live local Ollama, and SearXNG. The final result was 77/77 passing tests with `DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_OLLAMA=1 OLLAMA_URL=http://localhost:11434 SEARXNG_BASE_URL=http://localhost:18080 E2E_BASE_URL=http://127.0.0.1:3100 pnpm -C apps/web test:e2e`.

Also on 2026-05-19, the release hygiene blockers found after provider/desktop changes were fixed and reverified. `pnpm install --frozen-lockfile` now passes with the checked-in pnpm peer-install setting, `pnpm -C apps/desktop prepare:web` and `pnpm -C apps/desktop test:e2e` pass after standalone bundle symlink/optional-package handling was hardened, and `node apps/web/scripts/prepare-standalone-assets.mjs` works from the repo root before standalone health probes.

The 2026-05-17 LobeHub/Kimi feature-gap pass added important parity foundations but did not close every source-document requirement. Completed slices include persistent route navigation for desktop/web tabs, A2UI schema/rendering/client actions, workspace multi-tenancy, web security headers and CSRF/rate-limit middleware, Vitest and shadcn workspace scaffolding, user quotas, upload tier limits, Ollama pull UX with hardware estimates, A2A JSON-RPC endpoints and Agent Card discovery, BullMQ queue foundations, queue admin metrics, and a stateful graph/checkpoint foundation.

No tracked P0/P1/P2 completion task remains open after the 2026-05-19 pass. Future feature requests should be added as new tasks instead of reopening older archive plans.

The repository is release-ready on GitHub for the tracked completion scope: the verified implementation is committed, pushed to `origin/master`, local and remote are in sync, and all tracked GitHub issues are closed with evidence comments.

## Verified Healthy Through 2026-05-19

- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm validate`
- [x] `pnpm exec turbo run test --force`
- [x] `pnpm exec turbo run typecheck --force`
- [x] `pnpm exec turbo run lint --force`
- [x] `pnpm exec turbo run build --force`
- [x] `pnpm audit --audit-level=moderate`
- [x] `pnpm -C apps/web i18n:check`
- [x] `pnpm -C apps/web db:pglite:smoke` (2026-05-18)
- [x] `pnpm db:migrate`
- [x] `DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_OLLAMA=1 OLLAMA_URL=http://localhost:11434 SEARXNG_BASE_URL=http://localhost:18080 E2E_BASE_URL=http://127.0.0.1:3100 pnpm -C apps/web test:e2e` (77/77 passed on 2026-05-19)
- [x] `pnpm -C apps/desktop prepare:web`
- [x] `pnpm -C apps/desktop test:e2e`
- [x] `node apps/web/scripts/prepare-standalone-assets.mjs`
- [x] `curl --max-time 8 -i http://127.0.0.1:3100/api/health`
- [x] `curl --max-time 8 -i http://127.0.0.1:3100/api/health/dependencies`

## Verified Failing / Blocked On 2026-05-17

No current release-gate failures remain in the latest pass.

Historical failures resolved in this pass:

- [x] Production build / Next standalone output.
- [x] Drizzle migration journal and fresh database migration reproducibility.
- [x] Playwright auth setup and E2E database preflight.
- [x] Live Ollama chat, agent, and group E2E coverage.
- [x] Dependency health timeout and bounded service probes.
- [x] Playwright standalone static/public asset serving.
- [x] Desktop smoke auth contract drift.

## P0: Release Blockers

There are no active P0 runtime blockers after the latest local verification pass.

### P0.1 Preserve The Green Gate Set

- [x] Keep the completion gates below green before merging or releasing.
- [x] Re-run the full gate set after migration, auth, provider, Playwright, desktop, and packaging changes in this pass.
- [x] No failed gate remains to add back under this P0 section.

Done when:

- The current checkout passes every command under `## Completion Gates`.
- Runtime health endpoints return bounded JSON responses for healthy and degraded dependency states.

## P1: Runtime Correctness And Real E2E Coverage

### P1.0 Close LobeHub/Kimi Feature Parity Gaps

- [x] Add persistent route chrome so standalone tabs such as `/projects` expose navigation back home.
- [x] Add A2UI schema, parser, renderer, chat integration, and built-in client action dispatch.
- [x] Add workspace schema, membership/invitation model, permission matrix, router, and persistent workspace switcher.
- [x] Add middleware security headers, CSP reporting, CSRF token issuance, and local rate-limit tiers.
- [x] Add Vitest happy-dom/v8 coverage harness without replacing the existing Node test suite.
- [x] Add shadcn-compatible monorepo component scaffolding under the shared UI package.
- [x] Add quota schema/router/enforcement for messages, tokens, API calls, and upload storage.
- [x] Add upload file-count/type/size limits, forbidden extension blocking, and short-lived presigned URLs.
- [x] Add Ollama model pull streaming route and settings UI with basic hardware-fit estimates.
- [x] Add A2A Agent Card discovery, JSON-RPC task send/subscribe/get/cancel, delegate route reuse, and registry client foundation.
- [x] Add BullMQ queue definitions, retry/backoff defaults, worker hooks, dead-letter capture, metrics, and admin queue visibility.
- [x] Add stateful graph DSL foundation with checkpoints, pause/resume, human gates, and termination guards.
- [x] Decide and document whether the requested Better Auth migration supersedes or coexists with the current NextAuth/Casdoor implementation; then implement the chosen path or mark it out of scope with tests.
- [x] Replace in-memory-only rate limits with an Upstash REST-backed atomic sliding-window implementation and local fallback for desktop/dev deployments.
- [x] Add upload completion validation with S3/MinIO object-head checks, magic-byte/content sniffing, and chat blocking for pending or rejected uploads.
- [x] Promote A2A discovery beyond the current Agent Card and remote registry client foundation: mDNS/local discovery, cross-framework adapter contracts, persistent communities, and UI-level delegation controls.
- [x] Persist queue dead letters, graph checkpoints, and graph thread pause state durably in PostgreSQL with process-local fallback for degraded local/dev runs.
- [x] Add authenticated SSE job progress plumbing for queued task and automation work, with Task Manager live-progress consumption and polling fallback.
- [x] Expose paused graph threads in the admin UI with durable checkpoint visibility and a resume control for clearing paused thread state.
- [x] Wire resumed graph threads back into concrete executor replay flows once product graph definitions and handlers are persisted.
- [x] Complete the trust-engine hardening requested by the source doc: separate vault process or equivalent isolation boundary, secret-use policy enforcement, and tamper-evident audit chain.
- [x] Harden local Docker sandbox policy beyond defaults: capability drop, no-new-privileges, stricter tmpfs, memory/swap/CPU/PID/ulimit controls, and configurable seccomp/AppArmor profiles.
- [x] Add app-backed sandbox allow/deny verification for a permitted `execute_code` flow and a blocked profile/deny-list flow.
- [x] Complete provider/media parity gaps not covered by the Ollama pull and existing voice/vision foundations: Piper/faster-whisper local services, ComfyUI/A1111 workflow integration, and generated-image queue status UI.
- [x] Finish foundation/tooling parity where still missing: ESLint 9 flat-config workspace package, lint-staged integration, env schema validation coverage, and CI parity against the canonical completion gates.

Done when:

- Every item above has a linked implementation commit or an explicit out-of-scope decision in this file.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass on the exact checkout containing those decisions.
- App-backed browser/API tests exist for high-risk runtime claims rather than static contract tests alone.

### P1.1 Deepen App-Backed Browser Coverage

- [x] Inventory remaining `page.setContent(...)` tests under `apps/web/tests/e2e/specs/phase-h`.
- [x] Convert high-risk settings/runtime/control specs for A2A delegation, heterogeneous runtime, iterative orchestration, local media services, MCP transport parity, memory maintenance, page history, projects/notebooks, reasoning timeline, and tool profiles to app-backed flows.
- [x] Convert the remaining Phase H synthetic specs for agent builder assistant, artifacts, file mentions, HITL approvals, image generation, KB file viewer, prompt refinement, remote marketplace, sandbox workflow, and working panel to app-backed flows.
- [x] Keep pure component/contract checks out of Phase H E2E when they do not exercise the running app.
- [x] Replace high-risk synthetic specs with `page.goto(...)` flows against the running app.
- [x] Seed state through fixtures, API helpers, database fixtures, or routed network responses rather than embedded HTML.
- [x] Assert persisted database state, real UI state, or network/API effects for major workflows.

Done when:

- The web E2E suite would fail if the real app implementation for a claimed critical Phase H feature were removed or broken.
- `rg -n "page\.setContent" apps/web/tests/e2e/specs/phase-h -g '*.ts'` returns no matches.

### P1.2 Expand External-Service Runtime Proof

- [x] Add or document a Casdoor-compatible local OAuth test path beyond dev credentials.
- [x] Add deeper Redis worker proof for automation/task processing under a real queued job.
- [x] Add deeper MinIO proof for presign, upload, persisted file metadata, and rendered resource retrieval.
- [x] Add MCP execution proof for one allowed local/server tool and one rejected unsafe tool in an app-backed flow.
- [x] Add public API streaming compatibility proof with API key auth against the running app.

Done when:

- Each external-service workflow has at least one green app-backed browser/API test or a documented reason it is covered by a lower-level contract.

## P2: Documentation, Tracking, And Release Hygiene

### P2.1 Keep Documentation Aligned With Verified Reality

- [x] Update `README.md` with the exact dependency startup sequence, database setup policy, and E2E setup sequence used for the green pass.
- [x] Point onboarding docs back to this file for active completion state.
- [x] Keep older docs labeled as reference/archive when they contain historical completion claims. Verified by `node --test tests/todo-roadmap-sync.test.mjs`.
- [x] Add a release checklist that matches the current canonical gates.

### P2.3 Close GitHub Issues With Evidence

- [x] Land or commit the current local implementation before closing GitHub issues: pushed commit `af79461` to `origin/master`.
- [x] Resolve `#4` formatting debt: `pnpm format:check` passes on the current checkout after Prettier normalization.
- [x] Add PGlite migration/runtime smoke coverage before closing `#10`: `pnpm -C apps/web db:pglite:smoke` passed on 2026-05-18.
- [x] Wire OpenAPI plugin loading into install/execution UX before closing `#18`: installed OpenAPI plugins now persist as governed package records, expose generated tool IDs in Marketplace, Tools Manager, and Agent Builder, and inject selected generated tools into the chat runtime. Verified by `node --test tests/openapi-plugin-loader.test.mjs tests/vitest-harness.test.mjs`, `pnpm test:vitest`, `pnpm -C apps/web typecheck`, and `pnpm -C apps/web lint`.
- [x] Resolve `#33` with a Vitest service-unit suite wired into the root validation gate. Verified by `pnpm test:vitest`, `node --test tests/vitest-harness.test.mjs`, and `pnpm validate`.
- [x] Rerun the full Playwright MVP suite before closing `#35`: 77/77 tests passed on 2026-05-19 against the standalone app, Docker-backed services, live local Ollama, and SearXNG.
- [x] Close epics `#41` through `#45` only after their children are closed or superseded: completed after non-epic issues `#2` through `#40` and `#46` were closed.

Done when:

- New agents can follow docs from a fresh checkout without discovering hidden setup steps.
- No doc claims runtime completion unless the corresponding verification gate passes.

### P2.2 Normalize Git / Release State

- [x] Review the dirty working tree and group intentional changes into coherent commits or a tracked implementation branch.
- [x] Ensure migration files, journal metadata, schema changes, tests, routes, packages, and docs are tracked together.
- [x] Re-run CI-equivalent gates on the exact tree intended for release.
- [x] Do not claim GitHub/release readiness until local branch state and remote state are explicitly checked: `git rev-list --left-right --count origin/master...HEAD` returned `0 0` after push.

Done when:

- `git status --short` contains only intentional ignored/runtime artifacts.
- The release branch is in sync with the intended remote.

## Completion Gates

AgentHub's current local release gate is green only when all of these pass on the current checkout:

```bash
pnpm install --frozen-lockfile
pnpm test:vitest
pnpm exec turbo run test --force
pnpm exec turbo run typecheck --force
pnpm exec turbo run lint --force
pnpm exec turbo run build --force
pnpm audit --audit-level=moderate
pnpm -C apps/web i18n:check
pnpm -C apps/web db:pglite:smoke
pnpm db:migrate
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_OLLAMA=1 OLLAMA_URL=http://localhost:11434 SEARXNG_BASE_URL=http://localhost:18080 E2E_BASE_URL=http://127.0.0.1:3100 pnpm -C apps/web test:e2e
pnpm -C apps/desktop prepare:web
pnpm -C apps/desktop test:e2e
```

Runtime readiness must also be verified against the standalone server:

```bash
node apps/web/scripts/prepare-standalone-assets.mjs
PORT=3100 HOSTNAME=127.0.0.1 node apps/web/.next/standalone/apps/web/server.js
curl --max-time 8 -i http://127.0.0.1:3100/api/health
curl --max-time 8 -i http://127.0.0.1:3100/api/health/dependencies
```

## Reference Reports

- `docs/reports/2026-05-17-e2e-semantic-debugging-report.md`

## Archive Notes

Earlier TODO content described failures from the first 2026-05-17 audit. Those blockers were repaired and reverified in the same date's later pass. Treat the report above as the source for exact commands and outcomes.

### P2.4 High-ROI Strategic Roadmap Items (LobeHub Parity & Monetization)

- [x] **Verification of applicable models via OAuth for use with paid subscription use.**
  - [x] Add "Paid Plan" verification gate in `packages/ai-providers/src/registry.ts`.
  - [x] Wire subscription state from `user_quotas` table to provider availability.
  - [x] Enforce paid-plan access before creating, updating, testing, fetching models for, or runtime-loading cloud provider credentials.
  - [x] Gate GitHub Copilot and Google Gemini OAuth routes with authenticated quota/plan checks.
  - [x] Show locked provider/OAuth states in Provider Settings for free-plan users.
  - [x] Verified with `node --test tests/provider-catalog.test.mjs tests/quotas.test.mjs tests/architecture-hardening.test.mjs tests/public-api.test.mjs`, `pnpm -C apps/web typecheck`, `pnpm -C apps/web lint`, and `pnpm validate` on 2026-05-17.
  - [x] Implement OAuth 2.0 device flow / web flow for remaining providers where a real provider-supported subscription API path exists: GitHub Copilot device flow and Google Gemini GCP OAuth are implemented; the remaining supported cloud providers are API-key/OpenAI-compatible credential paths or have no documented consumer-subscription API OAuth path in scope.
- [x] **LLM Session Titles and Ranked Conversation Search.**
  - [x] Added server-side title generation with selected-model `provider.chat`, timeout, cleanup, and deterministic fallback at `apps/web/src/server/session-title.ts`.
  - [x] Wired `sessions.generateTitle` into first-message chat flow while preserving instant local fallback titles.
  - [x] Replaced conversation search with ranked Postgres full-text search over session titles and message content; added FTS5-style local search indexes in `0029_session_titles_search.sql`.
  - [x] Verified with `node --test tests/session-title-search.test.mjs tests/search-modal.test.mjs tests/repository.test.mjs tests/todo-roadmap-sync.test.mjs`, `pnpm -C apps/web typecheck`, and `pnpm -C apps/web lint` on 2026-05-17.
- [x] **Memory Approval Flow.**
  - [x] Fixed accepted-memory injection to require both agent scope and `userId` scope across chat stream, public API chat completions, A2A, and channel webhooks.
  - [x] Added persistent pending-proposal review count plus bulk accept/reject actions in `MemoryEditor`.
  - [x] Added `memoryEntries.bulkSetStatus` with user-scoped, proposed-only updates for bulk decisions.
  - [x] Verified with `node --test tests/memory-approval-flow.test.mjs tests/memory-maintenance.test.mjs tests/repository.test.mjs`, `pnpm -C apps/web typecheck`, and `pnpm -C apps/web lint` on 2026-05-17.
- [x] **Continuous Voice.**
  - [x] Added hands-free transcript auto-submit from `ChatInput` when the active agent has `handsFreeVoice` enabled and no attachments are pending.
  - [x] Added browser speech-recognition looping in `VoiceInput` with pause/resume around assistant playback and generation.
  - [x] Added voice playback coordination events from `TTSButton` so continuous listening does not capture assistant audio.
  - [x] Verified with `node --test tests/continuous-voice.test.mjs tests/voice-provider.test.mjs tests/ui-package.test.mjs`, `pnpm -C apps/web typecheck`, and `pnpm -C apps/web lint` on 2026-05-17.
- [x] **Mobile UX.**
  - [x] Added authenticated mobile app chrome with a persistent top app bar, search access, sidebar access, and bottom primary navigation.
  - [x] Scoped collapsed sidebar width to desktop so mobile navigation remains usable even after desktop collapse state persists.
  - [x] Made standalone route chrome, workspace switcher menus, Projects workspace columns, and the artifact gallery responsive on phone-sized viewports.
  - [x] Verified with `node --test tests/mobile-ux.test.mjs tests/desktop-navigation.test.mjs tests/pwa-regression-p42.test.mjs`, `pnpm -C apps/web typecheck`, `pnpm -C apps/web lint`, `pnpm -C apps/web build`, and `DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/mobile-ux.spec.ts --project=chromium` on 2026-05-17.
- [x] **Visual Workflow Designer.**
  - [x] Added persisted `workflow_definition` JSON to automations with migration `0030_visual_workflow_designer.sql`.
  - [x] Added validated, user-scoped `automations.updateWorkflow` mutation and normalized workflow definition storage.
  - [x] Added a visual node canvas, node palette, edge creation, node properties, human-gate pause controls, and save flow in the Automations UI.
  - [x] Injected saved workflow plans into actual automation runs so visual definitions affect worker prompts and created run sessions.
  - [x] Verified with `node --test tests/visual-workflow-designer.test.mjs tests/automations.test.mjs tests/stateful-graph.test.mjs`, `pnpm -C apps/web typecheck`, and `pnpm -C apps/web lint` on 2026-05-17.
- [x] **Auto Manager.**
  - [x] Added rule-based task manager state and actions for queueing ready tasks, retrying eligible failures, assigning unassigned tasks across owned agents, and annotating blocked tasks.
  - [x] Kept all manager actions user-scoped and auditable through system comments.
  - [x] Added a Task Manager panel with live recommendation counts and explicit action buttons.
  - [x] Verified with `node --test tests/auto-manager.test.mjs tests/tasks.test.mjs tests/todo-roadmap-sync.test.mjs`, `pnpm -C apps/web typecheck`, and `pnpm -C apps/web lint` on 2026-05-17.
- [x] **Monaco Coding UI.**
  - [x] Added `@monaco-editor/react` and `monaco-editor` to the web app.
  - [x] Added `/code` route with a client-only Monaco workspace, local file tabs, language selection, copy/format controls, and persisted browser drafts.
  - [x] Added authenticated sandbox-backed Python execution through `sandbox.executeCode`, reusing the hardened Docker sandbox path.
  - [x] Added Code navigation to persistent route chrome and the desktop sidebar.
  - [x] Verified with `node --test tests/monaco-code-ui.test.mjs tests/sandbox-workflow.test.mjs tests/desktop-navigation.test.mjs`, `pnpm -C apps/web typecheck`, and `pnpm -C apps/web lint` on 2026-05-17.
- [x] **Branch Tree Visualization.**
  - [x] Added user-scoped `sessions.branchTree` to build a root-to-descendants tree from fork metadata without exposing other users' sessions.
  - [x] Added a compact clickable branch tree in `BranchNavigator` while preserving existing branch paging and continuation/standalone labels.
  - [x] Kept branch navigation visible from root sessions so users can discover and switch into forks without first entering a child branch.
  - [x] Verified with `node --test tests/branch-tree-visualization.test.mjs tests/branching-modes.test.mjs`, `pnpm -C apps/web typecheck`, and `pnpm -C apps/web lint` on 2026-05-17.
- [x] **Community Marketplace.**
  - [x] Added guarded community publish drafts and optional `AGENTHUB_AGENT_PUBLISH_URL` submission for owned local agents.
  - [x] Added a Community tab that generates/submits publish packages without silently sending data when no endpoint is configured.
  - [x] Added remote marketplace preview and remote manifest export so community items can be reviewed before install/fork.
  - [x] Verified with `node --test tests/community-marketplace.test.mjs tests/remote-marketplace.test.mjs tests/repository.test.mjs`, `pnpm -C apps/web typecheck`, and `pnpm -C apps/web lint` on 2026-05-17.
- [x] **Desktop File Agent / Desktop Automation Boundary.**
  - [x] Enabled the existing desktop file snapshot IPC capability while keeping sender validation and the native file picker requirement.
  - [x] Reworked desktop snapshot hashing/preview reads to stay memory-bounded and read-only.
  - [x] Added chat integration that inserts selected desktop files as immutable `desktop_local` mentions without uploading or persisting raw local paths.
  - [x] Documented the desktop file-agent persistence boundary in `docs/desktop/file-access.md`.
  - [x] Verified with `node --test tests/desktop-file-agent.test.mjs tests/desktop-file-access.test.mjs tests/file-mentions.test.mjs`, `pnpm -C apps/web typecheck`, `pnpm -C apps/desktop typecheck`, and `pnpm -C apps/web lint` on 2026-05-17.
- [x] **Artifacts UI Rendering (Sandboxed Iframe).**
  - [x] Implement UI panel for HTML/CSS/React/SVG preview (Phase 39.1) — `packages/ui/src/ArtifactPanel.tsx`, `apps/web/src/components/ArtifactPanel.tsx`, `apps/web/src/lib/artifacts.ts`. All artifact tests pass.
  - [x] Artifact toolbar: copy, download, expand — added to `packages/ui/src/ArtifactPanel.tsx` 2026-05-17.
  - [x] Artifact gallery sidebar — implemented at `apps/web/src/components/ArtifactGallerySidebar.tsx` 2026-05-17. Toggle button in ChatInterface toolbar; lists all artifacts across messages with click-to-open.
- [x] **In-Chat File Viewer (PDF/Code/Office).**
  - [x] Implemented at `apps/web/src/components/KnowledgeSourceViewer.tsx` (Phase 38.4). All rag-file-viewer-p38 tests pass.
- [x] **MCP Marketplace & One-Click Install.**
  - [x] Implemented at `apps/web/src/components/McpMarketplace.tsx` (Phase 37.2). All mcp-marketplace tests pass.
- [x] **Public OpenAPI Spec.**
  - [x] Served OpenAPI 3.1 JSON at `GET /api/openapi.json` and `GET /api/v1/openapi.json`.
  - [x] Spec covers existing authenticated `/api/v1` REST resources, `/api/v1/chat/completions`, `/api/v1/ws`, Bearer API keys, and `x-api-key`.
  - [x] Verified with `node --test tests/public-api.test.mjs`, `pnpm -C apps/web typecheck`, `pnpm -C apps/web lint`, and `pnpm -C apps/web build` on 2026-05-17.

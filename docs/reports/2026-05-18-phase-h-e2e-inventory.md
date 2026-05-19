# Phase H E2E Synthetic Coverage Inventory

Verified on 2026-05-18 from `/home/coxar/projects/AgentHub`.

## Summary

`apps/web/tests/e2e/specs/phase-h` had 20 specs using `page.setContent(...)` as synthetic browser contracts before this pass. All 20 have now been converted to app-backed flows that load authenticated app routes, exercise real components, and assert tRPC-backed, persisted, or routed network state where applicable.

Converted on 2026-05-18:

- `a2a-delegation.spec.ts`
- `agent-builder-assistant.spec.ts`
- `artifacts.spec.ts`
- `file-mentions.spec.ts`
- `hitl-approvals.spec.ts`
- `heterogeneous-runtime.spec.ts`
- `image-generation.spec.ts`
- `iterative-orchestration.spec.ts`
- `kb-file-viewer.spec.ts`
- `local-media-services.spec.ts`
- `memory-maintenance.spec.ts`
- `mcp-transport-parity.spec.ts`
- `page-history.spec.ts`
- `prompt-refinement.spec.ts`
- `projects-notebooks.spec.ts`
- `reasoning-timeline.spec.ts`
- `remote-marketplace.spec.ts`
- `sandbox-workflow.spec.ts`
- `tool-profiles.spec.ts`
- `working-panel.spec.ts`

The local media conversion exposed a real app issue: local media service rows could be absent while provider health data was unavailable. `LocalMediaSettings` now renders the known local service catalog immediately and overlays health status when available.

The tool profile conversion exposed a real reload/persistence issue: the sidebar `agents.list` hydration path dropped persisted `toolProfile`, `deniedTools`, route policy, fallback model, voice provider, and knowledge base fields. `Sidebar` now preserves those fields when repopulating the chat store, and `AgentBuilder` falls back to the legacy-compatible `full` profile if an older agent lacks explicit profile metadata.

The projects/notebooks conversion now exercises the real `/projects` route: it creates a project, links a fixture agent into project scope through the UI, creates and searches a notebook document, reloads, and verifies that the linked scope and notebook content persist. `ProjectsManager` now exposes stable accessible labels for project, resource-link, and notebook controls, and the E2E reset helper removes E2E projects between runs.

The iterative orchestration conversion now exercises the real group builder: it seeds Author, Editor, and Reviser agents, selects the persisted `iterative` pattern, assigns the expected roles, saves the group, reloads the app, and verifies the saved group still appears with all three members. This conversion also exposed Trusted Types CSP reports from Mermaid rendering inside the group pattern visualizer. `PatternVisualizer` now renders orchestration nodes and edges with React instead of the Mermaid runtime, and the CSP Trusted Types allowlist includes the Next.js bundler policy plus the dedicated Mermaid policy used only by `MermaidBlock`.

The memory maintenance conversion now exercises the real Memory editor: it seeds shared and agent-specific accepted memories through the E2E database fixture, verifies the shared and agent-specific scope filters in the running UI, runs the maintenance review mutation, applies the proposed category-normalization suggestion, and verifies the normalized persisted entry plus the empty-suggestion state for the current scope.

The page history conversion now exercises the real `/pages` route: it seeds a page with three persisted version snapshots, verifies version attribution in the Edit history panel, selects two versions to activate the compare query and diff summary, restores the original version, and verifies the restored title through the running UI.

The reasoning timeline conversion now exercises real chat metadata hydration: it seeds a chat session with an assistant message carrying persisted `reasoningTimeline` metadata, opens that session through the sidebar, verifies the collapsed timeline summary duration, expands to inspect provider-visible metadata/content, and collapses it again.

The prompt refinement and working panel conversions now exercise the real chat composer and real agent working panel tabs from the app shell.

The artifacts conversion now seeds persisted assistant artifact metadata, opens the real artifact panel, verifies Preview/Code modes, and checks iframe referrer policy. This exposed a real Trusted Types runtime failure for iframe `srcdoc`; the shared artifact panel now assigns sanitized trusted `srcdoc` through a dedicated Trusted Types policy, and the app CSP allowlist includes that policy.

The image generation, KB file viewer, sandbox workflow, and file mention conversions now seed real chat/session metadata or drive the real composer upload path. They verify generated image rendering, source viewer opening, sandbox output downloads/chart metadata, file snapshot chips, and rendered file mention cards through the running app.

The remote marketplace conversion opens the real Marketplace view, routes a deterministic remote catalog tRPC response, and verifies the real Remote tab, install/fork actions, and preview panel without depending on an external marketplace index.

The agent builder assistant conversion opens the real New Agent builder and uses the actual preview mutation. This exposed a real empty-form validation bug: the UI sent `current.name: ""` even though the preview schema accepts only non-empty names. `AgentBuilderAssistant` now sanitizes blank current-form fields before previewing.

The HITL approval conversion creates a real chat session, routes chat stream SSE events for both action approvals and legacy checkpoints, verifies the unified approval panel, and posts approve/reject decisions to the real checkpoint endpoint. The approval panel now exposes stable test IDs for tool-action approvals and legacy checkpoints.

## Remaining Synthetic Phase H Specs

None. Verified with:

```bash
rg -n "page\.setContent" apps/web/tests/e2e/specs/phase-h -g '*.ts'
```

## Verification

Passed:

```bash
node --test tests/a2a-protocol.test.mjs tests/heterogeneous-runtime.test.mjs tests/mcp-transport-parity.test.mjs tests/media-provider-parity.test.mjs
pnpm -C apps/web typecheck
pnpm -C apps/web build
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/local-media-services.spec.ts tests/e2e/specs/phase-h/a2a-delegation.spec.ts tests/e2e/specs/phase-h/heterogeneous-runtime.spec.ts tests/e2e/specs/phase-h/mcp-transport-parity.spec.ts --project=chromium
node --test tests/tool-profiles.test.mjs
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/tool-profiles.spec.ts --project=chromium
node --test tests/projects-notebooks-p40.test.mjs tests/desktop-navigation.test.mjs tests/mobile-ux.test.mjs
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/projects-notebooks.spec.ts --project=chromium
node --test tests/iterative-orchestration.test.mjs tests/todo-roadmap-sync.test.mjs
node --test tests/pattern-visualizer.test.mjs tests/web-security.test.mjs tests/iterative-orchestration.test.mjs
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/iterative-orchestration.spec.ts --project=chromium
node --test tests/memory-maintenance.test.mjs
pnpm -C apps/web typecheck
pnpm -C apps/web lint
pnpm -C apps/web build
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/memory-maintenance.spec.ts --project=chromium
node --test tests/page-history-p40.test.mjs tests/reasoning-timeline.test.mjs
pnpm -C apps/web typecheck
pnpm -C apps/web lint
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/page-history.spec.ts --project=chromium
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/reasoning-timeline.spec.ts --project=chromium
node --test tests/prompt-refinement.test.mjs tests/agent-working-panel.test.mjs tests/artifacts.test.mjs tests/artifact-security.test.mjs tests/web-security.test.mjs tests/image-generation.test.mjs tests/rag-file-viewer-p38.test.mjs tests/sandbox-workflow.test.mjs tests/file-mentions.test.mjs tests/remote-marketplace.test.mjs tests/agent-builder-assistant.test.mjs tests/hitl-approvals.test.mjs
pnpm -C apps/web typecheck
pnpm -C apps/web lint
pnpm -C apps/web build
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/prompt-refinement.spec.ts --project=chromium
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/working-panel.spec.ts --project=chromium
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/artifacts.spec.ts --project=chromium
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/image-generation.spec.ts --project=chromium
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/kb-file-viewer.spec.ts --project=chromium
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/sandbox-workflow.spec.ts --project=chromium
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/file-mentions.spec.ts --project=chromium
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/remote-marketplace.spec.ts --project=chromium
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/agent-builder-assistant.spec.ts --project=chromium
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_BASE_URL=http://127.0.0.1:3100 AGENTHUB_ENABLE_DEV_LOGIN=1 pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/hitl-approvals.spec.ts --project=chromium
```

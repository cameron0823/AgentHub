# AgentHub E2E Semantic Debugging Report

Date: 2026-05-17
Last updated: 2026-05-19
Checkout: `/home/coxar/projects/AgentHub`

## Scope

This pass evaluated and repaired the current dirty checkout as-is. It focused on real project gates, runtime/E2E behavior, schema/application alignment, standalone packaging, and whether the current local tree can be operated through its documented health gates.

## Final Verification Summary

The latest local pass is green for the current checkout.

| Command                                                                                                                                                                                                                              | Latest Result                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                     | Passed                                    |
| `pnpm exec turbo run test --force`                                                                                                                                                                                                   | Passed                                    |
| `pnpm exec turbo run typecheck --force`                                                                                                                                                                                              | Passed                                    |
| `pnpm exec turbo run lint --force`                                                                                                                                                                                                   | Passed                                    |
| `pnpm exec turbo run build --force`                                                                                                                                                                                                  | Passed                                    |
| `pnpm audit --audit-level=moderate`                                                                                                                                                                                                  | Passed: no known vulnerabilities          |
| `pnpm -C apps/web i18n:check`                                                                                                                                                                                                        | Passed for `ar`, `en`, `es`, and `fr`     |
| `pnpm -C apps/web db:pglite:smoke`                                                                                                                                                                                                   | Passed                                    |
| `pnpm db:migrate`                                                                                                                                                                                                                    | Passed                                    |
| `DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_OLLAMA=1 OLLAMA_URL=http://localhost:11434 SEARXNG_BASE_URL=http://localhost:18080 E2E_BASE_URL=http://127.0.0.1:3100 pnpm -C apps/web test:e2e` | Passed: 77 tests                          |
| `pnpm -C apps/desktop prepare:web`                                                                                                                                                                                                   | Passed                                    |
| `pnpm -C apps/desktop test:e2e`                                                                                                                                                                                                      | Passed: 7 tests                           |
| `curl --max-time 8 -i http://127.0.0.1:3100/api/health`                                                                                                                                                                              | Passed: HTTP 200, `status:"ok"`           |
| `curl --max-time 8 -i http://127.0.0.1:3100/api/health/dependencies`                                                                                                                                                                 | Passed: HTTP 200, bounded dependency JSON |

The latest `pnpm validate` pass included 640 web tests with 0 failures, plus the workspace typecheck, test, lint, and build gates.

## Fixes Completed

### 1. Production build and standalone serving

The earlier standalone build/static asset path failure no longer reproduces. `pnpm exec turbo run build --force` passes, and `apps/web/scripts/prepare-standalone-assets.mjs` prepares `.next/static` and `public` assets for the standalone server used by Playwright and desktop packaging.

### 2. Migration reproducibility

The Drizzle journal now applies the extended migration set. `pnpm db:migrate` passes on the live database, and a throwaway fresh database verification applied migrations and produced 51 public tables including key feature tables such as `channel_accounts`, `daily_briefs`, `installed_skills`, `pages`, `projects`, and `resources`.

### 3. Dependency health behavior

`/api/health/dependencies` now uses bounded probes and returns actionable JSON instead of hanging behind an unavailable dependency. The latest standalone health check returned healthy statuses for database, object storage, auth, and Ollama. Redis, search, LM Studio, and vLLM were reported as not configured in the standalone shell environment rather than hanging or failing the health route.

### 4. Web E2E setup and live model coverage

Playwright now runs against the standalone server with prepared assets. Live Ollama tests are serialized when `E2E_OLLAMA=1` to avoid local model contention. The E2E fixture clears stale E2E-user chat sessions so the active chat state is deterministic.

The full live-model web E2E run passed: 77 tests.

### 5. Chat, agent, and group runtime defects

The live browser pass found and fixed several product/runtime issues:

- Agent start-chat race: pending session creation now clears the active session so messages cannot be sent into the previously active chat.
- Group SSE mismatch: `/api/groups/stream` now wraps orchestrator events in the same `orchestrator_event` envelope consumed by the chat UI.
- Group completion rendering: group synthesis messages expose `group-complete` and `synthesis-panel` markers through persisted metadata.
- Working panel robustness: nonstandard or historical tool-call-like metadata no longer crashes the run-log panel.
- Local provider selector determinism: the browser spec creates a normal chat before asserting model selector fallback behavior.

### 6. Desktop smoke contract

Desktop smoke E2E now matches the current dev-login implementation, including `AGENTHUB_ENABLE_DEV_LOGIN` and `E2E_ENABLE_DEV_LOGIN`. `pnpm -C apps/desktop test:e2e` passes.

## Current Findings

### No active release-gate failures remain in the latest local pass.

All commands listed in the final verification summary passed in the latest 2026-05-19 verification pass.

### The checkout is still heavily dirty.

This report describes the local dirty checkout, not a clean remote branch. Release readiness still requires grouping, reviewing, committing, and syncing intentional changes.

### Some Phase H browser specs remain contract-style rather than deep app-backed workflows.

The web suite is green, but several Phase H specs still use synthetic/component-style assertions. They are useful guardrails, but future completion hardening should convert the highest-risk ones into app-backed flows with persisted state or network/API effects.

## Remaining Task List

### P0: Preserve release gates

1. Keep all completion gates in `TODO.md` green before merge or release.
2. Re-run the full gate set after migration, auth, provider, Playwright, desktop, or packaging changes.
3. Add any newly failing command back to `TODO.md` with evidence and root-cause tasking.

### P1: Deepen app-backed coverage

1. Inventory remaining `page.setContent(...)` specs under `apps/web/tests/e2e/specs/phase-h`.
2. Move pure component contracts out of E2E when they do not exercise the running app.
3. Convert high-risk synthetic checks into `page.goto(...)` flows.
4. Add DB/API assertions for major runtime features.

### P1: Expand external-service proof

1. Add a Casdoor-compatible local OAuth path beyond dev credentials.
2. Add deeper Redis worker proof for queued automation/task processing.
3. Add deeper MinIO proof for presign, upload, persisted file metadata, and rendered resource retrieval.
4. Add MCP execution proof for allowed and rejected tools.
5. Add public API streaming compatibility proof with API key auth.

### P2: Release hygiene

1. Normalize the dirty working tree into intentional commits or a tracked implementation branch.
2. Keep migrations, schema, tests, routes, packages, and docs grouped together.
3. Re-run the completion gates on the exact tree intended for release.
4. Check local/remote branch sync before claiming GitHub release readiness.

## Completion Assessment

AgentHub is locally green against the current completion gates as of 2026-05-17. The project should be treated as functionally verified on this machine for the current dirty checkout, with remaining work focused on release hygiene, remote sync, and deeper app-backed proof for lower-risk contract-style Phase H surfaces.

# AgentHub GitHub Issues Audit

Verified on 2026-05-17 from `/home/coxar/projects/AgentHub`.
Updated on 2026-05-19 for `#4` formatting evidence, `#10` PGlite migration/runtime smoke evidence, `#18` OpenAPI plugin install/execution UX, `#33` Vitest service-unit coverage, `#35` full Playwright MVP suite evidence, desktop packaging evidence, frozen install evidence, and standalone health evidence.

## Scope

GitHub currently has 45 open issues in `cameron0823/AgentHub`, numbered `#2` through `#46`. This audit tracks which issues have local implementation evidence, which are still blocked, and which must not be closed yet.

## Closure Policy

Do not close GitHub issues from local-only evidence while the implementation remains uncommitted and unpushed. Close issues only after one of these is true:

- The implementation is committed and pushed to the branch referenced in the issue closure comment.
- The issue is explicitly obsolete and the closure comment explains the replacement decision.
- The issue is an epic and every child issue is closed or intentionally superseded.

Current state: no issues were closed in this pass because the worktree is heavily dirty and ahead of what GitHub can verify.

## Newly Implemented In This Pass

| Issue                                               | Local status     | Evidence                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#4` FOUND-3 lint/format/husky/commitlint           | Ready after land | Added Husky commit-msg hook, Commitlint config, Prettier config, root scripts, and `tests/commit-tooling.test.mjs`. `pnpm format:check` passes after repository Prettier normalization on 2026-05-18.                                                                      |
| `#10` ARCH-3 dual DB client                         | Ready after land | Added `AGENTHUB_DB_DRIVER` Postgres/PGlite selection, PGlite dependency, dual Drizzle client switch, PGlite-aware dependency health, pgvector/pg_trgm PGlite runtime extension loading, `tests/dual-db-client.test.mjs`, and `pnpm -C apps/web db:pglite:smoke`.           |
| `#18` CORE-6 OpenAPI plugin loader                  | Ready after land | Added guarded parsing/loading, install-from-JSON/URL UX, governed persistence as `source: "openapi"` package records, generated tool inventory in Marketplace/Tools Manager/Agent Builder, and selected-tool runtime injection with guarded, abort-bounded HTTP execution. |
| `#33` QA-1 Vitest unit suite for services           | Ready after land | Added `tests/service-unit.vitest.test.ts` covering MCP config, tool profile, and media safety services. Root `pnpm validate` now runs `pnpm test:vitest`, and `tests/vitest-harness.test.mjs` guards the CI/validation wiring. `pnpm validate` passed on 2026-05-18.       |
| `#35` QA-3 Playwright MVP suite                     | Ready after land | Full web E2E suite passed 77/77 on 2026-05-19 against the standalone app with Docker-backed services, live local Ollama, and SearXNG using the final MVP Playwright command listed below.                                                                                  |
| `#36` QA-4 pino logging + traceId middleware        | Ready after land | Added pino logger, redaction, pure trace constants, and Next middleware propagation for `x-agenthub-trace-id`/`x-request-id`.                                                                                                                                              |
| `#37` QA-5 Sentry optional flag                     | Ready after land | Added opt-in Sentry initializer, config env vars, and server externalization so disabled Sentry does not add build warnings.                                                                                                                                               |
| `#38` QA-6 health + metrics endpoints               | Ready after land | Existing health endpoints remain, and `/api/metrics` now emits Prometheus-compatible process metrics.                                                                                                                                                                      |
| `#40` QA-9 release checklist + changelog automation | Ready after land | Added `CHANGELOG.md`, `docs/deployment/release-checklist.md`, `scripts/generate-changelog.mjs`, root changelog scripts, and `tests/release-checklist.test.mjs`.                                                                                                            |

## Already Implemented Locally, Still Needs Land/Issue Closure

These issues have strong local evidence in source, docs, or tests but remain open on GitHub. Reverify on the final branch before closing:

`#2`, `#3`, `#5`, `#6`, `#7`, `#8`, `#9`, `#11`, `#12`, `#13`, `#14`, `#15`, `#16`, `#17`, `#19`, `#20`, `#21`, `#22`, `#23`, `#24`, `#25`, `#26`, `#27`, `#28`, `#29`, `#30`, `#31`, `#32`, `#34`, `#39`, `#46`.

## Must Stay Open

| Issue | Reason                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `#4`  | Formatting/tooling proof now exists locally, but the implementation still must be committed, pushed, and reverified before closure.        |
| `#10` | PGlite migration/runtime proof now exists locally, but the implementation still must be committed, pushed, and reverified before closure.  |
| `#18` | OpenAPI install/execution proof now exists locally, but the implementation still must be committed, pushed, and reverified before closure. |
| `#35` | Full Playwright proof now exists locally, but the implementation still must be committed, pushed, and reverified before closure.           |
| `#41` | Epic; close only after discovery/product-definition children are closed or superseded.                                                     |
| `#42` | Epic; close only after local skeleton children are closed or superseded.                                                                   |
| `#43` | Epic; close only after core MVP children are closed or superseded.                                                                         |
| `#44` | Epic; close only after reliability/deploy children are closed or superseded.                                                               |
| `#45` | Epic; close only after polish/parity children are closed or superseded.                                                                    |

## Verification Run In This Pass

Passed:

```bash
node --test tests/observability.test.mjs tests/desktop-navigation.test.mjs tests/desktop-services.test.mjs tests/deployment-docs.test.mjs
node --test tests/commit-tooling.test.mjs
node --test tests/dual-db-client.test.mjs tests/desktop-services.test.mjs
node --test tests/openapi-plugin-loader.test.mjs tests/remote-marketplace.test.mjs
node --test tests/openapi-plugin-loader.test.mjs tests/vitest-harness.test.mjs
node --test tests/release-checklist.test.mjs
node --test tests/vitest-harness.test.mjs
pnpm changelog:check
pnpm format:check
pnpm install --frozen-lockfile
pnpm test:vitest
pnpm test:vitest:coverage
pnpm validate
pnpm audit --audit-level=high
pnpm -C apps/web i18n:check
pnpm -C apps/web db:pglite:smoke
pnpm db:migrate
pnpm -C apps/web typecheck
pnpm -C apps/web build
pnpm -C apps/web lint
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_OLLAMA=1 OLLAMA_URL=http://localhost:11434 SEARXNG_BASE_URL=http://localhost:18080 E2E_BASE_URL=http://127.0.0.1:3100 pnpm -C apps/web test:e2e
pnpm -C apps/desktop prepare:web
pnpm -C apps/desktop test:e2e
node apps/web/scripts/prepare-standalone-assets.mjs
curl --max-time 8 -i http://127.0.0.1:3100/api/health
curl --max-time 8 -i http://127.0.0.1:3100/api/health/dependencies
```

No known failing verification remains in this issue-audit slice after the 2026-05-19 updates. Full release gates still must be rerun on the exact branch intended for closure.

## Next Tasks For 100% Issue Completion

1. Commit or otherwise land the current local implementation so GitHub issue closures can reference actual repository evidence.
2. Land the formatting/tooling work for `#4` and re-run `pnpm format:check` on the final branch.
3. Use the PGlite smoke evidence for `#10` only after the local implementation is landed and reverified: `pnpm -C apps/web db:pglite:smoke`.
4. Use the OpenAPI plugin install/execution evidence for `#18` only after the local implementation is landed and reverified.
5. Use the Vitest service-suite evidence for `#33` only after the local implementation is landed and reverified: `pnpm test:vitest`.
6. Use the full Playwright MVP suite evidence for `#35` only after the local implementation is landed and reverified with Docker services, live local Ollama, SearXNG, and the intended database.
7. Close non-epic issues in batches with closure comments that cite paths and validation commands.
8. Close epics `#41` through `#45` last, after their child issue evidence is complete.

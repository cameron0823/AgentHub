# AgentHub

AgentHub is a self-hostable AI workspace for building, running, and reviewing agent workflows. The current app is a Next.js 15 web application with NextAuth + Casdoor auth, PostgreSQL + pgvector persistence, Redis + BullMQ queues, MinIO / S3-compatible storage, SearXNG search, and local or OpenAI-compatible model providers.

The project is designed to keep local-first workflows practical, but the checked-in stack is not SQLite-only or fully offline. Production deployments need the services listed in this README or managed equivalents. See [`docs/adr/0002-local-first-sync-strategy.md`](./docs/adr/0002-local-first-sync-strategy.md) for the current sync/data-plane decision.

## Current Stack

| Area                  | Current implementation                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Web app               | Next.js 15 App Router, React 18, Tailwind CSS, tRPC                                                     |
| Auth                  | NextAuth + Casdoor OIDC, with a dev credentials path for local testing                                  |
| Database              | PostgreSQL + pgvector through Drizzle                                                                   |
| Queue and workers     | Redis + BullMQ; workers run inside the Next.js server process through `apps/web/src/instrumentation.ts` |
| Object storage        | MinIO / S3-compatible storage through `S3_*` environment variables                                      |
| Search                | SearXNG through `SEARXNG_BASE_URL`                                                                      |
| Local model providers | Ollama, LM Studio, and vLLM through `OLLAMA_URL`, `LMSTUDIO_URL`, and `VLLM_URL`                        |
| Desktop shell         | Electron shell work is in progress; desktop-only native capabilities stay scoped behind IPC             |

## Features In This Checkout

- Multi-agent chat and task execution with streaming responses.
- Agent builder, skills, tool profiles, and policy review surfaces.
- Knowledge-base ingestion, RAG, page notebooks, citations, and artifact workflows.
- Automations, scheduled runs, Daily Brief generation, and nightly Agent Signal self-review.
- Health endpoints at `/api/health` and `/api/health/dependencies`.
- Prometheus-compatible process metrics at `/api/metrics`.
- Postgres is the default database driver; set `AGENTHUB_DB_DRIVER=pglite` for local-first PGlite experiments.
- Docker Compose for the production-like local stack.

## Local Development

### Prerequisites

- Node.js 20+
- pnpm 9 through Corepack
- Docker for PostgreSQL, Redis, MinIO, Casdoor, and SearXNG
- Optional local model runtimes: Ollama, LM Studio, or vLLM

### Install

```bash
corepack enable
pnpm install
cp .env.example .env.local
```

Generate real secrets before using the environment file outside a throwaway local run:

```bash
openssl rand -base64 32
```

Use separate values for `NEXTAUTH_SECRET` and `TRUST_ENGINE_SECRET`.

### Start supporting services

For the desktop app, use the one-step local launcher:

```bash
pnpm desktop
```

It starts the local Docker services, waits for PostgreSQL, applies migrations,
and launches the Electron desktop shell. Use `pnpm desktop -- --dry-run` to see
the exact startup sequence without launching anything. If a default local port is
already in use, the launcher assigns a free host port and passes the matching
environment values to the desktop runtime.

For local development, the root compose file can start the backing services:

```bash
docker compose up -d postgresql redis minio minio-init casdoor searxng
```

The compose stack defaults to PostgreSQL on `5432`, Redis on `6379`, Casdoor on
`8000`, SearXNG on `8080`, MinIO API on `9000`, and MinIO Console on `9001`.
Those host ports can be overridden with `POSTGRES_HOST_PORT`, `REDIS_HOST_PORT`,
`CASDOOR_HOST_PORT`, `SEARXNG_HOST_PORT`, `MINIO_HOST_PORT`, and
`MINIO_CONSOLE_HOST_PORT`.

### Prepare the database

```bash
pnpm db:push
```

`pnpm db:push` applies the Drizzle schema to the PostgreSQL database in `DATABASE_URL`. Use `pnpm db:generate` only when intentionally generating a new migration from schema changes.

For local-first PGlite experiments, use the dedicated smoke runner instead of
the PostgreSQL migration command:

```bash
pnpm -C apps/web db:pglite:smoke
```

The smoke runner creates a temporary PGlite data directory by default, registers
the pgvector and pg_trgm extensions, applies every checked-in Drizzle SQL
migration in journal order, checks required vector indexes and tables, then
reopens the app runtime database client with `AGENTHUB_DB_DRIVER=pglite`.

### Run the app

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Production Deployment

Deployment docs live under `docs/deployment/`:

| Target         | Guide                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Docker Compose | [`docs/deployment/docker-compose-production.md`](./docs/deployment/docker-compose-production.md) |
| Vercel         | [`docs/deployment/vercel.md`](./docs/deployment/vercel.md)                                       |
| Zeabur         | [`docs/deployment/zeabur.md`](./docs/deployment/zeabur.md)                                       |
| Sealos         | [`docs/deployment/sealos.md`](./docs/deployment/sealos.md)                                       |

Minimum production services:

- AgentHub web app container or platform deployment.
- PostgreSQL + pgvector.
- Redis for BullMQ queues.
- MinIO / S3-compatible storage.
- Casdoor for OIDC auth.
- SearXNG for web search when search tools are enabled.
- Reachable Ollama, LM Studio, vLLM, or another configured model provider.

Run these checks after deployment:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/health/dependencies
curl http://localhost:3000/api/metrics
```

## Verification Commands

Commands are discovered from the repository scripts:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm -C apps/web db:pglite:smoke
pnpm -C apps/web exec playwright test --list
```

Use focused Node tests during feature work, for example:

```bash
pnpm exec node --test tests/deployment-docs.test.mjs
```

For app-backed web E2E, start the backing services, apply migrations to the
test database, then run the Playwright wrapper from the web package:

```bash
docker compose up -d postgresql redis minio minio-init casdoor searxng
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e pnpm db:migrate
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e E2E_OLLAMA=1 OLLAMA_URL=http://localhost:11434 E2E_BASE_URL=http://127.0.0.1:3100 pnpm -C apps/web test:e2e
```

For release candidates, follow the complete gate list in [`TODO.md`](./TODO.md)
and [`docs/deployment/release-checklist.md`](./docs/deployment/release-checklist.md).

## Project Docs

| Document                                             | Purpose                                    |
| ---------------------------------------------------- | ------------------------------------------ |
| [`TODO.md`](./TODO.md)                               | Canonical active roadmap and release gates |
| [`REQUIREMENTS_AUDIT.md`](./REQUIREMENTS_AUDIT.md)   | Feature coverage audit                     |
| [`DESIGN.md`](./DESIGN.md)                           | System design reference                    |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md)               | Technical architecture reference           |
| [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) | Phased implementation plan                 |
| [`RESEARCH.md`](./RESEARCH.md)                       | LobeHub and local AI ecosystem research    |
| [`docs/auth.md`](./docs/auth.md)                     | Current NextAuth + Casdoor auth contract   |

## Done When

A deployment is considered ready when the app starts, `pnpm db:push` has applied the schema, `/api/health` returns `ok`, `/api/health/dependencies` reports the expected configured services, login works through Casdoor or the intended auth path, object uploads reach S3-compatible storage, and worker-backed tasks can enqueue and complete through Redis.

## License

MIT License. See [LICENSE](./LICENSE).

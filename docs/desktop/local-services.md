# Desktop Local Services

AgentHub Desktop starts with detection and status reporting. It must not start Docker, apply migrations, or terminate unrelated processes during initial launch.

## Service Ledger

The desktop service ledger tracks web, database, Redis, object storage, auth, search, Ollama, LM Studio, and vLLM. Missing services map to actionable states such as `start-docker`, `open-settings`, `open-docs`, or `retry`.

## Dependency Health

The web app exposes `/api/health/dependencies` for desktop startup diagnostics. It checks the database with `select 1` and reports only status, configuration booleans, actions, and sanitized errors. It must not return connection strings or credential values.

## Docker Compose

Docker Compose orchestration is opt-in. Detection can run `docker compose ps`, but startup requires an explicit user action before `docker compose up -d postgresql redis minio minio-init`.

In the desktop runtime UI, Casdoor startup remains manual until the production desktop auth mode is finalized. The one-step local development launcher below is an explicit CLI action and can start Casdoor with the rest of the local service stack.

## One-Step Local Desktop Startup

The user-facing one-step command is:

```bash
pnpm desktop
```

The command is implemented by `scripts/start-desktop.mjs`. It starts the local
Docker services, waits for PostgreSQL readiness, applies `pnpm db:migrate`, and
then launches the existing desktop development flow with
`pnpm -C apps/desktop dev`.

If a default compose host port is already occupied, the launcher selects a free
host port and updates the runtime environment before migrations and desktop
launch. This avoids failures when another local stack already owns ports such as
`8080`.

Use these switches only when another tool is already managing that phase:

```bash
pnpm desktop -- --dry-run
pnpm desktop -- --skip-install
pnpm desktop -- --skip-services
pnpm desktop -- --skip-migrate
pnpm desktop -- --skip-launch
```

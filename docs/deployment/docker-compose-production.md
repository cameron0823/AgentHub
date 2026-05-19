# Docker Compose Production Deployment

This guide describes the production-like Docker Compose stack checked into this repository. It starts AgentHub plus PostgreSQL + pgvector, Redis, MinIO, Casdoor, and SearXNG.

The compose services are:

| Service      | Purpose                                                                |
| ------------ | ---------------------------------------------------------------------- |
| `agenthub`   | Next.js 15 app built from `Dockerfile`                                 |
| `postgresql` | `pgvector/pgvector:pg16` database for Drizzle tables and vector fields |
| `redis`      | Redis broker for Redis + BullMQ queues                                 |
| `minio`      | S3-compatible object storage                                           |
| `minio-init` | Creates the configured MinIO bucket                                    |
| `casdoor`    | OIDC identity provider for NextAuth + Casdoor                          |
| `searxng`    | Self-hosted web search endpoint                                        |
| `network`    | Shared network namespace exposing app and service ports                |

The workers run inside the Next.js server process through `apps/web/src/instrumentation.ts`. Do not add a separate worker container until the queue workers have been split from the web process.

## 1. Prepare the environment

```bash
cp .env.example .env
openssl rand -base64 32
openssl rand -base64 32
```

Set unique production values for `NEXTAUTH_SECRET` and `TRUST_ENGINE_SECRET`. Keep `DATABASE_URL`, `POSTGRES_*`, `S3_*`, and `REDIS_*` consistent with the compose defaults unless you are pointing to managed services.

Required production variables:

```bash
DATABASE_URL=postgresql://agenthub:agenthub_password@localhost:5432/agenthub
POSTGRES_DB=agenthub
POSTGRES_USER=agenthub
POSTGRES_PASSWORD=agenthub_password
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generated-secret>
AUTH_CASDOOR_ISSUER=http://localhost:8000
AUTH_CASDOOR_ID=agenthub
AUTH_CASDOOR_SECRET=agenthub_secret
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=agenthub
S3_ACCESS_KEY_ID=agenthub_minio_user
S3_SECRET_ACCESS_KEY=agenthub_minio_password
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
SEARXNG_BASE_URL=http://localhost:8080
TRUST_ENGINE_SECRET=<generated-secret>
```

Optional provider variables:

```bash
OLLAMA_URL=http://localhost:11434
LMSTUDIO_URL=http://localhost:1234
VLLM_URL=http://localhost:8000
```

If Casdoor is bound to `8000`, run vLLM on a different host or port and update `VLLM_URL`.

## 2. Start backing services

```bash
docker compose up -d postgresql redis minio minio-init casdoor searxng
```

Wait until the service health checks are ready:

```bash
docker compose ps
```

## 3. Apply the database schema

Run migrations from the repository checkout with `.env` or `.env.local` pointing at the compose PostgreSQL instance:

```bash
pnpm install --frozen-lockfile
pnpm db:push
```

`pnpm db:push` is required before starting a fresh production app because the standalone runtime image does not run schema changes automatically.

## 4. Build and start AgentHub

```bash
docker compose up -d --build agenthub
```

## 5. Verify health

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/health/dependencies
curl http://localhost:9000/minio/health/live
curl http://localhost:8080
```

The dependency health endpoint should report configured database, Redis, object storage, auth, and search services. Local model endpoints can be `not-configured` unless you enabled those providers.

## 6. Backup and restore

Create a backup directory:

```bash
mkdir -p backups
```

Back up PostgreSQL:

```bash
docker compose exec postgresql pg_dump -U agenthub -d agenthub -Fc > backups/agenthub.dump
```

Restore PostgreSQL:

```bash
cat backups/agenthub.dump | docker compose exec -T postgresql pg_restore -U agenthub -d agenthub --clean --if-exists
```

Back up MinIO with the MinIO client:

```bash
mc alias set agenthub http://localhost:9000 agenthub_minio_user agenthub_minio_password
mc mirror agenthub/agenthub backups/minio-agenthub
```

Restore MinIO:

```bash
mc mirror backups/minio-agenthub agenthub/agenthub
```

Redis is used for BullMQ queue state. For normal deployments, drain queues before maintenance. If you need durable Redis recovery, stop writes and preserve `data/redis` or create an RDB snapshot before replacing the service.

## Done when

The deployment is ready when `docker compose ps` is healthy, `pnpm db:push` has completed, `/api/health` returns `ok`, `/api/health/dependencies` shows the expected configured services, Casdoor login works, uploads reach the `S3_BUCKET`, and a worker-backed task can enqueue and finish through Redis.

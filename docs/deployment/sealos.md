# Sealos Deployment

Sealos can host AgentHub as an app plus persistent backing services. Use this guide when deploying the existing Next.js container and managed or self-hosted dependencies.

## Required services

| Service               | Requirement                                           |
| --------------------- | ----------------------------------------------------- |
| AgentHub web          | Build from `Dockerfile` or a Next.js 15 build command |
| PostgreSQL + pgvector | Persistent database with pgvector enabled             |
| Redis                 | Persistent or managed Redis for Redis + BullMQ        |
| S3-compatible storage | MinIO, RustFS, or another S3-compatible service       |
| Casdoor               | Reachable OIDC issuer                                 |
| SearXNG               | Reachable search endpoint                             |

Attach persistent volumes to PostgreSQL, Redis if you need queue durability, object storage, and Casdoor file storage.

## Environment variables

Configure the AgentHub app with Sealos service DNS names or managed endpoints:

```bash
DATABASE_URL=<postgres-url>
NEXTAUTH_URL=https://<agenthub-domain>
NEXTAUTH_SECRET=<generated-secret>
AUTH_CASDOOR_ISSUER=https://<casdoor-domain>
AUTH_CASDOOR_ID=<casdoor-client-id>
AUTH_CASDOOR_SECRET=<casdoor-client-secret>
S3_ENDPOINT=<s3-compatible-endpoint>
S3_REGION=<region>
S3_BUCKET=<bucket>
S3_ACCESS_KEY_ID=<access-key>
S3_SECRET_ACCESS_KEY=<secret-key>
REDIS_URL=<redis-url>
REDIS_HOST=<redis-host>
REDIS_PORT=<redis-port>
SEARXNG_BASE_URL=https://<searxng-domain>
TRUST_ENGINE_SECRET=<generated-secret>
OLLAMA_URL=<optional-reachable-url>
LMSTUDIO_URL=<optional-reachable-url>
VLLM_URL=<optional-reachable-url>
```

Use different generated values for `NEXTAUTH_SECRET` and `TRUST_ENGINE_SECRET`.

## Database setup

After PostgreSQL + pgvector is reachable, apply the schema from the checkout or CI:

```bash
pnpm install --frozen-lockfile
pnpm db:push
```

## Operational notes

Workers run inside the Next.js server process through `apps/web/src/instrumentation.ts`. Scale the AgentHub app carefully: multiple replicas can start multiple worker instances unless queue concurrency is intentionally configured.

For backups, snapshot the PostgreSQL volume or run `pg_dump`, mirror the S3-compatible bucket, and preserve any Redis data needed for in-flight queue recovery.

## Verify

```bash
curl https://<agenthub-domain>/api/health
curl https://<agenthub-domain>/api/health/dependencies
```

The deployment is ready when the health checks pass, PostgreSQL + pgvector is migrated, Redis is reachable, S3-compatible uploads work, Casdoor login succeeds, SearXNG responds, and a worker-backed task can complete.

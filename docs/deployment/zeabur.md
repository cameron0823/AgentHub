# Zeabur Deployment

Zeabur can run AgentHub as a containerized web service plus managed or template-backed services for PostgreSQL + pgvector, Redis, S3-compatible storage, Casdoor, and SearXNG.

## Services

Create these services in the Zeabur project:

| Service               | Notes                                                                    |
| --------------------- | ------------------------------------------------------------------------ |
| AgentHub web          | Build from the repository `Dockerfile` or the root `pnpm build` workflow |
| PostgreSQL + pgvector | Must support the pgvector extension                                      |
| Redis                 | Used by Redis + BullMQ workers                                           |
| S3-compatible storage | MinIO, RustFS, or a managed S3-compatible provider                       |
| Casdoor               | OIDC issuer for NextAuth + Casdoor                                       |
| SearXNG               | Search endpoint used by web-search tools                                 |

## Environment variables

Set the AgentHub service environment to the service URLs Zeabur provides:

```bash
DATABASE_URL=<zeabur-postgres-url>
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

Use different values for `NEXTAUTH_SECRET` and `TRUST_ENGINE_SECRET`.

## Database setup

Enable pgvector and apply the schema once the database is reachable:

```bash
pnpm install --frozen-lockfile
pnpm db:push
```

## Workers

Workers run inside the Next.js server process through `apps/web/src/instrumentation.ts`. Keep the AgentHub web service configured as a long-running service when relying on scheduled automations, Daily Brief generation, or Agent Signal review jobs.

## Verify

```bash
curl https://<agenthub-domain>/api/health
curl https://<agenthub-domain>/api/health/dependencies
```

The dependency check should report configured PostgreSQL + pgvector, Redis, S3-compatible storage, Casdoor, and SearXNG. Then verify login, upload an object, and enqueue a worker-backed task.

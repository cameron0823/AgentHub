# Vercel Deployment

Vercel is suitable for the AgentHub web app when every stateful dependency is external. Vercel does not run the bundled Docker services, so it cannot host the checked-in PostgreSQL, Redis, MinIO, Casdoor, SearXNG, Ollama, LM Studio, or vLLM containers.

Use this target as a web-only deployment with managed services:

| Need     | Requirement                                                                    |
| -------- | ------------------------------------------------------------------------------ |
| Database | Managed PostgreSQL + pgvector                                                  |
| Queue    | Managed Redis reachable from Vercel                                            |
| Storage  | S3-compatible object storage                                                   |
| Auth     | Hosted Casdoor or another reachable Casdoor instance                           |
| Search   | Hosted SearXNG endpoint                                                        |
| Models   | Public or private-network reachable Ollama, LM Studio, vLLM, or cloud provider |

## Environment variables

Set these in Vercel Project Settings:

```bash
DATABASE_URL=<managed-postgres-with-pgvector>
NEXTAUTH_URL=https://<your-domain>
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
TRUST_ENGINE_SECRET=<different-generated-secret>
OLLAMA_URL=<optional-reachable-url>
LMSTUDIO_URL=<optional-reachable-url>
VLLM_URL=<optional-reachable-url>
```

## Database setup

Enable pgvector on the managed PostgreSQL database, then apply the schema from a trusted machine or CI job:

```bash
pnpm install --frozen-lockfile
pnpm db:push
```

## Deploy

Use the repository root as the Vercel project root. The build command is the repository script:

```bash
pnpm build
```

The web package is a Next.js 15 app in `apps/web`.

## Verify

```bash
curl https://<your-domain>/api/health
curl https://<your-domain>/api/health/dependencies
```

The `/api/health/dependencies` response should show the configured PostgreSQL + pgvector database, Redis, S3-compatible storage, Casdoor, and SearXNG services. Workers currently start from the Next.js instrumentation path, so validate scheduled work carefully on serverless infrastructure before relying on long-running queues.

# AgentHub Auth

AgentHub currently uses NextAuth + Casdoor for application authentication.

Better Auth is not the current runtime auth implementation. The live code uses `NextAuth` in `apps/web/src/server/auth.ts`, the `DrizzleAdapter` from `@auth/drizzle-adapter`, and the Next.js route at `apps/web/src/app/api/auth/[...nextauth]/route.ts`.

The durable architecture decision is recorded in [`docs/adr/0003-auth-stack.md`](./adr/0003-auth-stack.md).

## Runtime Providers

| Provider          | Environment                | Purpose                                                 |
| ----------------- | -------------------------- | ------------------------------------------------------- |
| `casdoor`         | Production and development | OIDC provider backed by Casdoor                         |
| `dev-credentials` | development only           | Local development shortcut that creates a user by email |

The `dev-credentials` provider is included only when `NODE_ENV === "development"`. It accepts an email address, creates the user if needed, and assigns the created development user the `admin` role.

Production login is Casdoor OIDC. The current runtime does not implement Better Auth email/password login, magic links, allowlists, or SSO-only mode.

## Required Environment

```bash
NEXTAUTH_URL=https://<agenthub-domain>
NEXTAUTH_SECRET=<generated-secret>
AUTH_CASDOOR_ISSUER=https://<casdoor-domain>
AUTH_CASDOOR_ID=<casdoor-client-id>
AUTH_CASDOOR_SECRET=<casdoor-client-secret>
```

Use a strong generated `NEXTAUTH_SECRET`. Keep it separate from `TRUST_ENGINE_SECRET`.

Casdoor must register the AgentHub callback URL:

```text
<NEXTAUTH_URL>/api/auth/callback/casdoor
```

## Sessions

AgentHub uses JWT sessions in development and database sessions in production:

```ts
strategy: isDev ? "jwt" : "database";
```

The production database session path is backed by the NextAuth `sessions` table through the Drizzle adapter. The user, account, session, and verification-token tables are defined in `apps/web/src/server/db/schema.ts`.

## Roles

AgentHub stores application roles in `users.role`. The current supported roles are:

| Role    | Meaning                                                       |
| ------- | ------------------------------------------------------------- |
| `user`  | Standard authenticated user                                   |
| `admin` | Can access admin tRPC procedures and role-management surfaces |

The `users.role` column defaults to `user`. Admin-only tRPC procedures use `adminProcedure`, which rejects any authenticated user whose role is not `admin`.

The admin router exposes `users.setRole` with a strict `user` / `admin` enum. Role changes are application-level authorization changes; they are not a Casdoor group-sync implementation.

## Not Implemented

The following features are not implemented in the current runtime:

- Better Auth runtime.
- magic links are not implemented.
- email/password production login is not implemented.
- allowlists are not implemented.
- SSO-only mode is not implemented.
- Casdoor group-to-role synchronization.

## Verification

Use the repository tests to verify auth documentation and role gates:

```bash
pnpm exec node --test tests/auth-reconciliation.test.mjs tests/admin-panel.test.mjs tests/security-coverage.test.mjs
```

Use the local Casdoor OAuth proof when you need to verify OIDC login without the `dev-credentials` provider. This path seeds the local Casdoor `app-built-in` application with AgentHub callback URLs, then signs in through Casdoor as the built-in `admin` user:

```bash
docker compose up -d postgresql casdoor
DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e \
CASDOOR_DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/casdoor \
AUTH_CASDOOR_ID=<local-casdoor-client-id> \
AUTH_CASDOOR_SECRET=<local-casdoor-client-secret> \
E2E_BASE_URL=http://127.0.0.1:3100 \
pnpm -C apps/web exec playwright test tests/e2e/specs/phase-h/casdoor-oauth.spec.ts --project=chromium --workers=1
```

The proof is complete when the browser leaves `localhost:8000`, returns to AgentHub, renders the app home surface, and `/api/auth/session` reports `admin@example.com`. It intentionally creates a fresh browser context without the Playwright dev-credentials storage state.

Broader release checks:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

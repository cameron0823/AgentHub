# ADR 0003: Auth Stack Reconciliation

## Status

Accepted.

## Context

The LobeHub/Kimi parity source documents specify Better Auth with organization, MFA, magic-link, OAuth, allowlist, and SSO-only features. The live AgentHub implementation uses NextAuth with the Drizzle adapter, Casdoor OIDC, a development-only credentials provider, and application roles stored in `users.role`.

AgentHub already has workspace isolation, role-gated admin procedures, Casdoor-backed production login, development login safeguards, and deployment documentation built around the current stack. Migrating the auth runtime inside the wider parity implementation would change session tables, callback routes, middleware behavior, desktop auth assumptions, and deployment operations at the same time as other platform work.

## Decision

AgentHub will keep NextAuth + Casdoor as the current runtime auth stack for this parity pass. Better Auth does not supersede the live implementation until a dedicated migration is planned, schema-mapped, and tested end to end.

The Better Auth features listed in the source docs are explicitly out of scope for the current runtime:

- Better Auth organization plugin.
- Better Auth email/password production login.
- Magic links.
- TOTP MFA.
- User allowlists.
- SSO-only enforcement.

This decision does not block later migration. A future Better Auth migration must provide a migration plan for user, account, session, workspace membership, invitation, callback, desktop, and deployment behavior before replacing the current runtime.

## Consequences

- `docs/auth.md`, README, deployment docs, and environment examples must describe NextAuth + Casdoor, not Better Auth.
- Auth tests must assert that docs match the live NextAuth implementation and that Better Auth env/routes are not claimed.
- Multi-user and admin role gates remain enforced by `authedProcedure`, `adminProcedure`, and `users.role`.
- Better Auth parity remains a future migration project, not an unimplemented hidden dependency in the current release criteria.

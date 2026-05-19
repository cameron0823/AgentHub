# ADR 0001: Electron Desktop Shell Around AgentHub Web

## Status

Accepted.

## Context

AgentHub already has a full Next.js application under `apps/web`, including the product UI, tRPC server, auth wiring, provider configuration, and database-backed workflows. The desktop milestone needs native packaging, local startup control, update handling, and carefully scoped native capabilities without splitting the product into a second renderer implementation.

## Decision

`apps/web remains the canonical product UI` and server runtime. `apps/desktop is a shell` that opens the existing AgentHub web experience in an Electron `BrowserWindow`.

In development, the shell may load an explicit `AGENTHUB_WEB_URL` or start the web app on a loopback-only port. In packaged builds, the shell starts the packaged Next standalone server on `127.0.0.1` with a selected port and then loads that local origin.

The desktop process owns only desktop lifecycle concerns:

- secure Electron window creation
- typed preload bridge
- IPC sender validation
- runtime/service health reporting
- auth callback origin setup
- updater and logging
- opt-in local service startup
- later native capabilities behind explicit feature flags and user intent

## Data Decision

PostgreSQL remains canonical for now. This ADR does not introduce SQLite, local-first sync, automatic data migration, or a second persistence model. Desktop startup can detect missing services and guide setup, but it must not silently replace the existing database architecture.

## Alternatives Rejected

### Full Desktop Rewrite

Rejected because it would duplicate the existing Next.js UI, routing, auth, and server behavior. That would increase regression risk and make parity with the web app harder to verify.

### Immediate Local-First Sync

Rejected for the first milestone because local-first persistence changes core product semantics. That belongs in a separate data architecture plan after shell, auth, updater, and service startup are stable.

### Broad Native Bridge

Rejected because exposing native process power early would make the renderer too privileged. Desktop capabilities must be narrow, typed, audited, and gated.

## Permission Boundary

No arbitrary filesystem access is allowed in the desktop MVP. The renderer must not receive raw filesystem, shell, process, or Electron IPC primitives. All desktop-only behavior flows through the typed `window.agenthubDesktop` bridge and must be backed by allowlisted IPC handlers.

Native capabilities that remain unavailable until later gated tasks include:

- arbitrary file reads and writes
- MCP STDIO process mounting
- CLI command execution
- background daemon installation
- unmanaged local service startup

## Relation To P42.3

P42.3 is the roadmap item for packaging AgentHub as a desktop app. This ADR narrows P42.3 into a compatible implementation strategy: build Electron as a local desktop shell around `apps/web`, stabilize shell/auth/updater/service startup first, then add carefully scoped native capabilities only after those foundations are green.

## Consequences

- Web and desktop share one product UI.
- Desktop-specific code stays isolated under `apps/desktop`.
- Runtime detection in `apps/web` must be defensive and must not import Electron packages.
- Tests can enforce Electron safety defaults and prevent accidental broad native APIs.

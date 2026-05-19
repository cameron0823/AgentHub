# ADR 0002: Local-First Sync Strategy

## Status

Accepted.

## Context

The historical AgentHub design documents describe an offline-first stack built around SQLite, LanceDB, Yjs, Electric SQL, and WebRTC. The live application has moved in a different direction: the implemented runtime uses PostgreSQL + pgvector as the data store, Redis + BullMQ for queues, MinIO / S3-compatible storage for uploads, and NextAuth + Casdoor for multi-user auth.

The P41.2 roadmap item exists because the parity review found a mismatch between legacy local-first sync ideas and the current server-backed architecture. NotebookLM research summarized the comparable direction this way: LobeHub 2.0 is server-centric, with legacy IndexedDB/CRDT sync treated as experimental rather than the production baseline.

Adding IndexedDB/Yjs/WebRTC now would introduce a second persistence model for sessions, messages, agents, pages, tasks, memory, files, auth state, and queues. It would also require conflict semantics across server mutations, background workers, file uploads, page history, and audit/security events.

## Decision

PostgreSQL remains the canonical system of record for the current AgentHub production implementation.

IndexedDB/Yjs/WebRTC sync is not part of the current production implementation. It must not be advertised as available, and the app must not add Yjs, Electric SQL, IndexedDB, WebRTC sync, or SQLite replication dependencies as implicit runtime behavior.

Any future local-first sync implementation must be introduced behind an explicit `AGENTHUB_EXPERIMENTAL_LOCAL_SYNC` flag. That work needs its own contract, migrations or dual-write strategy, ownership model, encryption/key-management design, conflict-resolution tests, and browser/device E2E tests before it can be considered supported.

No sync conflict tests are required until the experimental sync flag is implemented.

## Current Contract

- PostgreSQL + pgvector is the only supported primary data plane.
- Redis remains the queue/broker dependency for worker-backed workflows.
- MinIO / S3-compatible storage remains the object store.
- Desktop packaging may start or detect local services, but it must not silently replace PostgreSQL with a separate local database.
- Documentation may describe CRDT sync as historical design context or future experimental work only when it links back to this ADR.
- Health/deployment docs must describe the server-backed stack as the supported path.

## Alternatives Considered

### Implement IndexedDB/Yjs/WebRTC Now

Rejected for this phase. It would require dual-write or migration semantics for every shared entity, conflict rules for page edits and task state, sync encryption, peer discovery, queue behavior while offline, and a full conflict-test suite. That is too large and risky while deployment, auth, updater, and service startup are still being stabilized.

### Use Electric SQL / SQLite Replication

Rejected for the current implementation. Electric-style replication would require reintroducing SQLite as a first-class runtime store, deciding how it maps to the existing PostgreSQL schema, and defining how auth and worker state replicate safely.

### Keep PostgreSQL-Only Parity

Accepted. This matches the implemented codebase and the server-centric parity direction. It preserves current functionality and lets deployment/auth work proceed without splitting the data model.

## Consequences

- The README and deployment docs must present AgentHub as self-hostable and local-service friendly, not as fully offline or SQLite-only.
- Legacy design docs can keep CRDT sections as planning history only if they clearly state that ADR 0002 supersedes them.
- Future local-first sync can still be built, but it is a separate experimental feature with an explicit flag and independent acceptance tests.
- The current P41.2 acceptance is satisfied by this decision record and by tests proving the production runtime has not added CRDT sync dependencies prematurely.

# AgentHub E2E Tests

## Running Tests

```bash
# Run the configured Playwright suite from the repo root.
# The setup project signs in with the dev credentials provider and stores auth state.
pnpm -C apps/web test:e2e

# Run a specific phase
pnpm -C apps/web exec playwright test tests/e2e/specs/phase-a

# Include live local-model tests that are skipped by default
E2E_OLLAMA=1 pnpm -C apps/web test:e2e
```

## Test Organization

| Directory        | Phase          | Focus                                   |
| ---------------- | -------------- | --------------------------------------- |
| `specs/phase-a/` | Foundation     | Auth, chat, agents, groups, marketplace |
| `specs/phase-b/` | Chat Parity    | Branching, editing, attachments, search |
| `specs/phase-c/` | Knowledge Base | Upload, chunking, RAG, citations        |
| `specs/phase-d/` | Memory         | Injection, auto-extraction, context     |
| `specs/phase-e/` | Orchestration  | Supervisor, debate, groupchat patterns  |
| `specs/phase-f/` | Extensibility  | MCP, A2A, tool manifest, sandbox        |
| `specs/phase-g/` | Polish         | Theme, i18n, PWA, analytics, export     |

## Tags

- `@ollama` — Requires Ollama running with models and `E2E_OLLAMA=1`
- Auth setup uses the dev credentials provider: `admin@localhost` / `admin12345`
- The Playwright web server defaults to `DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e` when it starts its own server.

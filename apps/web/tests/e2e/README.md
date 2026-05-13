# AgentHub E2E Tests

## Running Tests

```bash
# 1. Start infrastructure
docker compose up -d postgresql minio casdoor

# 2. Run migrations
pnpm drizzle-kit migrate

# 3. Seed test data
pnpm tsx tests/e2e/seed.ts

# 4. Run tests
pnpm playwright test

# Run specific phase
pnpm playwright test specs/phase-a

# Run without Ollama-dependent tests
pnpm playwright test --grep-invert @ollama
```

## Test Organization

| Directory | Phase | Focus |
|-----------|-------|-------|
| `specs/phase-a/` | Foundation | Auth, chat, agents, groups, marketplace |
| `specs/phase-b/` | Chat Parity | Branching, editing, attachments, search |
| `specs/phase-c/` | Knowledge Base | Upload, chunking, RAG, citations |
| `specs/phase-d/` | Memory | Injection, auto-extraction, context |
| `specs/phase-e/` | Orchestration | Supervisor, debate, groupchat patterns |
| `specs/phase-f/` | Extensibility | MCP, A2A, tool manifest, sandbox |
| `specs/phase-g/` | Polish | Theme, i18n, PWA, analytics, export |

## Tags

- `@ollama` — Requires Ollama running with models
- `@auth` — Requires Casdoor auth setup
- `@kb` — Requires knowledge base with documents
- `@mcp` — Requires MCP server installed

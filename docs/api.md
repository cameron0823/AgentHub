# AgentHub Public API

AgentHub public endpoints use API keys created in Settings. Send keys with
`Authorization: Bearer ah_...`; `x-api-key` is accepted for systems that cannot
set an Authorization header. Every endpoint resolves the key to one user and
applies user isolation in each query or mutation.

## Authentication

```http
Authorization: Bearer ah_example
```

Invalid, expired, disabled, or missing keys return `401`.

## OpenAPI

The public API contract is served as OpenAPI 3.1 JSON from
`GET /api/openapi.json` and `GET /api/v1/openapi.json`. The document includes
the Bearer and `x-api-key` security schemes, request bodies for mutating v1
resources, and the OpenAI-compatible chat completion shape.

## REST Resources

| Method | Path                       | Purpose                                                        |
| ------ | -------------------------- | -------------------------------------------------------------- |
| `GET`  | `/api/v1/agents`           | List the authenticated user's agents.                          |
| `POST` | `/api/v1/agents`           | Create an agent.                                               |
| `GET`  | `/api/v1/sessions`         | List chat sessions.                                            |
| `POST` | `/api/v1/sessions`         | Create a chat session, optionally scoped to an owned agent.    |
| `GET`  | `/api/v1/tasks`            | List agent tasks.                                              |
| `POST` | `/api/v1/tasks`            | Create an agent task and queue it when it has no dependencies. |
| `GET`  | `/api/v1/kb`               | List knowledge bases.                                          |
| `POST` | `/api/v1/kb`               | Create a knowledge base.                                       |
| `GET`  | `/api/v1/files`            | List uploaded files and return the presign upload endpoint.    |
| `GET`  | `/api/v1/tools`            | List built-in runtime tools and installed skill tools.         |
| `GET`  | `/api/v1/projects`         | List projects.                                                 |
| `POST` | `/api/v1/projects`         | Create a project.                                              |
| `GET`  | `/api/v1/webhooks`         | List channel webhook accounts and recent webhook audit events. |
| `POST` | `/api/v1/chat/completions` | Create an OpenAI-compatible chat completion or SSE stream.     |
| `GET`  | `/api/v1/ws`               | Probe the Agent Gateway transport.                             |

Quick reference: `GET /api/v1/agents`, `POST /api/v1/agents`,
`GET /api/v1/sessions`, `GET /api/v1/tasks`, `GET /api/v1/kb`,
`GET /api/v1/files`, `GET /api/v1/tools`, `GET /api/v1/projects`,
`GET /api/v1/webhooks`, `POST /api/v1/chat/completions`, `GET /api/v1/ws`.

List endpoints accept `?limit=1..200`. Response bodies use `{ "data": ... }`.
Validation failures return `422` with Zod issues.

## Streaming Gateway

Raw WebSocket upgrades are not hosted by the current Next.js route runtime. A
request with `Upgrade: websocket` to `GET /api/v1/ws` returns `426` and the code
`websocket_gateway_unavailable`.

Use the SSE fallback by calling `GET /api/v1/ws` without an upgrade header, or
call `/api/v1/chat/completions` with `stream=true` for model output streaming.
The SSE fallback emits `gateway.ready` and `gateway.fallback` events.

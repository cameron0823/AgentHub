import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("public API helper authenticates API keys without session auth", async () => {
  assert.ok(exists("apps/web/src/server/public-api.ts"), "missing public API helper");
  const helper = await readText("apps/web/src/server/public-api.ts");

  for (const required of [
    "validateApiKey",
    "authorization",
    "Bearer ",
    "x-api-key",
    "requireApiUser",
    "parseJsonBody",
    "apiError",
    "ZodError",
  ]) {
    assert.match(helper, new RegExp(escapeRegExp(required)), `public API helper missing ${required}`);
  }

  assert.doesNotMatch(helper, /auth\(/, "public API helper must not depend on browser session auth");
});

test("REST v1 resources use API-key auth and user-scoped queries", async () => {
  const routeContracts = [
    ["agents", "apps/web/src/app/api/v1/agents/route.ts", "agents.userId"],
    ["sessions", "apps/web/src/app/api/v1/sessions/route.ts", "chatSessions.userId"],
    ["tasks", "apps/web/src/app/api/v1/tasks/route.ts", "agentTasks.userId"],
    ["kb", "apps/web/src/app/api/v1/kb/route.ts", "knowledgeBases.userId"],
    ["files", "apps/web/src/app/api/v1/files/route.ts", "files.userId"],
    ["tools", "apps/web/src/app/api/v1/tools/route.ts", "installedSkills.userId"],
    ["projects", "apps/web/src/app/api/v1/projects/route.ts", "projects.userId"],
    ["webhooks", "apps/web/src/app/api/v1/webhooks/route.ts", "channelAccounts.userId"],
  ];

  for (const [name, path, scopeExpression] of routeContracts) {
    assert.ok(exists(path), `missing ${name} public API route`);
    const source = await readText(path);

    for (const required of [
      'export const runtime = "nodejs"',
      "requireApiUser(req)",
      "if (!auth.ok) return auth.response",
      `eq(${scopeExpression}, userId)`,
      "limitFromRequest(req)",
    ]) {
      assert.match(source, new RegExp(escapeRegExp(required)), `${name} route missing ${required}`);
    }
  }
});

test("mutating REST routes validate JSON bodies and verify foreign-key ownership", async () => {
  const [agentsRoute, sessionsRoute, tasksRoute, kbRoute, projectsRoute] = await Promise.all([
    readText("apps/web/src/app/api/v1/agents/route.ts"),
    readText("apps/web/src/app/api/v1/sessions/route.ts"),
    readText("apps/web/src/app/api/v1/tasks/route.ts"),
    readText("apps/web/src/app/api/v1/kb/route.ts"),
    readText("apps/web/src/app/api/v1/projects/route.ts"),
  ]);

  for (const [name, source] of [
    ["agents", agentsRoute],
    ["sessions", sessionsRoute],
    ["tasks", tasksRoute],
    ["kb", kbRoute],
    ["projects", projectsRoute],
  ]) {
    assert.match(source, /export async function POST\(req: NextRequest\)/, `${name} route must expose POST`);
    assert.match(source, /parseJsonBody\(req,/, `${name} route must validate request JSON`);
  }

  for (const [name, source, required] of [
    ["sessions", sessionsRoute, "eq(agents.userId, userId)"],
    ["tasks", tasksRoute, "eq(agents.userId, userId)"],
  ]) {
    assert.match(source, new RegExp(escapeRegExp(required)), `${name} route must verify agent ownership`);
  }
});

test("WebSocket gateway route documents unsupported upgrade and provides SSE fallback", async () => {
  const wsRoute = await readText("apps/web/src/app/api/v1/ws/route.ts");

  for (const required of [
    'export const runtime = "nodejs"',
    "requireApiUser(req)",
    'headers.get("upgrade")',
    "websocket_gateway_unavailable",
    "426",
    "text/event-stream",
    "gateway.ready",
    "gateway.fallback",
  ]) {
    assert.match(wsRoute, new RegExp(escapeRegExp(required)), `ws route missing ${required}`);
  }
});

test("public API exposes an OpenAPI 3.1 document for v1 clients", async () => {
  assert.ok(exists("apps/web/src/server/public-api-openapi.ts"), "missing OpenAPI document module");
  assert.ok(exists("apps/web/src/app/api/openapi.json/route.ts"), "missing root OpenAPI route");
  assert.ok(exists("apps/web/src/app/api/v1/openapi.json/route.ts"), "missing v1 OpenAPI route");

  const [spec, rootRoute, v1Route] = await Promise.all([
    readText("apps/web/src/server/public-api-openapi.ts"),
    readText("apps/web/src/app/api/openapi.json/route.ts"),
    readText("apps/web/src/app/api/v1/openapi.json/route.ts"),
  ]);

  for (const required of [
    'openapi: "3.1.0"',
    'title: "AgentHub Public API"',
    "bearerAuth",
    "apiKeyAuth",
    'name: "x-api-key"',
    '"/api/v1/agents"',
    '"/api/v1/sessions"',
    '"/api/v1/tasks"',
    '"/api/v1/kb"',
    '"/api/v1/files"',
    '"/api/v1/tools"',
    '"/api/v1/projects"',
    '"/api/v1/webhooks"',
    '"/api/v1/chat/completions"',
    '"/api/v1/ws"',
    "createChatCompletion",
    "OpenAI-compatible SSE chunks",
  ]) {
    assert.match(spec, new RegExp(escapeRegExp(required)), `OpenAPI spec missing ${required}`);
  }

  assert.match(rootRoute, /Response\.json\(agentHubOpenApiDocument/);
  assert.match(v1Route, /export const runtime = "nodejs"/);
  assert.match(v1Route, /Response\.json\(agentHubOpenApiDocument/);
});

test("API documentation lists authenticated REST resources and WebSocket fallback semantics", async () => {
  assert.ok(exists("docs/api.md"), "missing public API docs");
  const docs = await readText("docs/api.md");

  for (const required of [
    "GET /api/openapi.json",
    "GET /api/v1/openapi.json",
    "OpenAPI 3.1",
    "Authorization: Bearer ah_",
    "GET /api/v1/agents",
    "POST /api/v1/agents",
    "GET /api/v1/sessions",
    "GET /api/v1/tasks",
    "GET /api/v1/kb",
    "GET /api/v1/files",
    "GET /api/v1/tools",
    "GET /api/v1/projects",
    "GET /api/v1/webhooks",
    "POST /api/v1/chat/completions",
    "GET /api/v1/ws",
    "SSE fallback",
    "426",
    "user isolation",
  ]) {
    assert.match(docs, new RegExp(escapeRegExp(required)), `docs/api.md missing ${required}`);
  }
});

test("public API streaming browser spec proves Bearer key auth against the running app", async () => {
  const specPath = "apps/web/tests/e2e/specs/phase-h/public-api-streaming.spec.ts";
  assert.ok(exists(specPath), "missing public API streaming E2E spec");
  const spec = await readText(specPath);

  assert.doesNotMatch(spec, /page\.setContent/, "public API proof must run against the app route");
  assert.match(spec, /createE2EApiKey/, "spec must seed a real API key through the E2E database");
  assert.match(spec, /\/api\/v1\/chat\/completions/, "spec must call the public chat completions endpoint");
  assert.match(spec, /Authorization: `Bearer \$\{apiKey\.key\}`/, "spec must authenticate with Bearer API key");
  assert.match(spec, /stream: true/, "spec must request streaming mode");
  assert.match(spec, /text\/event-stream/, "spec must assert an SSE response");
  assert.match(spec, /data: \[DONE\]/, "spec must assert OpenAI-compatible stream termination");
});

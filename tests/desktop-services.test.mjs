import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop service ledger lists required service surfaces", async () => {
  const ledger = await readText("apps/desktop/src/main/services/service-ledger.ts");
  for (const service of ["web", "database", "redis", "objectStorage", "auth", "search", "ollama", "lmstudio", "vllm"]) {
    assert.match(ledger, new RegExp(`id: "${service}"`));
  }
  assert.match(ledger, /requiredFor/);
  assert.match(ledger, /start-docker|open-settings|open-docs|retry/);
});

test("dependency health route checks database without exposing secrets", async () => {
  const route = await readText("apps/web/src/app/api/health/dependencies/route.ts");
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /select 1/i);
  assert.match(route, /connect_timeout/, "database probe must fail quickly when PostgreSQL is unavailable");
  assert.match(route, /withTimeout\(healthClient`select 1`, "database check"\)/);
  assert.match(route, /status: "unhealthy", configured: true, action: "start-docker"/);
  assert.doesNotMatch(route, /DATABASE_URL.*Response|REDIS_URL.*Response|SECRET|PASSWORD/i);
});

test("dependency health route uses bounded real probes for configured services", async () => {
  const route = await readText("apps/web/src/app/api/health/dependencies/route.ts");
  assert.match(route, /CHECK_TIMEOUT_MS = 1500/);
  assert.match(route, /checkTcpEndpoint\(redisUrl/);
  assert.match(route, /checkHttpEndpoint\(objectStorageUrl, \{ path: "\/minio\/health\/ready"/);
  assert.match(route, /checkTcpEndpoint\(authIssuer/);
  assert.match(route, /checkHttpEndpoint\(searchUrl,\s*\{\s*path: "\/search\?q=agenthub&format=json"/);
  assert.match(route, /headers: \{ "X-Real-IP": "127\.0\.0\.1" \}/);
  assert.doesNotMatch(route, /status: "unknown"/);
});

test("SearXNG callers provide a real IP header for local desktop search", async () => {
  const webSearch = await readText("packages/agent-runtime/src/tools/builtin/webSearch.ts");
  assert.match(webSearch, /headers: \{ "X-Real-IP": "127\.0\.0\.1" \}/);
});

test("docker compose orchestration is detection-first and opt-in", async () => {
  const docker = await readText("apps/desktop/src/main/services/docker-compose.ts");
  assert.match(docker, /docker compose ps/);
  assert.match(docker, /confirmStart/);
  assert.match(docker, /docker compose up -d/);
  assert.doesNotMatch(docker, /kill|taskkill|fuser|lsof/);
});

test("docker web image uses a supported Node runtime", async () => {
  const [dockerfile, webPackage] = await Promise.all([readText("Dockerfile"), readText("apps/web/package.json")]);
  assert.match(dockerfile, /FROM node:22-bookworm-slim AS base/);
  assert.match(dockerfile, /NEXT_TELEMETRY_DISABLED=1/);
  assert.match(dockerfile, /packages\/editor-kernel\/package\.json/);
  assert.match(dockerfile, /packages\/ui\/package\.json/);
  assert.match(dockerfile, /--config\.auto-install-peers=false/);
  assert.match(dockerfile, /pnpm -C apps\/web build/);
  assert.doesNotMatch(dockerfile, /FROM node:20-/);
  assert.doesNotMatch(webPackage, /better-sqlite3/);
});

test("desktop compose runtime keeps production env and inline workers active", async () => {
  const [compose, startup, searxng] = await Promise.all([
    readText("docker-compose.yml"),
    readText("scripts/start-desktop.mjs"),
    readText("docker/searxng/settings.yml"),
  ]);

  assert.match(compose, /NODE_ENV=production/);
  assert.match(compose, /AGENTHUB_WORKER_MODE=\$\{AGENTHUB_WORKER_MODE:-inline\}/);
  assert.match(compose, /AGENTHUB_ENABLE_INLINE_WORKERS=\$\{AGENTHUB_ENABLE_INLINE_WORKERS:-1\}/);
  assert.match(compose, /SEARXNG_BASE_URL=http:\/\/localhost:8080/);
  assert.match(compose, /SEARXNG_SECRET=agenthub-local-desktop-searxng-secret/);
  assert.match(compose, /docker\/searxng\/settings\.yml:\/etc\/searxng\/settings\.yml/);
  assert.match(compose, /docker\/searxng\/limiter\.toml:\/etc\/searxng\/limiter\.toml/);
  assert.match(searxng, /formats:\s*\n\s*- html\s*\n\s*- json/);
  assert.match(searxng, /method: "GET"/);
  assert.match(searxng, /secret_key: "agenthub-local-desktop-searxng-secret"/);
  assert.match(startup, /databaseUrlWithQuietMigrations/);
  assert.match(startup, /client_min_messages=warning/);
});

test("service errors map to actionable states", async () => {
  const dependencyHealth = await readText("apps/desktop/src/main/services/dependency-health.ts");
  assert.match(dependencyHealth, /open-settings|open-docs|retry|start-docker/);
  assert.match(dependencyHealth, /not-configured/);
  assert.match(dependencyHealth, /unhealthy/);
});

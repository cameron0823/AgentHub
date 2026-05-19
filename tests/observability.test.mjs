import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

test("pino logger redacts secrets and instrumentation uses structured logs", async () => {
  const [pkg, logger, instrumentation] = await Promise.all([
    readJson("apps/web/package.json"),
    readText("apps/web/src/server/observability/logger.ts"),
    readText("apps/web/src/instrumentation.ts"),
  ]);

  assert.ok(pkg.dependencies.pino, "web app must depend on pino");
  assert.match(logger, /from "pino"/);
  assert.match(logger, /TRACE_ID_HEADER/);
  assert.match(logger, /redact/);
  for (const secretName of ["DATABASE_URL", "NEXTAUTH_SECRET", "TRUST_ENGINE_SECRET", "S3_SECRET_ACCESS_KEY"]) {
    assert.match(logger, new RegExp(secretName), `logger must redact ${secretName}`);
  }
  assert.match(instrumentation, /logger\.info/);
  assert.match(instrumentation, /logger\.warn/);
  assert.doesNotMatch(instrumentation, /console\.warn/);
});

test("middleware propagates trace ids on requests and responses", async () => {
  const [middleware, trace] = await Promise.all([
    readText("apps/web/src/middleware.ts"),
    readText("apps/web/src/server/observability/trace.ts"),
  ]);

  assert.match(trace, /x-agenthub-trace-id/);
  assert.match(trace, /x-request-id/);
  assert.match(middleware, /@\/server\/observability\/trace/);
  assert.match(middleware, /crypto\.randomUUID/);
  assert.match(middleware, /NextResponse\.next/);
  assert.match(middleware, /response\.headers\.set\(TRACE_ID_HEADER/);
});

test("Sentry optional flag is configured without enabling it by default", async () => {
  const [pkg, sentry, sentryConfig, instrumentation, envExample] = await Promise.all([
    readJson("apps/web/package.json"),
    readText("apps/web/src/server/observability/sentry.ts"),
    readText("apps/web/src/server/observability/sentry-config.ts"),
    readText("apps/web/src/instrumentation.ts"),
    readText(".env.example"),
  ]);

  assert.ok(pkg.dependencies["@sentry/nextjs"], "web app must depend on @sentry/nextjs");
  assert.match(sentryConfig, /SENTRY_DSN/);
  assert.match(sentryConfig, /SENTRY_ENABLED/);
  assert.match(sentry, /isSentryConfigured/);
  assert.match(sentry, /import\("@sentry\/nextjs"\)/);
  assert.match(instrumentation, /initializeSentry/);
  assert.match(envExample, /^SENTRY_ENABLED=0$/m, "Sentry must remain opt-in by default");
  assert.match(envExample, /^SENTRY_DSN=$/m);
});

test("metrics endpoint exposes Prometheus-compatible AgentHub process metrics", async () => {
  const [route, sentryConfig, readme] = await Promise.all([
    readText("apps/web/src/app/api/metrics/route.ts"),
    readText("apps/web/src/server/observability/sentry-config.ts"),
    readText("README.md"),
  ]);

  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /sentry-config/);
  assert.doesNotMatch(route, /@\/server\/observability\/sentry"/);
  assert.match(sentryConfig, /SENTRY_DSN/);
  assert.match(sentryConfig, /SENTRY_ENABLED/);
  assert.match(route, /text\/plain; version=0\.0\.4/);
  for (const metric of [
    "agenthub_info",
    "agenthub_process_uptime_seconds",
    "agenthub_process_memory_rss_bytes",
    "agenthub_nodejs_heap_used_bytes",
    "agenthub_background_workers_enabled",
    "agenthub_sentry_configured",
  ]) {
    assert.match(route, new RegExp(metric), `metrics route missing ${metric}`);
  }
  assert.match(readme, /\/api\/metrics/);
});

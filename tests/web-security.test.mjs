import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function readText(rel) {
  return readFile(join(root, rel), "utf8");
}

describe("Web security hardening", () => {
  it("defines CSP, Trusted Types, and OWASP baseline response headers", async () => {
    const headers = await readText("apps/web/src/server/security/headers.ts");

    assert.match(headers, /Content-Security-Policy/);
    assert.match(headers, /default-src 'self'/);
    assert.match(headers, /nonce-\$\{options\.nonce\}/);
    assert.match(headers, /require-trusted-types-for 'script'/);
    assert.match(headers, /trusted-types default dompurify/);
    assert.match(headers, /agenthub-service-worker/);
    assert.match(headers, /agenthub-mermaid/);
    assert.match(headers, /agenthub-artifact-preview/);
    assert.match(headers, /nextjs#bundler/);
    assert.match(headers, /frame-ancestors 'none'/);
    assert.match(headers, /report-uri \/api\/csp-report/);
    for (const header of [
      "Strict-Transport-Security",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
      "Cross-Origin-Embedder-Policy",
    ]) {
      assert.match(headers, new RegExp(header));
    }
  });

  it("adds middleware-level distributed rate limiting tiers and CSRF token issuance", async () => {
    const [middleware, rateLimit] = await Promise.all([
      readText("apps/web/src/middleware.ts"),
      readText("apps/web/src/server/security/rate-limit.ts"),
    ]);

    assert.match(rateLimit, /RATE_LIMIT_TIERS/);
    assert.match(rateLimit, /auth: \{ limit: 10, windowMs: 60_000 \}/);
    assert.match(rateLimit, /ai: \{ limit: 50, windowMs: 60 \* 60_000 \}/);
    assert.match(rateLimit, /sensitive: \{ limit: 5, windowMs: 60_000 \}/);
    assert.match(rateLimit, /classifyRateLimitTier/);
    assert.match(rateLimit, /checkRateLimit/);
    assert.match(rateLimit, /UPSTASH_REDIS_REST_URL/);
    assert.match(rateLimit, /UPSTASH_REDIS_REST_TOKEN/);
    assert.match(rateLimit, /RATE_LIMIT_REDIS_PREFIX/);
    assert.match(rateLimit, /slidingWindowScript/);
    assert.match(rateLimit, /"EVAL"/);
    assert.match(rateLimit, /ZREMRANGEBYSCORE/);
    assert.match(rateLimit, /ZCARD/);
    assert.match(rateLimit, /ZADD/);
    assert.match(rateLimit, /PEXPIRE/);
    assert.match(rateLimit, /backend: "upstash"/);
    assert.match(rateLimit, /checkMemoryRateLimit/);
    assert.match(middleware, /classifyRateLimitTier/);
    assert.match(middleware, /await checkRateLimit/);
    assert.match(middleware, /Rate limit exceeded/);
    assert.match(middleware, /Retry-After/);
    assert.match(middleware, /X-RateLimit-Backend/);
    assert.match(middleware, /__Host-agenthub\.csrf/);
    assert.match(middleware, /x-csrf-token/);
    assert.match(middleware, /x-nonce/);
    assert.match(middleware, /sameSite: "strict"/);
  });

  it("documents Upstash REST rate-limit configuration without requiring it for local development", async () => {
    const envExample = await readText(".env.example");

    assert.match(envExample, /UPSTASH_REDIS_REST_URL=/);
    assert.match(envExample, /UPSTASH_REDIS_REST_TOKEN=/);
    assert.match(envExample, /RATE_LIMIT_REDIS_PREFIX=agenthub:rate-limit/);
    assert.match(envExample, /Leave blank for local in-memory fallback/);
  });

  it("collects CSP reports without leaking report details to clients", async () => {
    const route = await readText("apps/web/src/app/api/csp-report/route.ts");

    assert.match(route, /Content Security Policy violation/);
    assert.match(route, /status: 204/);
    assert.doesNotMatch(route, /NextResponse\.json\(\s*report/);
  });
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("README deployment overview matches the current AgentHub stack", async () => {
  const readme = await readText("README.md");

  for (const staleClaim of [
    "Docker Compose files are not included",
    "Next.js 14",
    "Better Auth",
    "SQLite (local-first)",
    "LanceDB",
    "No API keys. No cloud lock-in. No data leaving your machine.",
  ]) {
    assert.doesNotMatch(readme, new RegExp(escapeRegExp(staleClaim)), `stale README claim: ${staleClaim}`);
  }

  for (const currentStackTerm of [
    "Next.js 15",
    "NextAuth + Casdoor",
    "PostgreSQL + pgvector",
    "Redis + BullMQ",
    "MinIO / S3-compatible storage",
    "SearXNG",
    "docs/deployment/docker-compose-production.md",
    "`pnpm db:push`",
  ]) {
    assert.match(readme, new RegExp(escapeRegExp(currentStackTerm)), `README missing: ${currentStackTerm}`);
  }
});

test("deployment guides exist and cover the full production stack", async () => {
  for (const path of [
    "docs/deployment/docker-compose-production.md",
    "docs/deployment/vercel.md",
    "docs/deployment/zeabur.md",
    "docs/deployment/sealos.md",
  ]) {
    assert.ok(exists(path), `missing deployment guide: ${path}`);
  }

  const dockerGuide = await readText("docs/deployment/docker-compose-production.md");
  for (const required of [
    "agenthub",
    "postgresql",
    "pgvector/pgvector:pg16",
    "redis",
    "minio",
    "minio-init",
    "casdoor",
    "searxng",
    "apps/web/src/instrumentation.ts",
    "workers run inside the Next.js server process",
    "pnpm db:push",
    "/api/health",
    "/api/health/dependencies",
    "pg_dump",
    "pg_restore",
    "mc mirror",
  ]) {
    assert.match(dockerGuide, new RegExp(escapeRegExp(required)), `Docker guide missing: ${required}`);
  }

  const platformGuides = await Promise.all([
    readText("docs/deployment/vercel.md"),
    readText("docs/deployment/zeabur.md"),
    readText("docs/deployment/sealos.md"),
  ]);

  for (const guide of platformGuides) {
    for (const required of [
      "PostgreSQL + pgvector",
      "Redis",
      "S3-compatible",
      "Casdoor",
      "SearXNG",
      "NEXTAUTH_SECRET",
      "TRUST_ENGINE_SECRET",
      "/api/health/dependencies",
    ]) {
      assert.match(guide, new RegExp(escapeRegExp(required)), `platform guide missing: ${required}`);
    }
  }

  assert.match(platformGuides[0], /Vercel does not run the bundled Docker services/);
});

test("compose and environment examples use runtime-compatible service settings", async () => {
  const [compose, envExample, healthRoute] = await Promise.all([
    readText("docker-compose.yml"),
    readText(".env.example"),
    readText("apps/web/src/app/api/health/dependencies/route.ts"),
  ]);

  for (const service of ["postgresql", "redis", "minio", "minio-init", "casdoor", "searxng", "agenthub"]) {
    assert.match(compose, new RegExp(`^  ${service}:`, "m"), `compose missing service: ${service}`);
  }

  assert.match(
    compose,
    /\$\{SEARXNG_HOST_PORT:-8080\}:8080/,
    "SearXNG port must be exposed by the shared network service",
  );
  assert.match(
    compose,
    /\$\{POSTGRES_HOST_PORT:-5432\}:5432/,
    "PostgreSQL host port must be overridable for local conflicts",
  );
  assert.match(compose, /S3_BUCKET/, "compose should create the same bucket the app reads");
  assert.match(compose, /S3_ACCESS_KEY_ID/, "compose should use the same object-storage access key env as the app");
  assert.match(compose, /S3_SECRET_ACCESS_KEY/, "compose should use the same object-storage secret env as the app");

  for (const envName of [
    "DATABASE_URL",
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "AUTH_CASDOOR_ISSUER",
    "AUTH_CASDOOR_ID",
    "AUTH_CASDOOR_SECRET",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "REDIS_URL",
    "REDIS_HOST",
    "REDIS_PORT",
    "SEARXNG_BASE_URL",
    "OLLAMA_URL",
    "LMSTUDIO_URL",
    "VLLM_URL",
    "TRUST_ENGINE_SECRET",
  ]) {
    assert.match(envExample, new RegExp(`^${envName}=`, "m"), `.env.example missing ${envName}`);
  }

  for (const staleEnvName of [
    "CASDOOR_ENDPOINT",
    "MINIO_ENDPOINT",
    "MINIO_ACCESS_KEY",
    "MINIO_SECRET_KEY",
    "MINIO_BUCKET",
    "AWS_REGION",
  ]) {
    assert.doesNotMatch(
      envExample,
      new RegExp(`^${staleEnvName}=`, "m"),
      `.env.example still exposes stale ${staleEnvName}`,
    );
  }

  for (const runtimeEnvName of ["SEARXNG_BASE_URL", "OLLAMA_URL", "LMSTUDIO_URL", "VLLM_URL"]) {
    assert.match(healthRoute, new RegExp(escapeRegExp(runtimeEnvName)), `health route must read ${runtimeEnvName}`);
  }
});

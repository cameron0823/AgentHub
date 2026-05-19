import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const repoRoot = new URL("../", import.meta.url);
const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function loadCompiledRouting() {
  const outDir = await mkdtemp(join(tmpdir(), "agenthub-provider-routing-"));
  try {
    execFileSync(
      process.execPath,
      [
        require.resolve("typescript/bin/tsc"),
        "-p",
        "packages/ai-providers/tsconfig.json",
        "--outDir",
        outDir,
        "--module",
        "CommonJS",
        "--moduleResolution",
        "Node",
        "--declaration",
        "false",
        "--declarationMap",
        "false",
        "--noEmit",
        "false",
      ],
      { cwd: repoRoot, stdio: "pipe" },
    );
    return {
      routing: require(join(outDir, "routing.js")),
      cleanup: () => rm(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(outDir, { recursive: true, force: true });
    throw error;
  }
}

const health = [
  { id: "ollama", name: "Ollama", status: "healthy", latency: 80 },
  { id: "openai", name: "OpenAI", status: "healthy", latency: 120 },
  { id: "anthropic", name: "Anthropic", status: "healthy", latency: 160 },
  { id: "groq", name: "Groq", status: "healthy", latency: 20 },
  { id: "deepseek", name: "DeepSeek", status: "healthy", latency: 90 },
];

test("provider routing module resolves all planned strategies", async () => {
  const { routing, cleanup } = await loadCompiledRouting();
  try {
    const { resolveRoute } = routing;

    assert.equal(
      resolveRoute({
        requestedModel: "openai:gpt-4o",
        providerHealth: health.map((item) => (item.id === "openai" ? { ...item, status: "unhealthy" } : item)),
        policy: { strategy: "fixed", fallbackModelIds: ["groq:llama-3.3-70b"] },
      }).modelId,
      "openai:gpt-4o",
      "fixed strategy should keep the requested model",
    );

    assert.equal(
      resolveRoute({
        requestedModel: "openai:gpt-4o",
        providerHealth: health.map((item) =>
          ["openai", "ollama"].includes(item.id) ? { ...item, status: "unhealthy" } : item,
        ),
        policy: { strategy: "fallback-chain", fallbackModelIds: ["ollama:qwen2.5:7b", "groq:llama-3.3-70b"] },
      }).modelId,
      "groq:llama-3.3-70b",
      "fallback-chain should choose the first healthy fallback",
    );

    assert.equal(
      resolveRoute({
        requestedModel: "openai:gpt-4o",
        providerHealth: health,
        policy: { strategy: "local-first", fallbackModelIds: ["ollama:qwen2.5:7b", "groq:llama-3.3-70b"] },
      }).modelId,
      "ollama:qwen2.5:7b",
      "local-first should prefer a healthy local provider",
    );

    assert.equal(
      resolveRoute({
        requestedModel: "openai:gpt-4o",
        providerHealth: health,
        policy: { strategy: "speed-first", fallbackModelIds: ["anthropic:claude-3-5-sonnet", "groq:llama-3.3-70b"] },
      }).modelId,
      "groq:llama-3.3-70b",
      "speed-first should pick the lowest healthy latency",
    );

    assert.equal(
      resolveRoute({
        requestedModel: "anthropic:claude-3-5-sonnet",
        providerHealth: health,
        policy: { strategy: "cost-first", fallbackModelIds: ["openai:gpt-4o", "deepseek:deepseek-chat"] },
      }).modelId,
      "deepseek:deepseek-chat",
      "cost-first should prefer the lowest estimated cost rank",
    );

    assert.equal(
      resolveRoute({
        requestedModel: "groq:llama-3.3-70b",
        providerHealth: health,
        policy: { strategy: "reasoning-first", fallbackModelIds: ["deepseek:deepseek-reasoner", "openai:o3-mini"] },
      }).modelId,
      "deepseek:deepseek-reasoner",
      "reasoning-first should prefer a healthy reasoning-capable provider",
    );
  } finally {
    await cleanup();
  }
});

test("provider routing falls back predictably when no candidate is healthy", async () => {
  const { routing, cleanup } = await loadCompiledRouting();
  try {
    const decision = routing.resolveRoute({
      requestedModel: "openai:gpt-4o",
      providerHealth: health.map((item) => ({ ...item, status: "unhealthy" })),
      policy: { strategy: "fallback-chain", fallbackModelIds: ["groq:llama-3.3-70b"] },
    });

    assert.equal(decision.modelId, "openai:gpt-4o");
    assert.equal(decision.providerId, "openai");
    assert.match(decision.reason, /no healthy/i);
  } finally {
    await cleanup();
  }
});

test("routing persistence and UI surfaces are wired through AgentHub", async () => {
  const [routing, index, schema, migration, agentsRouter, streamRoute, builder, chatMessage, store, chatInterface] =
    await Promise.all([
      readText("packages/ai-providers/src/routing.ts"),
      readText("packages/ai-providers/src/index.ts"),
      readText("apps/web/src/server/db/schema.ts"),
      readText("apps/web/drizzle/0006_model_routing.sql"),
      readText("apps/web/src/server/routers/agents.ts"),
      readText("apps/web/src/app/api/chat/stream/route.ts"),
      readText("apps/web/src/components/AgentBuilder.tsx"),
      readText("apps/web/src/components/ChatMessage.tsx"),
      readText("apps/web/src/stores/chatStore.ts"),
      readText("apps/web/src/components/ChatInterface.tsx"),
    ]);

  for (const strategy of ["fixed", "local-first", "speed-first", "cost-first", "reasoning-first", "fallback-chain"]) {
    assert.match(routing, new RegExp(`"${strategy}"`), `routing module must support ${strategy}`);
    assert.match(agentsRouter, new RegExp(`"${strategy}"`), `agents router must validate ${strategy}`);
    assert.match(builder, new RegExp(`"${strategy}"`), `agent builder must expose ${strategy}`);
  }

  assert.match(index, /export \* from "\.\/routing"/);
  assert.match(schema, /routeStrategy: text\(\s*\"route_strategy\"/);
  assert.match(schema, /fallbackModelIds: jsonb\(\s*\"fallback_model_ids\"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "route_strategy"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "fallback_model_ids"/);
  assert.match(agentsRouter, /routeStrategySchema/);
  assert.match(agentsRouter, /fallbackModelIds: input\.fallbackModelIds/);
  assert.match(streamRoute, /resolveRoute/);
  assert.match(streamRoute, /routeDecision/);
  assert.match(streamRoute, /type: "route_decision"/);
  assert.match(streamRoute, /metadata: messageMetadata/);
  assert.match(builder, /Route strategy/);
  assert.match(builder, /Fallback models/);
  assert.match(store, /routeDecision\?: RouteDecision/);
  assert.match(chatInterface, /chunk\.type === "route_decision"/);
  assert.match(chatMessage, /Route decision/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("IterativeOrchestrator implements author editor reviser loop with bounded iterations and checkpoints", async () => {
  const src = await readText("packages/agent-runtime/src/orchestrators/iterative.ts");

  assert.match(src, /export class IterativeOrchestrator/);
  assert.match(src, /author/i);
  assert.match(src, /editor/i);
  assert.match(src, /reviser/i);
  assert.match(src, /maxIterations/);
  assert.match(src, /options\.checkpoint/);
  assert.match(src, /hitl_checkpoint/);
  assert.match(src, /collectAgentRun/);
  assert.match(src, /group_complete/);
});

test("iterative pattern is exported and included in orchestration event types", async () => {
  const [index, types] = await Promise.all([
    readText("packages/agent-runtime/src/orchestrators/index.ts"),
    readText("packages/agent-runtime/src/orchestrators/types.ts"),
  ]);

  assert.match(index, /iterative/);
  assert.match(types, /"iterative"/);
  assert.match(types, /iterative_start/);
  assert.match(types, /iterative_iteration/);
  assert.match(types, /iterative_complete/);
});

test("web group schema, route, builder, and visualizer support iterative pattern", async () => {
  const [dbSchema, agentsRouter, route, builder, visualizer, store] = await Promise.all([
    readText("apps/web/src/server/db/schema.ts"),
    readText("apps/web/src/server/routers/agents.ts"),
    readText("apps/web/src/app/api/chat/stream/route.ts"),
    readText("apps/web/src/components/AgentGroupBuilder.tsx"),
    readText("apps/web/src/components/PatternVisualizer.tsx"),
    readText("apps/web/src/stores/chatStore.ts"),
  ]);

  assert.match(dbSchema, /"iterative"/);
  assert.match(agentsRouter, /"iterative"/);
  assert.match(route, /IterativeOrchestrator/);
  assert.match(route, /iterative: IterativeOrchestrator/);
  assert.match(builder, /iterative/);
  assert.match(builder, /Author, Editor, Reviser/);
  assert.match(visualizer, /case "iterative"/);
  assert.match(store, /"iterative"/);
});

test("iterative orchestration browser spec is registered", async () => {
  const spec = await readText("apps/web/tests/e2e/specs/phase-h/iterative-orchestration.spec.ts");

  assert.match(spec, /Iterative orchestration/);
  assert.match(spec, /Author, Editor, Reviser/);
  assert.match(spec, /iterative/i);
});

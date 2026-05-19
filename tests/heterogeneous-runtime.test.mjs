import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("heterogeneous runtime types define profiles, runs, feature flag, and safe input contracts", async () => {
  const types = await readText("packages/agent-runtime/src/heterogeneous/types.ts");

  assert.match(types, /HETEROGENEOUS_RUNNER_FEATURE_FLAG = "AGENTHUB_HETEROGENEOUS_ENABLED"/);
  assert.match(types, /HeterogeneousAgentProfile/);
  assert.match(types, /HeterogeneousRunEvent/);
  assert.match(types, /kind: "claude" \| "codex" \| "generic"/);
  assert.match(types, /args: string\[\]/);
  assert.match(types, /env: Record<string, string>/);
});

test("heterogeneous runner uses spawn with allowlisted commands, scoped env and cwd, cleanup, and streaming events", async () => {
  const runner = await readText("packages/agent-runtime/src/heterogeneous/runner.ts");

  assert.match(runner, /from "node:child_process"/);
  assert.match(runner, /spawn\(/);
  assert.doesNotMatch(runner, /\bexec\(/);
  assert.match(runner, /shell: false/);
  assert.match(runner, /validateCommandAllowlist/);
  assert.match(runner, /validateWorkingDirectory/);
  assert.match(runner, /scopeEnvironment/);
  assert.match(runner, /AbortSignal/);
  assert.match(runner, /child\.kill/);
  assert.match(runner, /type: "stdout"/);
  assert.match(runner, /type: "stderr"/);
  assert.match(runner, /feature_disabled/);
});

test("heterogeneous profiles and runs are persisted in schema and migration", async () => {
  const [schema, migration] = await Promise.all([
    readText("apps/web/src/server/db/schema.ts"),
    readText("apps/web/drizzle/0010_heterogeneous_agents.sql"),
  ]);

  assert.match(schema, /heterogeneousAgentProfiles = pgTable\(\s*\"heterogeneous_agent_profiles\"/);
  assert.match(schema, /heterogeneousAgentRuns = pgTable\(\s*\"heterogeneous_agent_runs\"/);
  assert.match(schema, /heterogeneous_profiles_user_idx/);
  assert.match(schema, /heterogeneous_runs_profile_idx/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS heterogeneous_agent_profiles/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS heterogeneous_agent_runs/);
  assert.match(migration, /ON DELETE CASCADE/);
});

test("heterogeneous router exposes CRUD and run procedures with ownership checks and persisted run state", async () => {
  const [router, appRouter] = await Promise.all([
    readText("apps/web/src/server/routers/heterogeneous.ts"),
    readText("apps/web/src/server/routers/_app.ts"),
  ]);

  for (const procedure of ["list", "create", "update", "delete", "runs", "startRun"]) {
    assert.match(router, new RegExp(`${procedure}:`), `missing heterogeneous.${procedure}`);
  }
  assert.match(router, /eq\(heterogeneousAgentProfiles\.userId, ctx\.user\.id\)/);
  assert.match(router, /runHeterogeneousAgent/);
  assert.match(router, /db\s*\.\s*insert\(\s*heterogeneousAgentRuns\s*\)/);
  assert.match(router, /status: "running"/);
  assert.match(router, /status: "success"/);
  assert.match(router, /status: "error"/);
  assert.match(appRouter, /heterogeneous: heterogeneousRouter/);
});

test("heterogeneous settings UI is feature-flagged and warns about native process permissions", async () => {
  const [component, settingsPage, spec] = await Promise.all([
    readText("apps/web/src/components/HeterogeneousAgentSettings.tsx"),
    readText("apps/web/src/app/settings/page.tsx"),
    readText("apps/web/tests/e2e/specs/phase-h/heterogeneous-runtime.spec.ts"),
  ]);

  assert.match(component, /Heterogeneous Agent Runtime/);
  assert.match(component, /AGENTHUB_HETEROGENEOUS_ENABLED/);
  assert.match(component, /native process/);
  assert.match(component, /Command allowlist/);
  assert.match(component, /Args JSON array/);
  assert.match(component, /Working directory/);
  assert.match(component, /Start test run/);
  assert.match(settingsPage, /<HeterogeneousAgentSettings \/>/);
  assert.match(spec, /Heterogeneous Agent Runtime/);
  assert.match(spec, /Command allowlist/);
});

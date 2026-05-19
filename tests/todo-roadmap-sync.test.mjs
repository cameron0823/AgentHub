import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("canonical TODO tracks verified completion blockers instead of historical phase claims", async () => {
  const todo = await readText("TODO.md");

  assert.match(todo, /^# AgentHub Roadmap \/ TODO/m);
  assert.match(todo, /Single source of truth for remaining AgentHub completion work\./);
  assert.match(todo, /docs\/reports\/2026-05-17-e2e-semantic-debugging-report\.md/);

  for (const requiredSection of [
    "## Current Status",
    "## Verified Healthy Through 2026-05-19",
    "## Verified Failing / Blocked On 2026-05-17",
    "## P0: Release Blockers",
    "## P1: Runtime Correctness And Real E2E Coverage",
    "## P2: Documentation, Tracking, And Release Hygiene",
    "## Completion Gates",
  ]) {
    assert.match(todo, new RegExp(`^${requiredSection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  }

  for (const verifiedGate of [
    "pnpm exec turbo run build --force",
    "E2E_OLLAMA=1",
    "pnpm -C apps/desktop prepare:web",
    "curl --max-time 8 -i http://127.0.0.1:3100/api/health/dependencies",
  ]) {
    assert.match(todo, new RegExp(verifiedGate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(todo, /No current release-gate failures remain/);
  assert.match(todo, /Deepen App-Backed Browser Coverage/);
  assert.match(todo, /Normalize Git \/ Release State/);

  assert.doesNotMatch(
    todo,
    /^- \[x\] \*\*Phase 3[3-9]:|^- \[x\] \*\*Phase 4[0-3]:/m,
    "TODO.md must not mark phases 33-43 runtime-complete without fresh app-backed verification",
  );
});

test("historical planning docs defer to the canonical TODO", async () => {
  const archiveDocs = [
    "DESIGN.md",
    "ARCHITECTURE.md",
    "RESEARCH.md",
    "AGENT_CONTEXT.md",
    "IMPLEMENTATION_PLAN.md",
    "IMPLEMENTATION_PLANS.md",
    "IMPLEMENTATION_ROADMAP.md",
    "MASTER_PLAN.md",
    "E2E_FEATURE_PLANS.md",
    "FEATURE_CATALOG.md",
    "FEATURE_TRACKER.md",
    "REQUIREMENTS_AUDIT.md",
    "REQUIREMENTS_AUDIT_2.md",
    "docs/IMPLEMENTATION_PLANS.md",
    "docs/plans/2026-05-15-lobehub-feature-task-plans.md",
    "docs/plans/2026-05-15-electron-desktop-shell-stabilization-plan.md",
    "docs/plans/2026-05-15-lobehub-parity-roadmap.md",
  ];

  for (const path of archiveDocs) {
    const source = await readText(path);
    assert.match(source, /TODO\.md/, `${path} must point future agents to TODO.md`);
    assert.match(source, /Archived|archive|Reference|Historical|backlog/i, `${path} must be labeled as non-canonical`);
  }
});

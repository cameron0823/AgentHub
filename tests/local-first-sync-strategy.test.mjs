import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ADR 0002 records the accepted local-first sync strategy", async () => {
  const adr = await readText("docs/adr/0002-local-first-sync-strategy.md");

  assert.match(adr, /^# ADR 0002: Local-First Sync Strategy/m);
  assert.match(adr, /## Status\s+Accepted\./);
  assert.match(adr, /PostgreSQL remains the canonical system of record/);
  assert.match(adr, /IndexedDB\/Yjs\/WebRTC sync is not part of the current production implementation/);
  assert.match(adr, /AGENTHUB_EXPERIMENTAL_LOCAL_SYNC/);
  assert.match(adr, /No sync conflict tests are required until the experimental sync flag is implemented/);
  assert.match(adr, /LobeHub 2\.0 is server-centric/);
});

test("current documentation points stale CRDT plans to ADR 0002", async () => {
  const [readme, design, architecture, implementationPlan, roadmap] = await Promise.all([
    readText("README.md"),
    readText("DESIGN.md"),
    readText("ARCHITECTURE.md"),
    readText("IMPLEMENTATION_PLAN.md"),
    readText("docs/plans/2026-05-15-lobehub-parity-roadmap.md"),
  ]);

  assert.match(readme, /not SQLite-only or fully offline/);
  assert.match(design, /Current implementation note: ADR 0002 supersedes this CRDT sync design/);
  assert.match(architecture, /Current implementation note: ADR 0002 supersedes local-first sync diagrams/);
  assert.match(implementationPlan, /Current implementation note: ADR 0002 supersedes this CRDT sync milestone/);
  assert.match(roadmap, /- \[x\] P41\.2 Decide and implement local-first sync strategy\./);
});

test("the current runtime does not add CRDT sync dependencies before the feature flag exists", async () => {
  const packageFiles = await Promise.all([
    readText("package.json"),
    readText("apps/web/package.json"),
    readText("packages/agent-runtime/package.json"),
  ]);

  for (const contents of packageFiles) {
    const pkg = JSON.parse(contents);
    const allDeps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
      ...(pkg.optionalDependencies ?? {}),
    };

    for (const forbiddenDependency of ["y-webrtc", "electric-sql", "dexie", "idb"]) {
      assert.equal(
        allDeps[forbiddenDependency],
        undefined,
        `${pkg.name} must not add ${forbiddenDependency} before AGENTHUB_EXPERIMENTAL_LOCAL_SYNC exists`,
      );
    }
  }
});

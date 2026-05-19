import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("memory maintenance helper is review-only and proposes concrete actions", async () => {
  const src = await readText("apps/web/src/server/memory-maintenance.ts");

  assert.match(src, /export type MemoryMaintenanceAction = "edit" \| "delete" \| "merge" \| "keep"/);
  assert.match(src, /export interface MemoryMaintenanceSuggestion/);
  for (const exportName of [
    "normalizeMemoryCategory",
    "scoreMemoryRelevanceDecay",
    "detectMemoryConflicts",
    "detectStaleMemories",
    "reviewMemoryEntries",
  ]) {
    assert.match(src, new RegExp(`export function ${exportName}`));
  }
  assert.match(src, /action: "edit"/, "must propose edits for normalizable or decayed memories");
  assert.match(src, /action: "delete"/, "must propose stale-memory deletions");
  assert.match(src, /action: "merge"/, "must propose conflict merges instead of silently choosing a value");
  assert.doesNotMatch(src, /db\.update|db\.delete|db\.insert/, "review helper must not mutate the database");
});

test("memory router exposes scoped review and explicit apply procedures", async () => {
  const router = await readText("apps/web/src/server/routers/memory.ts");

  assert.match(router, /reviewMemoryEntries/);
  assert.match(router, /maintenanceReview: authedProcedure/);
  assert.match(router, /applyMaintenanceSuggestion: authedProcedure/);
  assert.match(router, /scope: z\.enum\(\["all", "shared", "agent"\]\)/);
  assert.match(router, /eq\(memoryEntries\.userId, ctx\.user\.id\)/, "maintenance must stay user-scoped");
  assert.match(router, /isNull\(memoryEntries\.agentId\)/, "shared-memory scope must be supported");
  assert.match(router, /isNotNull\(memoryEntries\.agentId\)/, "agent-specific scope must be supported");
  assert.match(router, /status: "archived"/, "apply delete should archive rather than hard delete");
  assert.match(router, /relatedIds/, "merge suggestions must carry related memory ids");
});

test("agent prompt memory fetch includes shared and agent-specific accepted memories", async () => {
  const helper = await readText("apps/web/src/server/memory.ts");

  assert.match(helper, /or\(\s*isNull\(memoryEntries\.agentId\),\s*eq\(memoryEntries\.agentId, agentId\)\s*\)/s);
  assert.match(helper, /eq\(memoryEntries\.status, "accepted"\)/);
});

test("MemoryEditor exposes shared versus agent memory controls and review UI", async () => {
  const editor = await readText("apps/web/src/components/MemoryEditor.tsx");

  assert.match(editor, /scopeFilter/);
  assert.match(editor, /Shared memories/);
  assert.match(editor, /Agent-specific memories/);
  assert.match(editor, /data-testid="memory-maintenance-panel"/);
  assert.match(editor, /trpc\.memoryEntries\.maintenanceReview\.useMutation/);
  assert.match(editor, /trpc\.memoryEntries\.applyMaintenanceSuggestion\.useMutation/);
  assert.match(editor, /Review memories/);
  assert.match(editor, /Apply suggestion/);
});

test("memory maintenance E2E registration exists for browser coverage", async () => {
  const spec = await readText("apps/web/tests/e2e/specs/phase-h/memory-maintenance.spec.ts");

  assert.match(spec, /memory-maintenance-panel/);
  assert.match(spec, /Shared memories/);
  assert.match(spec, /Agent-specific memories/);
  assert.match(spec, /Review memories/);
});

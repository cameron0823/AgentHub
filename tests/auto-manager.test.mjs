import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("tasks router exposes user-scoped auto-manager state and actions", async () => {
  const router = await readText("apps/web/src/server/routers/tasks.ts");

  assert.match(router, /managerState: authedProcedure\.query/, "must expose manager state");
  assert.match(router, /runManager: authedProcedure/, "must expose manager mutation");
  for (const action of ["queue_ready", "retry_failed", "rebalance_unassigned", "annotate_blocked"]) {
    assert.match(router, new RegExp(action), `missing ${action} action`);
  }
  assert.match(router, /getManagerCandidates\(ctx\.user\.id\)/, "manager must load candidates for the current user");
  assert.match(router, /eq\(agentTasks\.userId, ctx\.user\.id\)/, "manager mutations must scope task updates");
  assert.match(router, /queueTask\(task\.id/, "manager must enqueue ready or retried tasks");
  assert.match(router, /Auto-manager assigned this task/, "manager must leave audit comments for assignment");
  assert.match(router, /Auto-manager is waiting on dependencies/, "manager must annotate blocked tasks");
});

test("TaskManager renders auto-manager controls and live recommendation counts", async () => {
  const manager = await readText("apps/web/src/components/TaskManager.tsx");

  assert.match(manager, /data-testid="auto-manager-panel"/);
  assert.match(manager, /trpc\.tasks\.managerState\.useQuery/);
  assert.match(manager, /trpc\.tasks\.runManager\.useMutation/);
  assert.match(manager, /Queue ready/);
  assert.match(manager, /Retry failed/);
  assert.match(manager, /Assign unassigned/);
  assert.match(manager, /Annotate blocked/);
  assert.match(manager, /refetchInterval: 30_000/, "auto-manager should keep its counts fresh");
});

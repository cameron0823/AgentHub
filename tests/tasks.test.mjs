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

describe("Agent Task System", () => {
  it("agentTasks table has dependsOn as JSON text column", async () => {
    const schema = await readText("apps/web/src/server/db/schema.ts");
    assert.match(schema, /agentTasks/, "agentTasks table must be defined");
    assert.match(schema, /depends_on/, "depends_on column must exist");
    assert.match(schema, /dependsOn.*text\("depends_on"\)/, "dependsOn must be text column (JSON)");
  });

  it("agentTasks table has priority and retry columns", async () => {
    const schema = await readText("apps/web/src/server/db/schema.ts");
    assert.match(schema, /retry_count/, "retry_count column must exist");
    assert.match(schema, /max_retries/, "max_retries column must exist");
    assert.match(schema, /priority.*integer/, "priority must be integer");
  });

  it("tasks router validates dep ownership before inserting", async () => {
    const router = await readText("apps/web/src/server/routers/tasks.ts");
    assert.match(router, /inArray.*depIds.*userId/, "must filter deps by userId for ownership");
    assert.match(router, /owned\.length !== depIds\.length/, "must reject if any dep not owned");
  });

  it("tasks router prevents cancel/delete of running tasks", async () => {
    const router = await readText("apps/web/src/server/routers/tasks.ts");
    assert.match(router, /Cannot cancel a running task/, "cancel must guard running status");
    assert.match(router, /Cannot delete a running task/, "delete must guard running status");
  });

  it("task worker uses exponential backoff on retry", async () => {
    const worker = await readText("apps/web/src/server/workers/taskWorker.ts");
    assert.match(worker, /Math\.pow\(2, retryCount\)/, "must use exponential backoff");
    assert.match(worker, /retryCount <= .*maxRetries/, "must check retry count against maxRetries");
  });

  it("task worker resolves downstream dependencies after task success", async () => {
    const worker = await readText("apps/web/src/server/workers/taskWorker.ts");
    assert.match(worker, /resolveDownstream/, "resolveDownstream function must exist");
    assert.match(worker, /allDone/, "must check if all deps are done");
    assert.match(worker, /taskQueue\.add/, "must enqueue dependent task when unblocked");
  });

  it("task worker queues new deps-free task immediately on create", async () => {
    const router = await readText("apps/web/src/server/routers/tasks.ts");
    assert.match(router, /depIds\.length === 0/, "must detect no-dep case");
    assert.match(router, /status.*queued/, "must set status to queued immediately");
    assert.match(router, /taskQueue\.add.*taskId/, "must enqueue task immediately");
  });

  it("BullMQ priority maps task priority to BullMQ value correctly", async () => {
    const worker = await readText("apps/web/src/server/workers/taskWorker.ts");
    assert.match(worker, /3 - .*priority/, "BullMQ priority = 3 - task.priority (inverted)");
  });

  it("TaskManager component shows status badges and expand details", async () => {
    const component = await readText("apps/web/src/components/TaskManager.tsx");
    assert.match(component, /StatusBadge/, "StatusBadge component must exist");
    assert.match(component, /expanded/, "expand/collapse state must exist");
    assert.match(component, /tasks\.cancel/, "cancel mutation must be wired");
    assert.match(component, /tasks\.retry/, "retry mutation must be wired");
    assert.match(component, /tasks\.delete/, "delete mutation must be wired");
  });

  it("tasks page is registered in the app router", async () => {
    const appRouter = await readText("apps/web/src/server/routers/_app.ts");
    assert.match(appRouter, /tasks.*tasksRouter/, "tasks router must be wired in appRouter");
  });

  it("MainView union includes tasks", async () => {
    const store = await readText("apps/web/src/stores/chatStore.ts");
    assert.match(store, /MainView.*tasks/, "tasks must be in MainView union type");
  });

  it("Sidebar includes Tasks navigation link", async () => {
    const sidebar = await readText("apps/web/src/components/Sidebar.tsx");
    assert.match(sidebar, /href="\/tasks"/, "Tasks link must point to /tasks");
    assert.match(sidebar, /ListTodo/, "ListTodo icon must be used for Tasks nav");
  });

  it("instrumentation starts task worker", async () => {
    const instrumentation = await readText("apps/web/src/instrumentation.ts");
    assert.match(instrumentation, /startTaskWorker/, "task worker must be started in instrumentation");
  });
});

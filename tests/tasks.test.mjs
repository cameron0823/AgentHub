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
  it("agentTasks table has dependsOn as structured JSONB column", async () => {
    const schema = await readText("apps/web/src/server/db/schema.ts");
    assert.match(schema, /agentTasks/, "agentTasks table must be defined");
    assert.match(schema, /depends_on/, "depends_on column must exist");
    assert.match(schema, /dependsOn.*jsonb\(\s*\"depends_on\"\)/, "dependsOn must be structured jsonb");
    assert.match(schema, /\$type<string\[\]>\(\)/, "dependsOn must be typed as string array");
  });

  it("agentTasks table has priority and retry columns", async () => {
    const schema = await readText("apps/web/src/server/db/schema.ts");
    assert.match(schema, /retry_count/, "retry_count column must exist");
    assert.match(schema, /max_retries/, "max_retries column must exist");
    assert.match(schema, /priority.*integer/, "priority must be integer");
  });

  it("agent task schema supports parent tasks, comments, and templates", async () => {
    const schema = await readText("apps/web/src/server/db/schema.ts");
    const migration = await readText("apps/web/drizzle/0012_agent_task_threads.sql");
    assert.match(schema, /parentTaskId.*parent_task_id/, "tasks must support parent_task_id");
    assert.match(schema, /templateId.*template_id/, "tasks must record originating template_id");
    assert.match(schema, /agentTaskComments/, "task comments table must be defined");
    assert.match(schema, /authorType.*author_type/, "comments must capture human/agent/system author type");
    assert.match(schema, /agentTaskTemplates/, "task templates table must be defined");
    assert.match(schema, /subtasks.*jsonb/, "templates must support subtask definitions");
    assert.match(migration, /agent_task_comments/, "migration must create task comments");
    assert.match(migration, /agent_task_templates/, "migration must create task templates");
    assert.match(migration, /parent_task_id/, "migration must add parent_task_id");
  });

  it("tasks router validates dep ownership before inserting", async () => {
    const router = await readText("apps/web/src/server/routers/tasks.ts");
    assert.match(router, /inArray.*depIds.*userId/, "must filter deps by userId for ownership");
    assert.match(router, /owned\.length !== depIds\.length/, "must reject if any dep not owned");
  });

  it("tasks router exposes Lobe-style filters, pagination, status aliases, and comments", async () => {
    const router = await readText("apps/web/src/server/routers/tasks.ts");
    assert.match(router, /STATUS_ALIAS_MAP/, "router must map Lobe-style status aliases");
    assert.match(router, /todo.*pending.*queued/s, "todo must map to pending/queued statuses");
    assert.match(router, /in_progress.*running/s, "in_progress must map to running status");
    assert.match(router, /done.*success/s, "done must map to success status");
    assert.match(router, /limit.*min\(1\).*max\(100\)/s, "list must cap pagination size");
    assert.match(router, /nextCursor/, "list must return nextCursor for pagination");
    assert.match(router, /parentTaskId/, "list and create must handle parent task filters");
    assert.match(router, /addComment/, "router must support adding comments");
    assert.match(router, /comments/, "router must support listing comments");
  });

  it("tasks router supports templates, parent fan-out, and reassignment", async () => {
    const router = await readText("apps/web/src/server/routers/tasks.ts");
    assert.match(router, /templates/, "router must list templates");
    assert.match(router, /createTemplate/, "router must create templates");
    assert.match(router, /deleteTemplate/, "router must delete templates");
    assert.match(router, /subtasks/, "task creation must accept subtask fan-out");
    assert.match(router, /parentTaskId: row\.id/, "subtasks must be attached to the parent task");
    assert.match(router, /dependsOn: \[row\.id\]/, "fan-out subtasks must depend on parent completion");
    assert.doesNotMatch(router, /dependsOn: JSON\.stringify/, "task dependencies should not be JSON-in-text");
    assert.match(router, /reassign/, "router must support task reassignment");
    assert.match(router, /agents\.userId/, "reassignment must validate agent ownership");
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

  it("task worker preserves parent fan-out and Lobe-style status progression", async () => {
    const worker = await readText("apps/web/src/server/workers/taskWorker.ts");
    assert.match(worker, /parentTaskId/, "worker must look at parent-linked subtasks");
    assert.match(worker, /queueReadyChildren/, "worker must queue children after parent success");
    assert.match(worker, /status: "running"/, "worker must preserve in-progress runtime status");
    assert.match(worker, /status: "success"/, "worker must preserve done runtime status");
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

  it("TaskManager exposes Lobe-style task management controls", async () => {
    const component = await readText("apps/web/src/components/TaskManager.tsx");
    assert.match(component, /Status filter/, "UI must expose status filters");
    assert.match(component, /Template/, "UI must expose templates");
    assert.match(component, /Subtasks/, "UI must expose parent/subtask fan-out");
    assert.match(component, /Comments/, "UI must expose task comments");
    assert.match(component, /Reassign/, "UI must expose task reassignment");
    assert.match(component, /tasks\.addComment/, "comment mutation must be wired");
    assert.match(component, /tasks\.reassign/, "reassign mutation must be wired");
    assert.match(component, /tasks\.createTemplate/, "template creation mutation must be wired");
    assert.match(component, /nextCursor/, "pagination must be wired");
  });

  it("tasks page is registered in the app router", async () => {
    const appRouter = await readText("apps/web/src/server/routers/_app.ts");
    assert.match(appRouter, /tasks.*tasksRouter/, "tasks router must be wired in appRouter");
  });

  it("MainView union includes tasks", async () => {
    const store = await readText("apps/web/src/stores/chatStore.ts");
    assert.match(store, /MainView[\s\S]*tasks/, "tasks must be in MainView union type");
  });

  it("Sidebar includes Tasks navigation link", async () => {
    const sidebar = await readText("apps/web/src/components/Sidebar.tsx");
    assert.match(sidebar, /href="\/tasks"/, "Tasks link must point to /tasks");
    assert.match(sidebar, /ListTodo/, "ListTodo icon must be used for Tasks nav");
  });

  it("workers have a dedicated process entrypoint and instrumentation only starts them by explicit opt-in", async () => {
    const [instrumentation, workerStart, pkg] = await Promise.all([
      readText("apps/web/src/instrumentation.ts"),
      readText("apps/web/src/server/workers/start.ts"),
      readText("apps/web/package.json"),
    ]);
    assert.match(instrumentation, /shouldStartInlineWorkers/, "instrumentation must check explicit worker opt-in");
    assert.doesNotMatch(instrumentation, /startTaskWorker\(/, "instrumentation must not directly start task workers");
    assert.match(workerStart, /AGENTHUB_WORKER_MODE === "inline"/, "inline workers must be opt-in");
    assert.match(workerStart, /startTaskWorker/, "dedicated worker starter must own task worker startup");
    assert.match(pkg, /"workers": "tsx scripts\/start-workers\.ts"/, "web package must expose a worker process script");
  });
});

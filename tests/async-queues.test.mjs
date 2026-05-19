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

describe("Async queue infrastructure", () => {
  it("defines shared BullMQ queues with Redis-safe connection options and retry policies", async () => {
    const queues = await readText("apps/web/src/server/queues/index.ts");

    assert.match(queues, /maxRetriesPerRequest: null/);
    assert.match(queues, /enableReadyCheck: false/);
    assert.match(queues, /AGENTHUB_QUEUE_PREFIX/);
    assert.match(queues, /prefix: queuePrefix/);
    for (const queue of ["file-ingestion", "agent-flow", "image-generation", "export", "knowledge-indexing"]) {
      assert.match(queues, new RegExp(queue), `missing ${queue} queue`);
    }
    assert.match(queues, /backoff:\s*\{\s*type:\s*"exponential",\s*delay:\s*5_?000\s*\}/);
    assert.match(queues, /JobProgressPublisher/);
    assert.match(queues, /getQueueMetrics/);
  });

  it("disables queue clients during build-time/background-disabled execution", async () => {
    const queues = await readText("apps/web/src/server/queues/index.ts");

    assert.match(queues, /queuesDisabled/);
    assert.match(queues, /AGENTHUB_DISABLE_BACKGROUND_WORKERS/);
    assert.match(queues, /AGENTHUB_DISABLE_QUEUES/);
    assert.match(queues, /phase-production-build/);
    assert.match(queues, /class DisabledQueue/);
    assert.match(queues, /return new DisabledQueue/);
  });

  it("records exhausted jobs to a dead-letter queue and exposes monitoring in admin", async () => {
    const [deadLetter, schema, migration, taskWorker, automationWorker, adminRouter, adminPanel] = await Promise.all([
      readText("apps/web/src/server/queues/dead-letter.ts"),
      readText("apps/web/src/server/db/schema.ts"),
      readText("apps/web/drizzle/0026_durable_orchestration_state.sql"),
      readText("apps/web/src/server/workers/taskWorker.ts"),
      readText("apps/web/src/server/workers/automationWorker.ts"),
      readText("apps/web/src/server/routers/admin.ts"),
      readText("apps/web/src/components/AdminPanel.tsx"),
    ]);

    assert.match(deadLetter, /export class DeadLetterQueue/);
    assert.match(deadLetter, /deadLetterEntries/);
    assert.match(deadLetter, /db\s*\.\s*insert\(\s*deadLetterEntries\s*\)/);
    assert.match(deadLetter, /listMemory/);
    assert.match(schema, /export const deadLetterEntries = pgTable\(\s*"dead_letter_entries"/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS "dead_letter_entries"/);
    assert.match(deadLetter, /failureCategory/);
    assert.match(deadLetter, /retryCount/);
    assert.match(taskWorker, /deadLetterQueue\.record/);
    assert.match(automationWorker, /deadLetterQueue\.record/);
    assert.match(adminRouter, /queues: adminProcedure\.query/);
    assert.match(adminRouter, /getQueueMetrics/);
    assert.match(adminPanel, /QueuesTab/);
    assert.match(adminPanel, /Dead letters/);
  });

  it("exports BullMQ job metrics in Prometheus format", async () => {
    const metrics = await readText("apps/web/src/app/api/metrics/route.ts");

    assert.match(metrics, /getQueueMetrics/);
    assert.match(metrics, /bullmq_jobs/);
    assert.match(metrics, /queue: item\.queue/);
    assert.match(metrics, /state/);
  });

  it("streams authenticated queue progress events to task UI surfaces", async () => {
    const [route, queues, taskWorker, automationWorker, taskManager] = await Promise.all([
      readText("apps/web/src/app/api/queues/progress/route.ts"),
      readText("apps/web/src/server/queues/index.ts"),
      readText("apps/web/src/server/workers/taskWorker.ts"),
      readText("apps/web/src/server/workers/automationWorker.ts"),
      readText("apps/web/src/components/TaskManager.tsx"),
    ]);

    assert.match(route, /auth\(req\.headers\)/);
    assert.match(route, /text\/event-stream/);
    assert.match(route, /jobProgressPublisher\.subscribe/);
    assert.match(route, /event: \$\{event\}/);
    assert.match(queues, /publish\(event: JobProgressEvent\)/);
    assert.match(taskWorker, /jobProgressPublisher\.publish/);
    assert.match(automationWorker, /jobProgressPublisher\.publish/);
    assert.match(taskManager, /new EventSource\("\/api\/queues\/progress"\)/);
    assert.match(taskManager, /Live queue progress/);
    assert.match(taskManager, /formatQueueProgress/);
  });

  it("keeps a live Redis worker proof for a real queued automation job", async () => {
    const [script, packageJson] = await Promise.all([
      readText("apps/web/scripts/redis-worker-proof.ts"),
      readText("apps/web/package.json"),
    ]);

    assert.match(packageJson, /"redis:worker:proof": "tsx scripts\/redis-worker-proof\.ts"/);
    assert.match(script, /startAutomationWorker\(\)/, "proof must start the app automation worker");
    assert.match(script, /AGENTHUB_QUEUE_PREFIX/, "proof must isolate its BullMQ prefix from live app workers");
    assert.match(script, /automationQueue\.add\("run"/, "proof must enqueue a real BullMQ automation job");
    assert.match(script, /waitForProcessedRun/, "proof must wait for persisted worker output");
    assert.match(script, /Automation maxExecutions limit reached/, "proof must assert deterministic worker behavior");
    assert.match(script, /max_executions_reached/, "proof must assert persisted automation pause state");
    assert.match(script, /worker\.close\(\)/, "proof must close the worker after validation");
    assert.match(script, /automationQueue\.close/, "proof must close the queue client after validation");
  });
});

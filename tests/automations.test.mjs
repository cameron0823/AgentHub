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

describe("Automations", () => {
  it("automations schema has cron, isActive, prompt, and webhookUrl columns", async () => {
    const src = await readText("apps/web/src/server/db/schema.ts");
    assert.match(src, /automations = pgTable\("automations"/, "must define automations table");
    assert.match(src, /cronExpression.*text|text.*cronExpression/, "must have cronExpression column");
    assert.match(src, /isActive.*boolean|boolean.*isActive/, "must have isActive boolean column");
    assert.match(src, /prompt.*text|text.*prompt/, "must have prompt column");
    assert.match(src, /webhookUrl.*text|text.*webhookUrl/, "must have webhookUrl column");
  });

  it("automationRuns schema has status enum with pending, running, success, error", async () => {
    const src = await readText("apps/web/src/server/db/schema.ts");
    assert.match(src, /automationRuns = pgTable\("automation_runs"/, "must define automation_runs table");
    assert.match(src, /pending.*running.*success.*error|status.*enum/, "must have status enum column");
    assert.match(src, /output.*text|text.*output/, "must have output column");
    assert.match(src, /error.*text|text.*error/, "must have error column");
  });

  it("automationsRouter registers all required procedures", async () => {
    const src = await readText("apps/web/src/server/routers/automations.ts");
    assert.match(src, /list: authedProcedure/, "must have list procedure");
    assert.match(src, /create: authedProcedure/, "must have create procedure");
    assert.match(src, /toggle: authedProcedure|update: authedProcedure/, "must have toggle/update procedure");
    assert.match(src, /delete: authedProcedure/, "must have delete procedure");
    assert.match(src, /runs: authedProcedure/, "must have runs procedure for run history");
    assert.match(src, /triggerNow: authedProcedure/, "must have triggerNow procedure");
  });

  it("automationsRouter enforces userId ownership on all mutations", async () => {
    const src = await readText("apps/web/src/server/routers/automations.ts");
    assert.match(src, /eq\(automations\.userId, ctx\.user\.id\)/, "must scope to authenticated user");
    assert.match(src, /and\(eq\(automations\.id/, "must check both id and userId for mutations");
  });

  it("triggerNow enqueues runs via BullMQ automationQueue", async () => {
    const [router, worker] = await Promise.all([
      readText("apps/web/src/server/routers/automations.ts"),
      readText("apps/web/src/server/workers/automationWorker.ts"),
    ]);
    assert.match(router, /automationQueue/, "triggerNow must use automationQueue");
    assert.match(router, /automationRuns.*insert|insert.*automationRuns/, "must create a run record before enqueuing");
    assert.match(worker, /Queue.*bullmq|bullmq.*Queue/, "worker must use BullMQ Queue");
    assert.match(worker, /automationQueue = new Queue/, "must export automationQueue");
  });

  it("automationsRouter is wired into the root tRPC router", async () => {
    const src = await readText("apps/web/src/server/routers/_app.ts");
    assert.match(src, /import.*automationsRouter.*from.*automations/, "must import automationsRouter");
    assert.match(src, /automations: automationsRouter/, "must register under automations key");
  });

  it("AutomationsManager shows cron expression, enable toggle, and trigger button", async () => {
    const src = await readText("apps/web/src/components/AutomationsManager.tsx");
    assert.match(src, /cronExpression|cron/, "must display cron expression");
    assert.match(src, /isActive/, "must show enable/disable toggle using isActive");
    assert.match(src, /triggerNow|trigger\.mutate/, "must have trigger now button");
    assert.match(src, /trpc\.automations\.runs\.useQuery/, "must query run history");
  });

  it("automations page renders AutomationsManager", async () => {
    const src = await readText("apps/web/src/app/automations/page.tsx");
    assert.match(src, /AutomationsManager/, "automations page must render AutomationsManager");
  });
});

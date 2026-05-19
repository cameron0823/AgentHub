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
    assert.match(src, /automations = pgTable\(\s*\"automations\"/, "must define automations table");
    assert.match(src, /cronExpression.*text|text.*cronExpression/, "must have cronExpression column");
    assert.match(src, /isActive.*boolean|boolean.*isActive/, "must have isActive boolean column");
    assert.match(src, /prompt.*text|text.*prompt/, "must have prompt column");
    assert.match(src, /webhookUrl.*text|text.*webhookUrl/, "must have webhookUrl column");
  });

  it("automation hardening schema adds timezone, max executions, pause, notification, and session link columns", async () => {
    const [schema, migration] = await Promise.all([
      readText("apps/web/src/server/db/schema.ts"),
      readText("apps/web/drizzle/0011_automation_hardening.sql"),
    ]);

    assert.match(schema, /timezone.*text|text.*timezone/, "automations must store timezone");
    assert.match(schema, /maxExecutions.*integer|integer.*maxExecutions/, "automations must store maxExecutions");
    assert.match(schema, /executionCount.*integer|integer.*executionCount/, "automations must track executionCount");
    assert.match(schema, /pausedAt.*timestamp|timestamp.*pausedAt/, "automations must store pausedAt");
    assert.match(
      schema,
      /notificationWebhookUrl.*text|text.*notificationWebhookUrl/,
      "automations must store notificationWebhookUrl",
    );
    assert.match(schema, /sessionId.*uuid|uuid.*sessionId/, "automation runs must link created sessions");
    assert.match(
      schema,
      /notificationStatus.*text|text.*notificationStatus/,
      "automation runs must track notificationStatus",
    );
    assert.match(migration, /ALTER TABLE automations ADD COLUMN IF NOT EXISTS timezone/);
    assert.match(migration, /ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS session_id/);
  });

  it("automationRuns schema has status enum with pending, running, success, error", async () => {
    const src = await readText("apps/web/src/server/db/schema.ts");
    assert.match(src, /automationRuns = pgTable\(\s*\"automation_runs\"/, "must define automation_runs table");
    assert.match(src, /pending.*running.*success.*error|status.*enum/, "must have status enum column");
    assert.match(src, /output.*text|text.*output/, "must have output column");
    assert.match(src, /error.*text|text.*error/, "must have error column");
  });

  it("automationsRouter registers all required procedures", async () => {
    const src = await readText("apps/web/src/server/routers/automations.ts");
    assert.match(src, /list: authedProcedure/, "must have list procedure");
    assert.match(src, /create: authedProcedure/, "must have create procedure");
    assert.match(src, /toggle: authedProcedure|update: authedProcedure/, "must have toggle/update procedure");
    assert.match(src, /pause: authedProcedure/, "must have pause procedure");
    assert.match(src, /resume: authedProcedure/, "must have resume procedure");
    assert.match(src, /delete: authedProcedure/, "must have delete procedure");
    assert.match(src, /runs: authedProcedure/, "must have runs procedure for run history");
    assert.match(src, /triggerNow: authedProcedure/, "must have triggerNow procedure");
  });

  it("automationsRouter validates cron/timezone/max execution settings and exposes hardening fields", async () => {
    const src = await readText("apps/web/src/server/routers/automations.ts");
    assert.match(src, /cron\.validate/, "must validate cron expressions before insert");
    assert.match(src, /isValidTimezone/, "must validate timezone names before insert");
    assert.match(src, /maxExecutions/, "must accept maxExecutions");
    assert.match(src, /notificationWebhookUrl/, "must accept notificationWebhookUrl");
    assert.match(src, /executionCount/, "must return executionCount");
    assert.match(src, /sessionId/, "run history must return linked sessionId");
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
    assert.match(worker, /createQueue/, "worker must use shared BullMQ queue factory");
    assert.match(worker, /automationQueue = createQueue/, "must export automationQueue");
  });

  it("automation worker enforces max executions, schedules with timezone, creates chat sessions, and sends notifications", async () => {
    const worker = await readText("apps/web/src/server/workers/automationWorker.ts");

    assert.match(worker, /maxExecutions/, "worker must enforce max execution limits");
    assert.match(worker, /executionCount/, "worker must update execution count");
    assert.match(worker, /timezone/, "worker must pass timezone to cron.schedule");
    assert.match(worker, /cron\.schedule\(\s*auto\.cronExpression/, "worker must schedule each automation cron");
    assert.match(worker, /chatSessions/, "worker must create run chat sessions");
    assert.match(worker, /messagesTable/, "worker must persist user and assistant messages");
    assert.match(worker, /sessionId/, "worker must write run session links");
    assert.match(worker, /sendNotification/, "worker must send notification hooks");
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

  it("AutomationsManager exposes timezone, presets, max runs, pause/resume, notifications, and session links", async () => {
    const src = await readText("apps/web/src/components/AutomationsManager.tsx");

    assert.match(src, /Timezone/, "must render timezone input");
    assert.match(src, /Frequency presets/, "must render frequency presets");
    assert.match(src, /Max executions/, "must render max executions input");
    assert.match(src, /Notification webhook/, "must render notification hook input");
    assert.match(src, /pause\.mutate/, "must expose pause action");
    assert.match(src, /resume\.mutate/, "must expose resume action");
    assert.match(src, /sessionId/, "run history must render linked session IDs");
    assert.match(src, /Open session/, "run history must link to created session");
  });

  it("automations page renders AutomationsManager", async () => {
    const src = await readText("apps/web/src/app/automations/page.tsx");
    assert.match(src, /AutomationsManager/, "automations page must render AutomationsManager");
  });
});

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

describe("P40.6 Agent Signal nightly self-review", () => {
  it("schema and migration persist reviews and findings linked to agents and tasks", async () => {
    const schema = await readText("apps/web/src/server/db/schema.ts");
    assert.match(
      schema,
      /export const agentSignalReviews = pgTable\(\s*"agent_signal_reviews"/,
      "reviews table must exist",
    );
    assert.match(
      schema,
      /export const agentSignalReviewItems = pgTable\(\s*"agent_signal_review_items"/,
      "review items table must exist",
    );
    assert.match(schema, /agentId: uuid\(\s*"agent_id"\s*\)/, "items must link affected agents");
    assert.match(schema, /taskId: uuid\(\s*"task_id"\s*\)/, "items must link affected tasks");
    assert.match(schema, /skillId: uuid\(\s*"skill_id"\s*\)/, "items must link affected skills");
    assert.match(schema, /severity: text\(\s*"severity"/, "items must track severity");
    assert.match(schema, /policyVersion: text\(\s*"policy_version"\s*\)/, "reviews must track policy version");

    const migration = await readText("apps/web/drizzle/0021_agent_signal.sql");
    assert.match(migration, /CREATE TABLE IF NOT EXISTS agent_signal_reviews/, "migration must create reviews");
    assert.match(
      migration,
      /CREATE TABLE IF NOT EXISTS agent_signal_review_items/,
      "migration must create review items",
    );
    assert.match(migration, /agent_signal_items_agent_idx/, "migration must index agent links");
    assert.match(migration, /agent_signal_items_task_idx/, "migration must index task links");
  });

  it("Agent Signal pipeline uses skill and tool policy inputs to create findings", async () => {
    const signal = await readText("apps/web/src/server/agent-signal.ts");
    assert.match(signal, /AGENT_SIGNAL_CRON/, "pipeline must define nightly schedule");
    assert.match(signal, /buildAgentSignalPolicyInputs/, "pipeline must collect policy inputs");
    assert.match(signal, /TOOL_PROFILES/, "pipeline must use tool profile policy catalog");
    assert.match(signal, /compileToolProfile/, "pipeline must compile selected agent tools");
    assert.match(signal, /installedSkills/, "pipeline must inspect installed skills");
    assert.match(signal, /agentTasks/, "pipeline must inspect task outcomes");
    assert.match(signal, /createAgentSignalFinding/, "pipeline must create findings");
    assert.match(signal, /runAgentSignalForUser/, "pipeline must run for one user");
    assert.match(signal, /runAgentSignalForAllUsers/, "pipeline must run for all users");
  });

  it("Agent Signal router exposes latest, items, and manual run procedures", async () => {
    const [router, appRouter] = await Promise.all([
      readText("apps/web/src/server/routers/agentSignal.ts"),
      readText("apps/web/src/server/routers/_app.ts"),
    ]);
    assert.match(router, /latest: authedProcedure/, "router must expose latest review");
    assert.match(router, /items: authedProcedure/, "router must expose review items");
    assert.match(router, /runNow: authedProcedure/, "router must expose manual self-review");
    assert.match(router, /eq\(agentSignalReviews\.userId, ctx\.user\.id\)/, "router must scope reviews by user");
    assert.match(appRouter, /import.*agentSignalRouter.*from.*agentSignal/, "root router must import Agent Signal");
    assert.match(appRouter, /agentSignal: agentSignalRouter/, "root router must register Agent Signal");
  });

  it("nightly worker schedules Agent Signal and refreshes the Daily Brief", async () => {
    const [worker, workerStart, instrumentation] = await Promise.all([
      readText("apps/web/src/server/workers/agentSignalWorker.ts"),
      readText("apps/web/src/server/workers/start.ts"),
      readText("apps/web/src/instrumentation.ts"),
    ]);
    assert.match(worker, /cron\.schedule\(\s*AGENT_SIGNAL_CRON/, "worker must schedule nightly reviews");
    assert.match(worker, /runAgentSignalForAllUsers/, "worker must run Agent Signal for all users");
    assert.match(worker, /generateScheduledDailyBriefs/, "worker must refresh scheduled briefs after review");
    assert.match(workerStart, /startAgentSignalWorker/, "dedicated worker entrypoint must start Agent Signal worker");
    assert.match(instrumentation, /shouldStartInlineWorkers/, "Next instrumentation must gate inline worker startup");
    assert.doesNotMatch(
      instrumentation,
      /startAgentSignalWorker\(\)/,
      "instrumentation must not directly start Agent Signal worker",
    );
  });

  it("Daily Brief includes recent Agent Signal findings", async () => {
    const brief = await readText("apps/web/src/server/daily-brief.ts");
    assert.match(brief, /agentSignalReviewItems/, "brief generator must read Agent Signal findings");
    assert.match(brief, /agentSignalFindings/, "brief source counts must include Agent Signal findings");
    assert.match(brief, /Agent Signal/, "brief sections must label Agent Signal findings");
  });
});

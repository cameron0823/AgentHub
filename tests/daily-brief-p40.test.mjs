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

describe("P40.4 Daily Brief", () => {
  it("schema and migration store generated daily briefs with source counts and schedule metadata", async () => {
    const schema = await readText("apps/web/src/server/db/schema.ts");
    assert.match(schema, /export const dailyBriefs = pgTable\(\s*"daily_briefs"/, "daily briefs table must exist");
    assert.match(schema, /generatedForDate: text\(\s*"generated_for_date"\s*\)/, "briefs must track the target day");
    assert.match(schema, /summary: text\(\s*"summary"\s*\)/, "briefs must store the generated summary");
    assert.match(schema, /highlights: jsonb\(\s*"highlights"\s*\)/, "briefs must store highlights");
    assert.match(schema, /sections: jsonb\(\s*"sections"\s*\)/, "briefs must store source sections");
    assert.match(schema, /sourceCounts: jsonb\(\s*"source_counts"\s*\)/, "briefs must store source counts");
    assert.match(schema, /scheduledFor: timestamp\(\s*"scheduled_for"/, "briefs must track scheduled generation");

    const migration = await readText("apps/web/drizzle/0020_daily_brief.sql");
    assert.match(migration, /CREATE TABLE IF NOT EXISTS daily_briefs/, "migration must create daily briefs");
    assert.match(migration, /daily_briefs_user_generated_idx/, "migration must index latest lookup");
  });

  it("daily brief generator summarizes tasks, automations, memory changes, alerts, and scheduled summaries", async () => {
    const generator = await readText("apps/web/src/server/daily-brief.ts");
    assert.match(generator, /collectDailyBriefSources/, "generator must collect source records");
    assert.match(generator, /agentTasks/, "generator must include agent tasks");
    assert.match(generator, /automations/, "generator must include scheduled automations");
    assert.match(generator, /automationRuns/, "generator must include automation run outputs");
    assert.match(generator, /memoryEntries/, "generator must include memory changes");
    assert.match(generator, /alerts/, "generator must derive alert items");
    assert.match(generator, /scheduledSummaries/, "generator must include scheduled summaries");
    assert.match(generator, /createDailyBriefForUser/, "generator must persist a brief");
  });

  it("daily briefs router supports latest lookup and manual refresh", async () => {
    const router = await readText("apps/web/src/server/routers/dailyBriefs.ts");
    assert.match(router, /latest: authedProcedure/, "router must expose latest brief lookup");
    assert.match(router, /generate: authedProcedure/, "router must expose manual generation");
    assert.match(router, /createDailyBriefForUser/, "router must call the generator");
    assert.match(router, /eq\(dailyBriefs\.userId, ctx\.user\.id\)/, "brief lookup must scope by user");

    const appRouter = await readText("apps/web/src/server/routers/_app.ts");
    assert.match(appRouter, /import.*dailyBriefsRouter.*from.*dailyBriefs/, "root router must import daily briefs");
    assert.match(appRouter, /dailyBriefs: dailyBriefsRouter/, "root router must register daily briefs");
  });

  it("daily brief worker schedules generation and is started by the shared worker entrypoint", async () => {
    const [worker, workerStart, instrumentation, packageJson] = await Promise.all([
      readText("apps/web/src/server/workers/dailyBriefWorker.ts"),
      readText("apps/web/src/server/workers/start.ts"),
      readText("apps/web/src/instrumentation.ts"),
      readText("apps/web/package.json"),
    ]);
    assert.match(worker, /DAILY_BRIEF_CRON/, "worker must define a daily schedule");
    assert.match(worker, /cron\.schedule\(\s*DAILY_BRIEF_CRON/, "worker must register the cron schedule");
    assert.match(worker, /generateScheduledDailyBriefs/, "worker must call scheduled generation");
    assert.match(workerStart, /startDailyBriefWorker/, "shared worker entrypoint must start the daily brief worker");
    assert.match(
      packageJson,
      /"workers": "tsx scripts\/start-workers\.ts"/,
      "web package must expose a dedicated workers command",
    );
    assert.match(instrumentation, /shouldStartInlineWorkers/, "instrumentation must gate inline worker startup");
    assert.match(
      instrumentation,
      /startBackgroundWorkers/,
      "instrumentation must use the shared worker entrypoint only after opt-in",
    );
  });

  it("homepage UI shows the Daily Brief and a manual refresh action", async () => {
    const [component, page] = await Promise.all([
      readText("apps/web/src/components/DailyBriefPanel.tsx"),
      readText("apps/web/src/app/page.tsx"),
    ]);
    assert.match(component, /trpc\.dailyBriefs\.latest\.useQuery/, "panel must load the latest brief");
    assert.match(component, /trpc\.dailyBriefs\.generate\.useMutation/, "panel must refresh manually");
    assert.match(component, /Daily Brief/, "panel must render the brief title");
    assert.match(component, /Refresh brief/, "panel must render a manual refresh button");
    assert.match(component, /data-testid="daily-brief-panel"/, "panel must be browser-testable");
    assert.match(page, /DailyBriefPanel/, "homepage must render the brief panel");
  });
});

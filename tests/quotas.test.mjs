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

describe("User quotas", () => {
  it("adds quota schema, migration, and monthly reset fields", async () => {
    const [schema, migration, journal] = await Promise.all([
      readText("apps/web/src/server/db/schema.ts"),
      readText("apps/web/drizzle/0025_user_quotas.sql"),
      readText("apps/web/drizzle/meta/_journal.json"),
    ]);

    assert.match(schema, /export const userQuotas = pgTable\(\s*\"user_quotas\"/);
    assert.match(schema, /messagesSent: integer\(\s*\"messages_sent\"\)\.notNull\(\)\.default\(0\)/);
    assert.match(schema, /tokensUsed: integer\(\s*\"tokens_used\"\)\.notNull\(\)\.default\(0\)/);
    assert.match(schema, /storageUsed: integer\(\s*\"storage_used\"\)\.notNull\(\)\.default\(0\)/);
    assert.match(schema, /apiCalls: integer\(\s*\"api_calls\"\)\.notNull\(\)\.default\(0\)/);
    assert.match(schema, /maxMessages: integer\(\s*\"max_messages\"\)\.notNull\(\)\.default\(100\)/);
    assert.match(schema, /maxTokens: integer\(\s*\"max_tokens\"\)\.notNull\(\)\.default\(1_000_000\)/);
    assert.match(schema, /maxStorage: integer\(\s*\"max_storage\"\)\.notNull\(\)\.default\(1_073_741_824\)/);
    assert.match(schema, /resetAt: timestamp\(\s*\"reset_at\"/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS user_quotas/);
    assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS user_quotas_user_idx/);
    assert.match(journal, /0025_user_quotas/);
  });

  it("centralizes quota checks, increments, summaries, and reset behavior", async () => {
    const quotas = await readText("apps/web/src/server/quotas.ts");

    for (const symbol of [
      "nextMonthlyReset",
      "ensureUserQuota",
      "resetQuotaIfNeeded",
      "checkQuota",
      "incrementQuota",
      "quotaSummary",
    ]) {
      assert.match(quotas, new RegExp(`export (async function|function) ${symbol}`), `${symbol} must be exported`);
    }
    assert.match(quotas, /onConflictDoNothing\(\{ target: userQuotas\.userId \}\)/);
    assert.match(quotas, /Your \$\{metric\.label\} is exhausted/);
    assert.match(quotas, /sql<number>`\$\{userQuotas\.messagesSent\} \+ \$\{messagesSent\}`/);
  });

  it("enforces quota checks for chat, group streams, and uploads", async () => {
    const [chat, groups, upload, chatUi] = await Promise.all([
      readText("apps/web/src/app/api/chat/stream/route.ts"),
      readText("apps/web/src/app/api/groups/stream/route.ts"),
      readText("apps/web/src/app/api/upload/presigned/route.ts"),
      readText("apps/web/src/components/ChatInterface.tsx"),
    ]);

    assert.match(chat, /checkQuota\(session\.user\.id, "message"\)/);
    assert.match(chat, /checkQuota\(session\.user\.id, "api"\)/);
    assert.match(
      chat,
      /incrementQuota\(session\.user\.id, \{ messagesSent: 1, tokensUsed: approxTokens, apiCalls: 1 \}\)/,
    );
    assert.match(groups, /checkQuota\(session\.user\.id, "message"\)/);
    assert.match(groups, /incrementQuota\(session\.user\.id, \{ messagesSent: 1, tokensUsed, apiCalls: 1 \}\)/);
    assert.match(upload, /checkQuota\(session\.user\.id, "storage", uploadSize\)/);
    assert.match(upload, /incrementQuota\(session\.user\.id, \{ storageUsed: uploadSize, apiCalls: 1 \}\)/);
    assert.match(chatUi, /if \(!res\.ok \|\| !res\.body\)/);
  });

  it("exposes quota status through tRPC and settings UI", async () => {
    const [router, appRouter, panel, settings] = await Promise.all([
      readText("apps/web/src/server/routers/quotas.ts"),
      readText("apps/web/src/server/routers/_app.ts"),
      readText("apps/web/src/components/UsageQuotaPanel.tsx"),
      readText("apps/web/src/app/settings/page.tsx"),
    ]);

    assert.match(router, /current: authedProcedure\.query/);
    assert.match(router, /check: authedProcedure/);
    assert.match(router, /providerGates: authedProcedure\.query/);
    assert.match(router, /providerCatalog\s*\.\s*filter\(\(entry\) => entry\.type === "cloud"\)/);
    assert.match(router, /checkProviderPlanAccess\(entry\.id, quota\.plan\)/);
    assert.match(appRouter, /quotas: quotasRouter/);
    assert.match(panel, /trpc\.quotas\.current\.useQuery/);
    assert.match(panel, /Messages/);
    assert.match(panel, /Tokens/);
    assert.match(panel, /Storage/);
    assert.match(panel, /API calls/);
    assert.match(settings, /UsageQuotaPanel/);
  });
});

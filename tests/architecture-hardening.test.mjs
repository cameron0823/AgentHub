import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

test("Next instrumentation no longer owns worker startup by default", async () => {
  const [instrumentation, workerStart, workerScript, webPkg, desktopLauncher] = await Promise.all([
    readText("apps/web/src/instrumentation.ts"),
    readText("apps/web/src/server/workers/start.ts"),
    readText("apps/web/scripts/start-workers.ts"),
    readJson("apps/web/package.json"),
    readText("scripts/start-desktop.mjs"),
  ]);

  assert.match(instrumentation, /shouldStartInlineWorkers/);
  assert.match(instrumentation, /background workers disabled in Next\.js instrumentation/);
  assert.doesNotMatch(instrumentation, /startAutomationWorker\(\)/);
  assert.doesNotMatch(instrumentation, /startTaskWorker\(\)/);
  assert.match(workerStart, /AGENTHUB_WORKER_MODE === "inline"/);
  assert.match(workerStart, /AGENTHUB_ENABLE_INLINE_WORKERS === "1"/);
  assert.match(workerStart, /let started = false/);
  assert.match(workerScript, /startBackgroundWorkers/);
  assert.equal(webPkg.scripts.workers, "tsx scripts/start-workers.ts");
  assert.match(desktopLauncher, /AGENTHUB_WORKER_MODE.*inline/);
});

test("provider credentials are sealed before storage and redacted before list responses", async () => {
  const [helper, router, chatRoute, a2aHelper, voiceRoute, oauthRoute] = await Promise.all([
    readText("apps/web/src/server/provider-credentials.ts"),
    readText("apps/web/src/server/routers/providers.ts"),
    readText("apps/web/src/app/api/chat/stream/route.ts"),
    readText("apps/web/src/server/a2a.ts"),
    readText("apps/web/src/app/api/voice/stt/route.ts"),
    readText("apps/web/src/app/api/oauth/github-copilot/poll/route.ts"),
  ]);

  assert.match(helper, /SEALED_PREFIX = "enc:v1:"/);
  assert.match(helper, /encryptProviderCredentialValues/);
  assert.match(helper, /decryptProviderCredentials/);
  assert.match(helper, /redactProviderCredential/);
  assert.match(router, /encryptProviderCredentialValues\(input\)/);
  assert.match(router, /encryptProviderCredentialValues\(updates\)/);
  assert.match(router, /creds\.map\(redactProviderCredential\)/);
  assert.match(chatRoute, /decryptProviderCredentials/);
  assert.match(a2aHelper, /decryptProviderCredentials/);
  assert.match(voiceRoute, /decryptProviderCredentials/);
  assert.match(oauthRoute, /encryptProviderCredentialValues\(\{ accessToken/);
});

test("paid provider credentials are gated across API entrypoints", async () => {
  const [
    router,
    chatRoute,
    publicChatRoute,
    a2aHelper,
    voiceSttRoute,
    voiceTtsRoute,
    webhook,
    copilotDevice,
    copilotPoll,
    googleInit,
    googleCallback,
  ] = await Promise.all([
    readText("apps/web/src/server/routers/providers.ts"),
    readText("apps/web/src/app/api/chat/stream/route.ts"),
    readText("apps/web/src/app/api/v1/chat/completions/route.ts"),
    readText("apps/web/src/server/a2a.ts"),
    readText("apps/web/src/app/api/voice/stt/route.ts"),
    readText("apps/web/src/app/api/voice/tts/route.ts"),
    readText("apps/web/src/server/channels/webhook.ts"),
    readText("apps/web/src/app/api/oauth/github-copilot/device/route.ts"),
    readText("apps/web/src/app/api/oauth/github-copilot/poll/route.ts"),
    readText("apps/web/src/app/api/oauth/google/initiate/route.ts"),
    readText("apps/web/src/app/api/oauth/google/callback/route.ts"),
  ]);

  assert.match(router, /credentialsAllowedForPlan/);
  assert.match(router, /assertProviderPlanAccess\(input\.providerId, quota\.plan\)/);
  assert.match(router, /assertProviderPlanAccess\(cred\.providerId, quota\.plan\)/);

  for (const route of [chatRoute, publicChatRoute, a2aHelper, voiceSttRoute, voiceTtsRoute, webhook]) {
    assert.match(route, /ensureUserQuota/);
    assert.match(route, /checkProviderPlanAccess\(credential\.providerId, quota\.plan\)\.allowed/);
  }

  for (const route of [copilotDevice, copilotPoll, googleInit, googleCallback]) {
    assert.match(route, /auth\(req\.headers\)/);
    assert.match(route, /ensureUserQuota/);
    assert.match(route, /checkProviderPlanAccess/);
    assert.match(route, /status: 403/);
  }
});

test("hot-path DB operations avoid N+1 and serial delete loops", async () => {
  const [automations, sessions] = await Promise.all([
    readText("apps/web/src/server/routers/automations.ts"),
    readText("apps/web/src/server/routers/sessions.ts"),
  ]);

  assert.match(automations, /inArray\(\s*automationRuns\.automationId,\s*rows\.map/);
  assert.match(automations, /lastRunByAutomation/);
  assert.doesNotMatch(automations, /Promise\.all\(\s*rows\.map\(async/);
  assert.doesNotMatch(automations, /\.where\(eq\(automationRuns\.automationId, row\.id\)\)/);

  assert.match(sessions, /gt\(messages\.createdAt, target\.createdAt\)/);
  assert.match(sessions, /\.delete\(messages\)/);
  assert.doesNotMatch(sessions, /for \(const m of msgs\.slice/);
});

test("runtime config fields use jsonb instead of JSON-in-text storage", async () => {
  const [schema, migration, mcpConfig, tasksRouter, taskWorker] = await Promise.all([
    readText("apps/web/src/server/db/schema.ts"),
    readText("apps/web/drizzle/0023_structured_runtime_json.sql"),
    readText("apps/web/src/server/mcp-config.ts"),
    readText("apps/web/src/server/routers/tasks.ts"),
    readText("apps/web/src/server/workers/taskWorker.ts"),
  ]);

  assert.match(schema, /args:\s+jsonb\(\s*\"args\"\)\.\$type<string\[\]>/);
  assert.match(schema, /env:\s+jsonb\(\s*\"env\"\)\.\$type<Record<string, string>>/);
  assert.match(schema, /headers:\s+jsonb\(\s*\"headers\"\)\.\$type<Record<string, string>>/);
  assert.match(schema, /dependsOn: jsonb\(\s*\"depends_on\"\)\.\$type<string\[\]>/);
  assert.match(migration, /ALTER COLUMN args TYPE jsonb/);
  assert.match(migration, /ALTER COLUMN depends_on TYPE jsonb/);
  assert.match(mcpConfig, /Array\.isArray\(raw\)/);
  assert.match(tasksRouter, /dependsOn: depIds/);
  assert.match(tasksRouter, /dependsOn: \[row\.id\]/);
  assert.doesNotMatch(tasksRouter, /dependsOn: JSON\.stringify/);
  assert.match(taskWorker, /normalizeDependsOn/);
});

test("API error responses avoid leaking raw exception messages on named routes", async () => {
  const [a2aRoute, chatCompletionsRoute, kbQueryRoute] = await Promise.all([
    readText("apps/web/src/app/api/a2a/delegate/route.ts"),
    readText("apps/web/src/app/api/v1/chat/completions/route.ts"),
    readText("apps/web/src/app/api/kb/query/route.ts"),
  ]);

  assert.match(a2aRoute, /Agent delegation failed/);
  assert.doesNotMatch(a2aRoute, /\(err as Error\)\.message/);
  assert.match(chatCompletionsRoute, /Chat completion failed/);
  assert.doesNotMatch(chatCompletionsRoute, /\(err as Error\)\.message/);
  assert.match(kbQueryRoute, /Knowledge base search failed/);
  assert.doesNotMatch(kbQueryRoute, /err instanceof Error \? err\.message/);
});

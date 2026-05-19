import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patternFor = (value) => (value instanceof RegExp ? value : new RegExp(escapeRegExp(value)));

test("channel schema stores encrypted verification secrets, sender policies, and audit logs", async () => {
  assert.ok(
    exists("apps/web/drizzle/0022_channels.sql"),
    "channels migration must use the next available migration number",
  );

  const [schema, migration] = await Promise.all([
    readText("apps/web/src/server/db/schema.ts"),
    readText("apps/web/drizzle/0022_channels.sql"),
  ]);

  for (const required of [
    /export const channelAccounts = pgTable[\s\S]*channel_accounts/,
    'provider: text("provider", { enum: ["discord", "slack"] }).notNull()',
    'verificationSecretEncrypted: text("verification_secret_encrypted").notNull()',
    'verificationSecretIv: text("verification_secret_iv").notNull()',
    'verificationSecretAuthTag: text("verification_secret_auth_tag").notNull()',
    'verificationSecretHint: varchar("verification_secret_hint", { length: 8 })',
    /dmPolicy: text\("dm_policy", \{ enum: \["disabled", "paired-only", "open"\] \}\)\s*\.notNull\(\)\s*\.default\("paired-only"\)/,
    'allowedTools: jsonb("allowed_tools").notNull().default([])',
    /export const channelSenderPolicies = pgTable\(\s*"channel_sender_policies"/,
    /export const channelAuditLog = pgTable\(\s*"channel_audit_log"/,
    'uniqueIndex("channel_sender_policy_channel_sender_idx")',
  ]) {
    assert.match(schema, patternFor(required), `schema missing ${required}`);
  }

  for (const forbidden of [
    'signingSecret: text("signing_secret")',
    'webhookSecret: text("webhook_secret")',
    'verificationSecret: text("verification_secret")',
  ]) {
    assert.doesNotMatch(schema, new RegExp(escapeRegExp(forbidden)), `schema stores plaintext secret: ${forbidden}`);
  }

  for (const required of [
    'CREATE TABLE IF NOT EXISTS "channel_accounts"',
    'CREATE TABLE IF NOT EXISTS "channel_sender_policies"',
    'CREATE TABLE IF NOT EXISTS "channel_audit_log"',
    "verification_secret_encrypted",
    "verification_secret_iv",
    "verification_secret_auth_tag",
    "dm_policy\" text DEFAULT 'paired-only' NOT NULL",
    'provider" text NOT NULL',
    'outcome" text NOT NULL',
    'CREATE UNIQUE INDEX IF NOT EXISTS "channel_sender_policy_channel_sender_idx"',
    'CREATE INDEX IF NOT EXISTS "channel_audit_account_created_idx"',
  ]) {
    assert.match(migration, new RegExp(escapeRegExp(required)), `migration missing ${required}`);
  }
});

test("shared channel contract parses commands and enforces direct-message and tool policies", async () => {
  const types = await readText("apps/web/src/server/channels/types.ts");

  for (const required of [
    'export const CHANNEL_PROVIDERS = ["discord", "slack"] as const',
    'export const CHANNEL_DM_POLICIES = ["disabled", "paired-only", "open"] as const',
    "export type ChannelProvider",
    "export type ChannelDmPolicy",
    "export interface NormalizedChannelCommand",
    "export function parseChannelCommand",
    "export function evaluateChannelSenderPolicy",
    "export function resolveChannelToolIds",
    "isDirectMessage",
    "paired-only",
    "senderPolicy?.isPaired",
    "new Set(accountAllowedToolsList)",
  ]) {
    assert.match(types, new RegExp(escapeRegExp(required)), `types contract missing ${required}`);
  }
});

test("Slack and Discord adapters verify native request signatures and normalize commands", async () => {
  const [slack, discord] = await Promise.all([
    readText("apps/web/src/server/channels/slack.ts"),
    readText("apps/web/src/server/channels/discord.ts"),
  ]);

  for (const required of [
    "export function verifySlackSignature",
    "v0:${timestamp}:${rawBody}",
    'createHmac("sha256", signingSecret)',
    "timingSafeEqual",
    "SLACK_SIGNATURE_TOLERANCE_SECONDS",
    "export function parseSlackSlashCommand",
    "URLSearchParams",
  ]) {
    assert.match(slack, new RegExp(escapeRegExp(required)), `Slack adapter missing ${required}`);
  }

  for (const required of [
    "export function verifyDiscordSignature",
    "createPublicKey",
    "cryptoVerify",
    "ed25519",
    "DISCORD_PUBLIC_KEY_DER_PREFIX",
    "export function parseDiscordInteraction",
    "type === 1",
  ]) {
    assert.match(discord, new RegExp(escapeRegExp(required)), `Discord adapter missing ${required}`);
  }
});

test("channel APIs are user-scoped, permission-gated, and audited", async () => {
  const [appRouter, channelsRouter, webhookHelper, slackRoute, discordRoute] = await Promise.all([
    readText("apps/web/src/server/routers/_app.ts"),
    readText("apps/web/src/server/routers/channels.ts"),
    readText("apps/web/src/server/channels/webhook.ts"),
    readText("apps/web/src/app/api/channels/slack/route.ts"),
    readText("apps/web/src/app/api/channels/discord/route.ts"),
  ]);

  assert.match(appRouter, /import \{ channelsRouter \} from "\.\/channels"/);
  assert.match(appRouter, /channels: channelsRouter/);

  for (const required of [
    "authedProcedure",
    "encrypt(input.verificationSecret)",
    "keyHint(input.verificationSecret)",
    "eq(agents.userId, userId)",
    "assertOwnedAgent(input.agentId, ctx.user.id)",
    "verificationSecretEncrypted",
    "setSenderPolicy",
    "auditLog",
    "channelAuditLog",
  ]) {
    assert.match(channelsRouter, new RegExp(escapeRegExp(required)), `channels router missing ${required}`);
  }

  for (const required of [
    "decrypt(",
    "verifyRequest",
    "parseCommand",
    "evaluateChannelSenderPolicy",
    "resolveChannelToolIds",
    "AgentRuntime",
    "db.insert(channelAuditLog)",
    "providerCredentials",
  ]) {
    assert.match(webhookHelper, new RegExp(escapeRegExp(required)), `channel webhook helper missing ${required}`);
  }

  for (const [name, route, verifier] of [
    ["Slack", slackRoute, "verifySlackSignature"],
    ["Discord", discordRoute, "verifyDiscordSignature"],
  ]) {
    for (const required of ['export const runtime = "nodejs"', "await req.text()", verifier, "handleChannelWebhook"]) {
      assert.match(route, new RegExp(escapeRegExp(required)), `${name} route missing ${required}`);
    }
  }
});

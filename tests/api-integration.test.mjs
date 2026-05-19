import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// ── API Key Management (S11.2) ────────────────────────────────────────────────

test("API key router enforces authedProcedure on all mutations and queries", async () => {
  const src = await readText("apps/web/src/server/routers/apiKeys.ts");

  for (const proc of ["list", "create", "revoke", "delete"]) {
    assert.match(src, new RegExp(`${proc}: authedProcedure`), `${proc} must use authedProcedure`);
  }
});

test("API key router scopes all DB operations to the authenticated user", async () => {
  const src = await readText("apps/web/src/server/routers/apiKeys.ts");

  // list: scoped to userId
  assert.match(src, /eq\(apiKeys\.userId, ctx\.user\.id\)/, "list must scope to ctx.user.id");
  // create: inserts with userId
  assert.match(src, /userId: ctx\.user\.id/, "create must insert userId");
  // revoke/delete: ownership check prevents cross-user mutation
  assert.match(
    src,
    /and\(eq\(apiKeys\.id, input\.id\), eq\(apiKeys\.userId, ctx\.user\.id\)\)/,
    "revoke/delete must use compound ownership check",
  );
});

test("API keys are never stored in plaintext — only SHA-256 hash persisted", async () => {
  const src = await readText("apps/web/src/server/routers/apiKeys.ts");

  assert.match(src, /createHash\("sha256"\)/, "must use SHA-256 for hashing");
  // The raw key must never be inserted into the DB — only keyHash and keyPrefix
  assert.doesNotMatch(src, /keyRaw|raw_key/, "raw key must not be stored in DB column");
  // Raw returned only once in create response, never persisted
  assert.match(src, /Return raw key only once/, "must document single-use raw key return");
});

test("validateApiKey rejects keys without ah_ prefix and expired keys", async () => {
  const src = await readText("apps/web/src/server/routers/apiKeys.ts");

  assert.match(src, /if \(!rawKey\.startsWith\("ah_"\)\) return null/, "must reject non-ah_ prefix");
  assert.match(src, /entry\.expiresAt && entry\.expiresAt < new Date\(\)/, "must reject expired keys");
  assert.match(src, /!entry\.isEnabled/, "must reject disabled keys");
});

test("API keys table registered in app router", async () => {
  const src = await readText("apps/web/src/server/routers/_app.ts");

  assert.match(src, /apiKeysRouter/, "apiKeysRouter must be imported");
  assert.match(src, /apiKeys: apiKeysRouter/, "apiKeys must be registered in appRouter");
});

// ── OpenAI-Compatible Endpoint (S11.1) ────────────────────────────────────────

test("OpenAI-compatible endpoint requires Bearer API key auth", async () => {
  const src = await readText("apps/web/src/app/api/v1/chat/completions/route.ts");

  assert.match(src, /get\("authorization"\)/, "must check Authorization header");
  assert.match(src, /startsWith\("Bearer "\)/, "must verify Bearer prefix");
  assert.match(src, /validateApiKey/, "must validate via validateApiKey helper");
  assert.match(src, /status: 401/, "must return 401 on auth failure");
  assert.match(src, /invalid_api_key/, "must use OpenAI error code format");
});

test("OpenAI-compatible endpoint validates required request fields", async () => {
  const src = await readText("apps/web/src/app/api/v1/chat/completions/route.ts");

  assert.match(src, /model is required/, "must validate model field");
  assert.match(src, /messages must be a non-empty array/, "must validate messages field");
  assert.match(src, /MAX_MESSAGES/, "must enforce message count limit");
});

test("OpenAI-compatible endpoint supports both streaming and non-streaming modes", async () => {
  const src = await readText("apps/web/src/app/api/v1/chat/completions/route.ts");

  assert.match(src, /text\/event-stream/, "must support SSE streaming");
  assert.match(src, /chat\.completion\.chunk/, "must emit OpenAI chunk format");
  assert.match(src, /chat\.completion/, "must emit OpenAI non-streaming format");
  assert.match(src, /data: \[DONE\]/, "streaming must terminate with [DONE]");
  assert.match(src, /finish_reason.*stop/, "must set finish_reason: stop");
});

test("OpenAI-compatible endpoint loads user provider credentials", async () => {
  const src = await readText("apps/web/src/app/api/v1/chat/completions/route.ts");

  assert.match(src, /providerCredentials/, "must load provider credentials");
  assert.match(src, /isEnabled.*true/, "must filter to enabled credentials");
  assert.match(src, /forUser/, "must call forUser for per-request registry isolation");
});

test("OpenAI-compatible endpoint response includes usage token counts", async () => {
  const src = await readText("apps/web/src/app/api/v1/chat/completions/route.ts");

  assert.match(src, /prompt_tokens/, "must include prompt_tokens in usage");
  assert.match(src, /completion_tokens/, "must include completion_tokens in usage");
  assert.match(src, /total_tokens/, "must include total_tokens in usage");
});

// ── Data Export (S11.4) ───────────────────────────────────────────────────────

test("Export endpoint requires session authentication", async () => {
  const src = await readText("apps/web/src/app/api/export/route.ts");

  assert.match(src, /const session = await auth\(req\.headers\)/, "must call auth(req.headers)");
  assert.match(src, /if \(!session\?\.user\)/, "must check session.user");
  assert.match(src, /status: 401/, "must return 401 when unauthenticated");
});

test("Export scopes all DB queries to the authenticated user", async () => {
  const src = await readText("apps/web/src/app/api/export/route.ts");

  const userIdRefs = (src.match(/eq\([^,]+, userId\)/g) ?? []).length;
  assert.ok(userIdRefs >= 4, `must scope all 4 entity queries to userId, found ${userIdRefs}`);
});

test("Export returns a valid ZIP with correct Content-Type", async () => {
  const src = await readText("apps/web/src/app/api/export/route.ts");

  assert.match(src, /application\/zip/, "must set Content-Type: application/zip");
  assert.match(src, /Content-Disposition/, "must set Content-Disposition for download");
  assert.match(src, /attachment/, "must use attachment disposition");
});

test("Export ZIP contains the four required data files", async () => {
  const src = await readText("apps/web/src/app/api/export/route.ts");

  assert.match(src, /"agents\.json"/, "must include agents.json");
  assert.match(src, /"sessions\.jsonl"/, "must include sessions.jsonl");
  assert.match(src, /"memory\.json"/, "must include memory.json");
  assert.match(src, /"files\.json"/, "must include files.json");
});

test("Export ZIP writer uses valid ZIP local file header signature", async () => {
  const src = await readText("apps/web/src/app/api/export/route.ts");

  // Local file header magic: 0x04034b50
  assert.match(src, /0x04034b50/, "must write local file header signature");
  // Central directory magic: 0x02014b50
  assert.match(src, /0x02014b50/, "must write central directory signature");
  // End of central directory: 0x06054b50
  assert.match(src, /0x06054b50/, "must write end-of-central-directory signature");
});

// ── A2A Delegate Endpoint (S10.5) ─────────────────────────────────────────────

test("A2A delegate endpoint requires session authentication", async () => {
  const src = await readText("apps/web/src/app/api/a2a/delegate/route.ts");

  assert.match(src, /const session = await auth\(req\.headers\)/, "must call auth(req.headers)");
  assert.match(src, /status: 401/, "must return 401 when unauthenticated");
});

test("A2A delegate enforces agent ownership before execution", async () => {
  const [src, helper] = await Promise.all([
    readText("apps/web/src/app/api/a2a/delegate/route.ts"),
    readText("apps/web/src/server/a2a.ts"),
  ]);

  assert.match(helper, /eq\(agents\.userId, input\.userId\)/, "must verify agent belongs to authenticated user");
  assert.match(src, /message === "Agent not found" \? 404/, "must return 404 when agent not found or not owned");
});

test("A2A delegate enforces task length limit", async () => {
  const src = await readText("apps/web/src/app/api/a2a/delegate/route.ts");

  assert.match(src, /MAX_TASK_LENGTH/, "must define MAX_TASK_LENGTH constant");
  assert.match(src, /task\.length > MAX_TASK_LENGTH/, "must check task length against limit");
});

test("A2A delegate validates required request fields with correct types", async () => {
  const src = await readText("apps/web/src/app/api/a2a/delegate/route.ts");

  assert.match(src, /typeof agentId !== "string"/, "must validate agentId type");
  assert.match(src, /typeof task !== "string"/, "must validate task type");
  assert.match(src, /agentId is required/, "must return descriptive error for missing agentId");
  assert.match(src, /task is required/, "must return descriptive error for missing task");
});

// ── PWA Manifest (S12.3) ──────────────────────────────────────────────────────

test("PWA manifest exists with required fields", async () => {
  const raw = await readText("apps/web/public/manifest.json");
  const manifest = JSON.parse(raw);

  assert.ok(manifest.name, "manifest must have name");
  assert.ok(manifest.short_name, "manifest must have short_name");
  assert.equal(manifest.display, "standalone", "manifest must use standalone display mode");
  assert.ok(manifest.start_url, "manifest must have start_url");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, "manifest must have at least 2 icon sizes");
});

test("PWA icon files exist at paths declared in manifest", async () => {
  const raw = await readText("apps/web/public/manifest.json");
  const manifest = JSON.parse(raw);

  for (const icon of manifest.icons) {
    // Strip leading slash for relative path lookup
    const relPath = `apps/web/public/${icon.src.replace(/^\//, "")}`;
    const buf = await readFile(new URL(`../${relPath}`, import.meta.url));
    // Verify PNG signature
    const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    assert.ok(
      PNG_SIG.every((b, i) => buf[i] === b),
      `${icon.src} must be a valid PNG`,
    );
    assert.ok(buf.length > 100, `${icon.src} must not be empty`);
  }
});

test("Service worker is registered client-side and covers static assets", async () => {
  const [registrar, sw] = await Promise.all([
    readText("apps/web/src/components/ServiceWorkerRegistrar.tsx"),
    readText("apps/web/public/sw.js"),
  ]);

  assert.match(registrar, /"serviceWorker" in navigator/, "must check serviceWorker support");
  assert.match(registrar, /navigator\.serviceWorker\.register/, "must register a service worker");
  assert.match(registrar, /return "\/sw\.js"/, "must use /sw.js when Trusted Types is unavailable");
  assert.match(registrar, /createScriptURL\("\/sw\.js"\)/, "must register /sw.js through Trusted Types policy");
  assert.match(sw, /cache-first/, "service worker must implement cache-first strategy for static assets");
  assert.match(sw, /\/api\//, "service worker must skip API routes");
  assert.match(sw, /\/trpc\//, "service worker must skip tRPC routes");
});

test("Layout references PWA manifest and theme color", async () => {
  const src = await readText("apps/web/src/app/layout.tsx");

  assert.match(src, /rel="manifest"/, "layout must link to manifest");
  assert.match(src, /href="\/manifest\.json"/, "manifest href must point to /manifest.json");
  assert.match(src, /theme-color/, "layout must include theme-color meta tag");
  assert.match(src, /ServiceWorkerRegistrar/, "layout must include ServiceWorkerRegistrar component");
});

// ── Trust Engine Migration (S10.8) ────────────────────────────────────────────

test("Trust engine migration creates all three tables", async () => {
  const sql = await readText("apps/web/drizzle/0005_trust_engine.sql");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS agent_credentials/, "must create agent_credentials");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS trust_policies/, "must create trust_policies");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS credential_audit_log/, "must create credential_audit_log");
});

test("Trust engine migration includes encrypted credential columns", async () => {
  const sql = await readText("apps/web/drizzle/0005_trust_engine.sql");

  assert.match(sql, /encrypted_value TEXT NOT NULL/, "must have encrypted_value column");
  assert.match(sql, /iv TEXT NOT NULL/, "must have iv column for AES-GCM");
  assert.match(sql, /auth_tag TEXT NOT NULL/, "must have auth_tag column for GCM tag");
  assert.match(sql, /key_hint VARCHAR\(8\)/, "must have key_hint column for display");
});

test("Trust engine migration scopes tables to user and cascades deletes", async () => {
  const sql = await readText("apps/web/drizzle/0005_trust_engine.sql");

  // agent_credentials and trust_policies both reference users with CASCADE
  const cascadeCount = (sql.match(/ON DELETE CASCADE/g) ?? []).length;
  assert.ok(cascadeCount >= 2, "at least 2 ON DELETE CASCADE references (users FK on each table)");

  // credential_audit_log uses SET NULL to preserve historical records
  assert.match(sql, /ON DELETE SET NULL/, "audit log must use SET NULL to preserve history");
});

test("Trust engine migration has audit log outcome CHECK constraint", async () => {
  const sql = await readText("apps/web/drizzle/0005_trust_engine.sql");

  assert.match(sql, /CHECK \(outcome IN \('success', 'denied', 'error'\)\)/, "outcome must have CHECK constraint");
});

test("Trust engine hardening adds tamper-evident audit hash chain columns", async () => {
  const [schema, migration, trustEngine] = await Promise.all([
    readText("apps/web/src/server/db/schema.ts"),
    readText("apps/web/drizzle/0027_trust_engine_hardening.sql"),
    readText("apps/web/src/server/trust-engine.ts"),
  ]);

  assert.match(schema, /previousHash: text\(\s*\"previous_hash\"\)/, "audit schema must store previous hash");
  assert.match(schema, /entryHash: text\(\s*\"entry_hash\"\)/, "audit schema must store entry hash");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "previous_hash"/, "migration must add previous_hash");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "entry_hash"/, "migration must add entry_hash");
  assert.match(trustEngine, /computeCredentialAuditHash/, "trust engine must compute audit hashes");
  assert.match(trustEngine, /appendCredentialAuditLog/, "audit writes must flow through append helper");
  assert.match(trustEngine, /AUDIT_GENESIS_HASH/, "hash chain must define genesis hash");
});

test("Trust engine router enforces authedProcedure on all operations", async () => {
  const src = await readText("apps/web/src/server/routers/trust.ts");

  for (const proc of [
    "listCredentials",
    "createCredential",
    "deleteCredential",
    "getPolicy",
    "upsertPolicy",
    "deletePolicy",
    "auditLog",
  ]) {
    assert.match(src, new RegExp(`${proc}: authedProcedure`), `${proc} must use authedProcedure`);
  }
});

test("Trust engine router never returns encryptedValue to client", async () => {
  const src = await readText("apps/web/src/server/routers/trust.ts");

  // listCredentials select must not include encrypted_value / encryptedValue
  assert.doesNotMatch(src, /encryptedValue: agentCredentials\.encryptedValue/, "must not select encryptedValue");
  assert.doesNotMatch(src, /encrypted_value/, "must not expose encrypted_value column");
  // But the hint should be returned
  assert.match(src, /keyHint: agentCredentials\.keyHint/, "must return keyHint for display");
});

test("Trust engine uses AES-256-GCM encryption with separate iv and authTag", async () => {
  const src = await readText("apps/web/src/server/trust-engine.ts");

  assert.match(src, /aes-256-gcm/, "must use AES-256-GCM algorithm");
  assert.match(src, /TRUST_VAULT_BOUNDARY/, "must expose an explicit vault isolation boundary");
  assert.match(src, /randomBytes/, "must generate random IV per encryption");
  assert.match(src, /getAuthTag/, "must capture GCM auth tag for integrity");
  assert.match(src, /setAuthTag/, "must verify auth tag on decryption");
});

test("Trust engine throws if TRUST_ENGINE_SECRET env var is missing", async () => {
  const src = await readText("apps/web/src/server/trust-engine.ts");

  // Must NOT fall back to a hardcoded key or NEXTAUTH_SECRET for encryption
  assert.doesNotMatch(src, /insecure-dev-only-key/, "must not contain hardcoded fallback key");
  assert.doesNotMatch(
    src,
    /NEXTAUTH_SECRET.*insecure|insecure.*NEXTAUTH_SECRET/,
    "must not cascade from NEXTAUTH_SECRET to insecure fallback",
  );
  // Must explicitly check for missing env var and throw
  assert.match(src, /TRUST_ENGINE_SECRET/, "must reference TRUST_ENGINE_SECRET");
  assert.match(src, /throw new Error/, "must throw if TRUST_ENGINE_SECRET is not set");
});

test("Trust engine uses PBKDF2 key derivation, not a raw hash", async () => {
  const src = await readText("apps/web/src/server/trust-engine.ts");

  assert.match(src, /pbkdf2Sync/, "must use pbkdf2Sync for key derivation");
  assert.doesNotMatch(
    src,
    /createHash\("sha256"\)\.update\(secret\)\.digest\(\)/,
    "must not use single SHA-256 hash for key derivation",
  );
});

test("Trust engine keyHint is a hash fingerprint, not plaintext prefix", async () => {
  const src = await readText("apps/web/src/server/trust-engine.ts");

  // Must not slice plaintext (first 4 chars exposure)
  assert.doesNotMatch(src, /rawValue\.slice\(0, 4\)/, "keyHint must not expose first 4 chars of plaintext");
  // Must use SHA-256 hash fingerprint
  assert.match(
    src,
    /createHash\("sha256"\).*keyHint|keyHint.*createHash\("sha256"\)/s,
    "keyHint must use SHA-256 fingerprint",
  );
});

test("Trust engine enforces secret-use policy before credential resolution", async () => {
  const src = await readText("apps/web/src/server/trust-engine.ts");

  assert.match(src, /enforceSecretUsePolicy/, "must expose credential-use policy enforcement");
  assert.match(src, /trustPolicies/, "must inspect trust policies");
  assert.match(src, /allowedTools/, "must enforce allowed tool list");
  assert.match(src, /Trust policy denied credential use/, "denied secret use must be audited");
  assert.match(
    src,
    /if \(!\(await enforceSecretUsePolicy\(opts\)\)\) return null/,
    "resolveCredential must enforce policy before decrypting",
  );
});

test("Trust engine deleteCredential returns NOT_FOUND for non-existent credentials", async () => {
  const src = await readText("apps/web/src/server/routers/trust.ts");

  assert.match(src, /\.returning\(/, "deleteCredential must use .returning() to verify deletion occurred");
  assert.match(src, /NOT_FOUND/, "must throw NOT_FOUND for missing or cross-user credential deletion");
});

test("Trust engine policy procedures verify agent ownership", async () => {
  const src = await readText("apps/web/src/server/routers/trust.ts");

  // All three policy procedures must check agent ownership
  assert.match(src, /import.*agents.*from.*schema|agents.*from.*db\/schema/, "must import agents table");
  assert.match(src, /FORBIDDEN/, "must throw FORBIDDEN for cross-user agent access");
  // Ownership check: look for agents table query within policy procedures context
  const agentOwnershipCount = (src.match(/eq\(agents\.userId, ctx\.user\.id\)/g) ?? []).length;
  assert.ok(agentOwnershipCount >= 3, `must check agent ownership in ≥3 procedures, found ${agentOwnershipCount}`);
});

test(".env.example documents TRUST_ENGINE_SECRET as required", async () => {
  const env = await readText(".env.example");

  assert.match(env, /TRUST_ENGINE_SECRET/, "must document TRUST_ENGINE_SECRET");
  assert.match(env, /openssl rand/, "must include generation instructions");
});

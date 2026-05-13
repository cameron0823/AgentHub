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
    "revoke/delete must use compound ownership check"
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
  assert.match(src, /loadUserCredentials/, "must call loadUserCredentials");
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

  assert.match(src, /const session = await auth\(\)/, "must call auth()");
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

  assert.match(src, /const session = await auth\(\)/, "must call auth()");
  assert.match(src, /status: 401/, "must return 401 when unauthenticated");
});

test("A2A delegate enforces agent ownership before execution", async () => {
  const src = await readText("apps/web/src/app/api/a2a/delegate/route.ts");

  assert.match(
    src,
    /eq\(agents\.userId, session\.user\.id\)/,
    "must verify agent belongs to authenticated user"
  );
  assert.match(src, /status: 404/, "must return 404 when agent not found or not owned");
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
    assert.ok(PNG_SIG.every((b, i) => buf[i] === b), `${icon.src} must be a valid PNG`);
    assert.ok(buf.length > 100, `${icon.src} must not be empty`);
  }
});

test("Service worker is registered client-side and covers static assets", async () => {
  const [registrar, sw] = await Promise.all([
    readText("apps/web/src/components/ServiceWorkerRegistrar.tsx"),
    readText("apps/web/public/sw.js"),
  ]);

  assert.match(registrar, /"serviceWorker" in navigator/, "must check serviceWorker support");
  assert.match(registrar, /register\("\/sw\.js"\)/, "must register /sw.js");
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

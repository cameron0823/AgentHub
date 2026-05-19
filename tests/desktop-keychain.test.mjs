import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("keychain capability is gated and disabled by default", async () => {
  const api = await readText("apps/desktop/src/shared/desktop-api.ts");
  const ipc = await readText("apps/desktop/src/main/ipc.ts");
  assert.match(api, /keychain: boolean/);
  assert.match(ipc, /keychain: false/);
  assert.match(ipc, /desktopRuntime\.capabilities\.keychain === true/);
});

test("keychain only accepts namespaced allowlisted keys", async () => {
  const keychain = await readText("apps/desktop/src/main/capabilities/keychain.ts");
  assert.match(keychain, /agenthub:/);
  assert.match(keychain, /providerCredential:/);
  assert.match(keychain, /mcpServer:/);
  assert.doesNotMatch(keychain, /listSecrets|enumerate|Object\.keys\(.*secrets/s);
});

test("keychain uses safeStorage and avoids leaking secret values", async () => {
  const keychain = await readText("apps/desktop/src/main/capabilities/keychain.ts");
  assert.match(keychain, /safeStorage/);
  assert.match(keychain, /encrypted/);
  assert.match(keychain, /redact/);
  assert.doesNotMatch(keychain, /throw new Error\([^)]*value/i);
});

test("web runtime has no keychain implementation path", async () => {
  const runtime = await readText("apps/web/src/lib/desktop-runtime.ts");
  assert.doesNotMatch(runtime, /safeStorage|keychainGet|keychainSet/);
  const docs = await readText("docs/desktop/keychain.md");
  assert.match(docs, /disabled by default/i);
});

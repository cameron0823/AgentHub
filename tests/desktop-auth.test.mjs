import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop auth docs define loopback callback behavior", async () => {
  const docs = await readText("docs/desktop/auth.md");
  assert.match(docs, /loopback callback/i);
  assert.match(docs, /NEXTAUTH_URL/);
  assert.match(docs, /127\.0\.0\.1:<selectedPort>/);
  assert.match(docs, /system browser/i);
});

test("desktop server manager sets auth origin from selected port", async () => {
  const manager = await readText("apps/desktop/src/main/services/web-server.ts");
  assert.match(manager, /NEXTAUTH_URL/);
  assert.match(manager, /AGENTHUB_DESKTOP_ORIGIN/);
  assert.match(manager, /NEXTAUTH_SECRET/);
  assert.match(manager, /http:\/\/\$\{LOOPBACK_HOST\}:\$\{port\}/);
});

test("auth code avoids fixed localhost port assumptions and redirects to local origin", async () => {
  const auth = await readText("apps/web/src/server/auth.ts");
  assert.doesNotMatch(auth, /localhost:3000|127\.0\.0\.1:3000/);
  assert.match(auth, /AGENTHUB_DESKTOP_ORIGIN/);
  assert.match(auth, /async redirect/);
});

test("electron controls external OAuth and local navigation", async () => {
  const windowCode = await readText("apps/desktop/src/main/create-window.ts");
  assert.match(windowCode, /shell\.openExternal/);
  assert.match(windowCode, /setWindowOpenHandler/);
  assert.match(windowCode, /will-navigate/);
  assert.match(windowCode, /event\.preventDefault\(\)/);
  assert.match(windowCode, /allowedOrigin/);
});

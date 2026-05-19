import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("updater code is isolated and disabled in development by default", async () => {
  const updater = await readText("apps/desktop/src/main/updater.ts");
  assert.match(updater, /autoUpdater/);
  assert.match(updater, /app\.isPackaged/);
  assert.match(updater, /force/);
  assert.match(updater, /checking-for-update/);
  assert.match(updater, /update-available/);
  assert.match(updater, /update-not-available/);
  assert.match(updater, /update-downloaded/);
  assert.match(updater, /error/);
});

test("desktop logging writes to Electron log path", async () => {
  const logging = await readText("apps/desktop/src/main/logging.ts");
  assert.match(logging, /electron-log/);
  assert.match(logging, /app\.getPath\("logs"\)/);
  assert.match(logging, /agenthub-desktop\.log/);
});

test("desktop release workflow builds artifacts after tests", async () => {
  const workflow = await readText(".github/workflows/desktop-release.yml");
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm typecheck/);
  assert.match(workflow, /pnpm test/);
  assert.match(workflow, /pnpm -C apps\/web build/);
  assert.match(workflow, /pnpm -C apps\/desktop dist/);
});

test("updater docs and config cover signing and release metadata", async () => {
  const docs = await readText("docs/desktop/updater.md");
  const config = await readText("apps/desktop/electron-builder.yml");
  assert.match(docs, /signing/i);
  assert.match(docs, /staging/i);
  assert.match(config, /publish:/);
  assert.match(config, /provider: github|provider: generic/);
});

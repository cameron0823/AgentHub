import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop package exposes required scripts", async () => {
  const pkg = await readJson("apps/desktop/package.json");
  for (const script of ["dev", "build", "typecheck", "test", "package"]) {
    assert.ok(pkg.scripts[script], `missing desktop script ${script}`);
  }
  assert.ok(pkg.devDependencies.electron);
});

test("desktop shell uses a preload and safe window defaults", async () => {
  const main = await readText("apps/desktop/src/main/create-window.ts");
  assert.match(main, /preload:/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /sandbox: true/);
});

test("preload exposes only agenthubDesktop", async () => {
  const preload = await readText("apps/desktop/src/preload/index.ts");
  assert.match(preload, /contextBridge\.exposeInMainWorld\("agenthubDesktop"/);
  assert.doesNotMatch(preload, /ipcRenderer\s*[,}]/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop ipc channels are declared in one allowlist", async () => {
  const channels = await readText("apps/desktop/src/shared/ipc-channels.ts");
  for (const channel of [
    "desktop:get-runtime-info",
    "desktop:get-window-state",
    "desktop:set-window-state",
    "desktop:open-external",
  ]) {
    assert.match(channels, new RegExp(channel));
  }
  assert.doesNotMatch(channels, /\b(exec|shell|fs|readFile)\b/i);
});

test("main process uses handle handlers with sender validation", async () => {
  const ipc = await readText("apps/desktop/src/main/ipc.ts");
  assert.match(ipc, /ipcMain\.handle/);
  assert.doesNotMatch(ipc, /ipcMain\.on/);

  const handlerBlocks = ipc.split("ipcMain.handle").slice(1);
  assert.ok(handlerBlocks.length >= 4, "expected at least four IPC handlers");
  for (const block of handlerBlocks) {
    assert.match(block, /validateSender\(event\.senderFrame\)/);
  }
});

test("sender validation parses origins instead of trusting strings", async () => {
  const validateSender = await readText("apps/desktop/src/main/validate-sender.ts");
  assert.match(validateSender, /new URL\(frame\.url\)/);
  assert.match(validateSender, /protocol/);
  assert.match(validateSender, /hostname/);
  assert.match(validateSender, /port/);
});

test("preload never exposes raw ipcRenderer", async () => {
  const preload = await readText("apps/desktop/src/preload/index.ts");
  assert.match(preload, /contextBridge\.exposeInMainWorld\("agenthubDesktop"/);
  assert.doesNotMatch(preload, /ipcRenderer\s*[,}]/);
  assert.doesNotMatch(preload, /from "\.\.\//, "packaged sandbox preload must be self-contained");
});

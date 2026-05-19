import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop ADR keeps web as canonical runtime", async () => {
  const adr = await readText("docs/adr/0001-electron-desktop-shell.md");
  assert.match(adr, /apps\/web remains the canonical product UI/);
  assert.match(adr, /apps\/desktop is a shell/);
  assert.match(adr, /No arbitrary filesystem access/);
});

test("desktop security contract requires safe Electron defaults", async () => {
  const contract = await readText("docs/desktop/security-contract.md");
  assert.match(contract, /nodeIntegration: false/);
  assert.match(contract, /contextIsolation: true/);
  assert.match(contract, /sandbox: true/);
  assert.match(contract, /validateSender/);
  assert.doesNotMatch(contract, /expose ipcRenderer/);
});

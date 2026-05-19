import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("web runtime helper checks for window agenthubDesktop", async () => {
  const helper = await readText("apps/web/src/lib/desktop-runtime.ts");
  assert.match(helper, /window\.agenthubDesktop/);
  assert.match(helper, /typeof window !== "undefined"/);
  assert.doesNotMatch(helper, /from "electron"|from '@agenthub\/desktop'|from "@agenthub\/desktop"/);
});

test("DesktopStatus renders only when desktop API exists", async () => {
  const component = await readText("apps/web/src/components/DesktopStatus.tsx");
  assert.match(component, /hasDesktopRuntime\(\)/);
  assert.match(component, /return null/);
  assert.match(component, /getRuntimeInfo/);
});

test("settings page includes DesktopStatus", async () => {
  const settings = await readText("apps/web/src/app/settings/page.tsx");
  assert.match(settings, /DesktopStatus/);
});

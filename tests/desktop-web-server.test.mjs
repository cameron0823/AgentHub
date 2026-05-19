import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("web app exposes node health route for desktop startup", async () => {
  const route = await readText("apps/web/src/app/api/health/route.ts");
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /status: "ok"/);
  assert.match(route, /app: "agenthub"/);
});

test("desktop web server binds to loopback and avoids hardcoded port 3000", async () => {
  const manager = await readText("apps/desktop/src/main/services/web-server.ts");
  assert.match(manager, /127\.0\.0\.1/);
  assert.doesNotMatch(manager, /\b3000\b/);
  assert.match(manager, /AGENTHUB_DESKTOP_PORT/);
});

test("desktop web server owns cleanup and log paths", async () => {
  const manager = await readText("apps/desktop/src/main/services/web-server.ts");
  assert.match(manager, /stop\(/);
  assert.match(manager, /\.kill\(/);
  assert.match(manager, /app\.getPath\("logs"\)|app\.getPath\("userData"\)/);
});

test("desktop port discovery checks availability without killing listeners", async () => {
  const ports = await readText("apps/desktop/src/main/services/ports.ts");
  assert.match(ports, /createServer/);
  assert.match(ports, /listen\(.*"127\.0\.0\.1"/s);
  assert.doesNotMatch(ports, /kill|lsof|taskkill|fuser/);
});

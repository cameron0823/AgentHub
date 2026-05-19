import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("stdio mcp desktop capability is gated and disabled by default", async () => {
  const ipc = await readText("apps/desktop/src/main/ipc.ts");
  assert.match(ipc, /stdioMcp: false/);
  assert.match(ipc, /desktopRuntime\.capabilities\.stdioMcp === true/);
  assert.match(ipc, /validateSender\(event\.senderFrame\)/);
});

test("stdio mcp process uses validated command path and array args", async () => {
  const capability = await readText("apps/desktop/src/main/capabilities/stdio-mcp.ts");
  assert.match(capability, /validateCommandPath/);
  assert.match(capability, /args: string\[\]/);
  assert.match(capability, /spawn\(command, args/);
  assert.match(capability, /shell: false/);
  assert.match(capability, /stopStdioMcpProcess/);
});

test("stdio mcp audit log records lifecycle without command shell strings", async () => {
  const capability = await readText("apps/desktop/src/main/capabilities/stdio-mcp.ts");
  assert.match(capability, /argsHash/);
  assert.match(capability, /start/);
  assert.match(capability, /stop/);
  assert.match(capability, /error/);
  assert.doesNotMatch(capability, /exec\(|execSync|spawn\(.*join\(/s);
});

test("web mcp settings gates stdio in web-only runtime", async () => {
  const settings = await readText("apps/web/src/components/McpSettings.tsx");
  assert.match(settings, /Desktop runtime required/);
  assert.match(settings, /hasDesktopRuntime/);
  assert.match(settings, /transport === "stdio"/);
});

test("mcp router validates command path and keeps args structured", async () => {
  const router = await readText("apps/web/src/server/routers/mcp.ts");
  assert.match(router, /validateStdioCommandPath/);
  assert.match(router, /z\.array\(z\.string\(\)\)/);
  assert.doesNotMatch(router, /shell:\s*true/);
});

test("desktop docs define disabled-by-default stdio mcp policy", async () => {
  const docs = await readText("docs/desktop/stdio-mcp.md");
  assert.match(docs, /disabled by default/i);
  assert.match(docs, /explicit user approval/i);
  assert.match(docs, /audit log/i);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// ── MCP Router: authedProcedure on all operations ─────────────────────────────

test("MCP router gates all operations behind authedProcedure", async () => {
  const src = await readText("apps/web/src/server/routers/mcp.ts");

  for (const proc of ["list", "create", "update", "delete", "test", "discover"]) {
    assert.match(src, new RegExp(`${proc}: authedProcedure`), `mcp.${proc} must use authedProcedure`);
  }
});

test("MCP router scopes list to authenticated user only", async () => {
  const src = await readText("apps/web/src/server/routers/mcp.ts");

  assert.match(
    src,
    /eq\(mcpServers\.userId, ctx\.user\.id\)/,
    "list must filter mcpServers by ctx.user.id"
  );
});

test("MCP router create stamps userId from session — not from input", async () => {
  const src = await readText("apps/web/src/server/routers/mcp.ts");

  assert.match(src, /userId:\s*ctx\.user\.id/, "create must use ctx.user.id as userId");
  assert.doesNotMatch(src, /userId: input\.userId/, "create must not accept userId from untrusted input");
});

test("MCP router update enforces ownership — compound id AND userId check", async () => {
  const src = await readText("apps/web/src/server/routers/mcp.ts");

  assert.match(
    src,
    /and\(eq\(mcpServers\.id, id\), eq\(mcpServers\.userId, ctx\.user\.id\)\)/,
    "update WHERE clause must include userId ownership"
  );
});

test("MCP router delete enforces ownership — compound id AND userId check", async () => {
  const src = await readText("apps/web/src/server/routers/mcp.ts");

  assert.match(
    src,
    /db\.delete\(mcpServers\).*and\(eq\(mcpServers\.id, input\.id\), eq\(mcpServers\.userId, ctx\.user\.id\)\)/s,
    "delete must use compound ownership check"
  );
});

test("MCP router test verifies server ownership before connecting", async () => {
  const src = await readText("apps/web/src/server/routers/mcp.ts");

  assert.match(
    src,
    /and\(eq\(mcpServers\.id, input\.id\), eq\(mcpServers\.userId, ctx\.user\.id\)\)/,
    "test must verify server belongs to authenticated user before connecting"
  );
});

// ── Shell metacharacter rejection ─────────────────────────────────────────────

test("MCP router defines shell metacharacter regex covering all dangerous chars", async () => {
  const src = await readText("apps/web/src/server/routers/mcp.ts");

  assert.match(src, /SHELL_METACHAR_RE/, "must define SHELL_METACHAR_RE constant");
  // Must cover the core injection chars: ; & | $ > ` ! ( ) { } [ ]
  assert.match(src, /[;&|$>`!(){}[\]]/, "regex must include shell metacharacters");
});

test("MCP router validateCommand rejects command strings containing shell metacharacters", async () => {
  const src = await readText("apps/web/src/server/routers/mcp.ts");

  assert.match(src, /validateCommand/, "must define validateCommand helper");
  assert.match(
    src,
    /SHELL_METACHAR_RE\.test\(command\)/,
    "validateCommand must test command against metachar regex"
  );
  assert.match(
    src,
    /forbidden shell metacharacters/,
    "rejection message must mention forbidden shell metacharacters"
  );
});

test("MCP router calls validateCommand on both create and discover before executing", async () => {
  const src = await readText("apps/web/src/server/routers/mcp.ts");

  const validateCalls = (src.match(/validateCommand\(/g) ?? []).length;
  assert.ok(
    validateCalls >= 3,
    `validateCommand must be called for create, update, and discover (found ${validateCalls} calls)`
  );
});

// ── MCPClient: safe process spawning ─────────────────────────────────────────

test("MCPClient imports spawn not exec from child_process", async () => {
  const src = await readText("packages/agent-runtime/src/mcp/client.ts");

  assert.match(src, /import.*spawn.*from "child_process"/, "must import spawn from child_process");
  assert.doesNotMatch(
    src,
    /import.*\bexec\b.*from "child_process"/,
    "must NOT import exec — exec passes command through a shell"
  );
});

test("MCPClient uses spawn with args array — not a shell command string", async () => {
  const src = await readText("packages/agent-runtime/src/mcp/client.ts");

  assert.match(
    src,
    /spawn\(this\.options\.command,\s*this\.options\.args/,
    "spawn must receive command and args array separately, not a single shell string"
  );
});

test("MCPClient stdio transport does not set shell: true in spawn options", async () => {
  const src = await readText("packages/agent-runtime/src/mcp/client.ts");

  assert.doesNotMatch(src, /shell:\s*true/, "spawn must never use shell: true — prevents shell injection");
});

test("MCPClient stdio transport uses pipe for stdin, stdout, stderr", async () => {
  const src = await readText("packages/agent-runtime/src/mcp/client.ts");

  assert.match(
    src,
    /stdio.*pipe.*pipe.*pipe/,
    "must use pipe for all three stdio streams to avoid inheriting host terminal"
  );
});

// ── MCP: JSON-RPC protocol security ──────────────────────────────────────────

test("MCPClient communicates over stdio using JSON-RPC line protocol", async () => {
  const src = await readText("packages/agent-runtime/src/mcp/client.ts");

  assert.match(src, /JSON\.stringify|JSON\.parse/, "must serialize/deserialize JSON-RPC messages");
  assert.match(src, /jsonrpc|method|params/i, "must use JSON-RPC message structure");
});

test("MCPClient disconnect cleans up child process to prevent zombie processes", async () => {
  const src = await readText("packages/agent-runtime/src/mcp/client.ts");

  assert.match(
    src,
    /disconnect|kill|destroy|end/,
    "must implement disconnect to clean up child process"
  );
});

// ── MCP router in app router ──────────────────────────────────────────────────

test("MCP router is registered in app router", async () => {
  const src = await readText("apps/web/src/server/routers/_app.ts");

  assert.match(src, /mcpRouter/, "mcpRouter must be imported");
  assert.match(src, /mcp.*mcpRouter/, "mcp must be registered in appRouter");
});

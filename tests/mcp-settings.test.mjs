import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function readText(rel) {
  return readFile(join(root, rel), "utf8");
}

describe("MCP server settings", () => {
  it("mcpServers schema has transport, command, url, and enabled columns", async () => {
    const src = await readText("apps/web/src/server/db/schema.ts");
    assert.match(src, /mcpServers = pgTable\("mcp_servers"/, "must define mcp_servers table");
    assert.match(src, /transport.*text|text.*transport/, "must have transport column");
    assert.match(src, /command.*text|text.*command/, "must have command column");
    assert.match(src, /url.*text|text.*url/, "must have url column");
    assert.match(src, /enabled.*boolean|boolean.*enabled/, "must have enabled boolean column");
  });

  it("mcpRouter registers list, create, update, delete, and test procedures", async () => {
    const src = await readText("apps/web/src/server/routers/mcp.ts");
    assert.match(src, /list: authedProcedure/, "must have list procedure");
    assert.match(src, /create: authedProcedure/, "must have create procedure");
    assert.match(src, /update: authedProcedure/, "must have update procedure");
    assert.match(src, /delete: authedProcedure/, "must have delete procedure");
    assert.match(src, /test: authedProcedure/, "must have test procedure");
  });

  it("mcpRouter enforces userId ownership on queries and mutations", async () => {
    const src = await readText("apps/web/src/server/routers/mcp.ts");
    assert.match(src, /eq\(mcpServers\.userId, ctx\.user\.id\)/, "must scope to authenticated user");
    assert.match(src, /and\(eq\(mcpServers\.id/, "must check both id and userId for mutations");
  });

  it("mcpRouter validates transport enum as stdio or http", async () => {
    const src = await readText("apps/web/src/server/routers/mcp.ts");
    assert.match(src, /z\.enum\(\["stdio", "http"\]\)/, "transport must be constrained to stdio or http");
  });

  it("test procedure uses MCPClient from agent-runtime and returns tool count", async () => {
    const src = await readText("apps/web/src/server/routers/mcp.ts");
    assert.match(src, /MCPClient/, "must use MCPClient from agent-runtime");
    assert.match(src, /client\.connect\(\)/, "must call connect");
    assert.match(src, /client\.getTools\(\)/, "must call getTools");
    assert.match(src, /client\.disconnect\(\)/, "must call disconnect");
    assert.match(src, /toolCount: tools\.length/, "must return tool count");
  });

  it("mcpRouter is wired into the root tRPC router", async () => {
    const src = await readText("apps/web/src/server/routers/_app.ts");
    assert.match(src, /import.*mcpRouter.*from.*mcp/, "must import mcpRouter");
    assert.match(src, /mcpServers: mcpRouter/, "must register under mcpServers key");
  });

  it("McpSettings UI supports stdio and http transports with appropriate fields", async () => {
    const src = await readText("apps/web/src/components/McpSettings.tsx");
    assert.match(src, /stdio/, "must handle stdio transport");
    assert.match(src, /http/, "must handle http transport");
    assert.match(src, /command/, "must have command field for stdio");
    assert.match(src, /url/, "must have url field for http");
    assert.match(src, /TestTube/, "must import TestTube icon for test connection button");
  });

  it("McpSettings is rendered in the settings page", async () => {
    const src = await readText("apps/web/src/app/settings/page.tsx");
    assert.match(src, /McpSettings/, "settings page must render McpSettings component");
  });
});

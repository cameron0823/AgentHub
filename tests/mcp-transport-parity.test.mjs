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

describe("MCP transport parity", () => {
  it("MCPClient supports legacy HTTP, streamable HTTP, and SSE JSON-RPC transports", async () => {
    const client = await readText("packages/agent-runtime/src/mcp/client.ts");

    assert.match(
      client,
      /"stdio" \| "http" \| "streamable-http" \| "sse"/,
      "client transport union must include streamable HTTP and SSE",
    );
    assert.match(client, /sendHttpJsonRpcRequest/, "streamable transports must use JSON-RPC over HTTP");
    assert.match(client, /parseSseJsonRpcResponse/, "SSE responses must be parsed from data events");
    assert.match(client, /text\/event-stream/, "streamable transport must advertise SSE response support");
    assert.match(client, /tools\/list/, "streamable transport must discover tools through tools/list");
    assert.match(client, /tools\/call/, "streamable transport must invoke tools through tools/call");
    assert.match(client, /healthCheck/, "client must expose health monitoring");
    assert.match(client, /diffToolSchemas/, "client must expose tool schema diffing");
    assert.match(client, /createToolSchemaFingerprint/, "client must expose tool schema fingerprints");
  });

  it("schema persists transport parity health and tool schema metadata", async () => {
    const schema = await readText("apps/web/src/server/db/schema.ts");
    const migration = await readText("apps/web/drizzle/0013_mcp_transport_parity.sql");

    for (const column of [
      "headers",
      "last_health_status",
      "last_health_checked_at",
      "last_tool_count",
      "last_error",
      "tool_schema_snapshot",
      "tool_schema_fingerprint",
    ]) {
      assert.match(schema, new RegExp(column), `schema must define ${column}`);
      assert.match(migration, new RegExp(column), `migration must add ${column}`);
    }
  });

  it("mcpRouter supports all transports, import/export, health checks, and schema diffs", async () => {
    const router = await readText("apps/web/src/server/routers/mcp.ts");
    const config = await readText("apps/web/src/server/mcp-config.ts");

    assert.match(router, /MCP_TRANSPORTS/, "router must centralize supported transport list");
    assert.match(config, /"streamable-http"/, "router must accept streamable HTTP");
    assert.match(config, /"sse"/, "router must accept SSE");
    assert.match(router, /buildMcpClientConfig/, "router must build client configs consistently");
    assert.match(router, /exportConfig: authedProcedure/, "router must expose config export");
    assert.match(router, /importConfig: authedProcedure/, "router must expose config import");
    assert.match(router, /health: authedProcedure/, "router must expose server health monitoring");
    assert.match(router, /diffToolSchemas/, "router must compute schema diffs");
    assert.match(router, /toolSchemaSnapshot/, "router must store latest schema snapshot");
    assert.match(router, /schemaDiff/, "test/health responses must include schemaDiff");
  });

  it("chat stream injects enabled MCP tools for every configured transport", async () => {
    const route = await readText("apps/web/src/app/api/chat/stream/route.ts");

    assert.match(
      route,
      /buildMcpClientConfig|srv\.transport === "stdio"/,
      "stream route must construct MCP client config",
    );
    assert.match(route, /"streamable-http"|streamable-http/, "stream route must preserve streamable HTTP transport");
    assert.match(route, /"sse"|sse/, "stream route must preserve SSE transport");
    assert.match(route, /headers/, "stream route must pass configured headers for remote MCP servers");
  });

  it("McpSettings exposes transport parity controls and config import/export", async () => {
    const component = await readText("apps/web/src/components/McpSettings.tsx");

    assert.match(component, /streamable-http/, "UI must expose streamable HTTP transport");
    assert.match(component, />SSE</, "UI must expose SSE transport");
    assert.match(component, /Headers.*JSON|JSON.*Headers/s, "UI must expose HTTP headers JSON");
    assert.match(component, /exportConfig/, "UI must wire config export");
    assert.match(component, /importConfig/, "UI must wire config import");
    assert.match(component, /lastHealthStatus/, "UI must display health status");
    assert.match(component, /lastToolCount/, "UI must display tool count");
  });
});

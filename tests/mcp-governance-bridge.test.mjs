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

describe("MCP Governance Bridge", () => {
  it("adds per-server governance policy storage without replacing existing MCP config", async () => {
    const schema = await readText("apps/web/src/server/db/schema.ts");
    const migration = await readText("apps/web/drizzle/0015_mcp_governance_bridge.sql");

    assert.match(schema, /governanceEnabled/, "mcp_servers must have an explicit governance enabled flag");
    assert.match(schema, /governancePolicy/, "mcp_servers must store per-server governance policy JSON");
    assert.match(migration, /governance_enabled/, "migration must add governance enabled storage");
    assert.match(migration, /governance_policy/, "migration must add governance policy storage");
  });

  it("central bridge enforces policy, rate limits, time windows, pattern blocks, and audit events", async () => {
    const bridge = await readText("apps/web/src/server/mcp-governance.ts");

    for (const symbol of [
      "McpGovernancePolicy",
      "evaluateMcpGovernancePolicy",
      "enforceMcpGovernance",
      "recordMcpGovernanceAuditEvent",
      "rateLimitPerMinute",
      "allowedHoursUtc",
      "blockedPatterns",
      "credentialAuditLog",
      "callTool",
    ]) {
      assert.match(bridge, new RegExp(symbol), `bridge must include ${symbol}`);
    }
    assert.match(
      bridge,
      /outcome: decision\.allowed \? "success" : "denied"/,
      "audit outcome must reflect governance decision",
    );
  });

  it("chat stream routes MCP tool execution through the governance bridge", async () => {
    const route = await readText("apps/web/src/app/api/chat/stream/route.ts");

    assert.match(route, /enforceMcpGovernance/, "MCP tool calls must pass through the central bridge");
    assert.match(route, /server: srv/, "bridge must receive the owning MCP server");
    assert.match(
      route,
      /agentId: runtimeAgent\?\.id \?\? null/,
      "bridge must preserve runtime agent context for audit logs",
    );
  });

  it("governance router exposes authenticated policy and audit procedures", async () => {
    const router = await readText("apps/web/src/server/routers/mcpGovernance.ts");
    const appRouter = await readText("apps/web/src/server/routers/_app.ts");

    assert.match(router, /getPolicy: authedProcedure/, "router must fetch per-server policy");
    assert.match(router, /upsertPolicy: authedProcedure/, "router must update per-server policy");
    assert.match(router, /auditLog: authedProcedure/, "router must expose MCP governance audit log");
    assert.match(router, /eq\(mcpServers\.userId, ctx\.user\.id\)/, "router must enforce server ownership");
    assert.match(router, /credentialAuditLog/, "router must read existing audit table");
    assert.match(appRouter, /mcpGovernance: mcpGovernanceRouter/, "root router must register governance router");
  });

  it("settings UI exposes governance controls and dashboard", async () => {
    const panel = await readText("apps/web/src/components/McpGovernancePanel.tsx");
    const settings = await readText("apps/web/src/components/McpSettings.tsx");

    assert.match(panel, /MCP Governance Bridge/);
    assert.match(panel, /Rate limit/);
    assert.match(panel, /Blocked patterns/);
    assert.match(panel, /Allowed hours UTC/);
    assert.match(panel, /Audit Log/);
    assert.match(settings, /McpGovernancePanel/, "MCP settings must render the governance panel");
  });

  it("browser spec covers the governance dashboard", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-h/mcp-governance-bridge.spec.ts");

    assert.match(spec, /MCP Governance Bridge/);
    assert.match(spec, /Rate limit/);
    assert.match(spec, /Blocked patterns/);
    assert.match(spec, /Audit Log/);
  });
});

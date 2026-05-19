import { and, eq } from "drizzle-orm";
import { MCPClient } from "@agenthub/agent-runtime";
import { db } from "./db";
import { mcpServers } from "./db/schema";
import { buildMcpClientConfig } from "./mcp-config";
import { enforceMcpGovernance } from "./mcp-governance";

export class McpExecutionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "McpExecutionError";
  }
}

function isGovernanceDenial(message: string) {
  return (
    message.includes("MCP governance") ||
    message.includes("not allowed") ||
    message.includes("denied") ||
    message.includes("blocked pattern") ||
    message.includes("rate limit")
  );
}

export async function executeMcpToolForUser(input: {
  userId: string;
  agentId?: string | null;
  serverId: string;
  toolName: string;
  args: Record<string, unknown>;
}) {
  const [server] = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, input.serverId), eq(mcpServers.userId, input.userId)))
    .limit(1);

  if (!server) {
    throw new McpExecutionError(404, "mcp_server_not_found", "MCP server not found");
  }
  if (!server.enabled) {
    throw new McpExecutionError(400, "mcp_server_disabled", "MCP server is disabled");
  }

  const client = new MCPClient(buildMcpClientConfig(server));
  try {
    await client.connect();
    const tool = client.getTools().find((candidate) => candidate.name === input.toolName);
    if (!tool) {
      throw new McpExecutionError(404, "mcp_tool_not_found", `MCP tool not found: ${input.toolName}`);
    }

    const result = await enforceMcpGovernance({
      userId: input.userId,
      agentId: input.agentId ?? null,
      server,
      toolName: input.toolName,
      args: input.args,
      callTool: () => client.callTool(input.toolName, input.args) as Promise<unknown>,
    });

    return {
      serverId: server.id,
      serverName: server.name,
      toolName: input.toolName,
      result,
    };
  } catch (error) {
    if (error instanceof McpExecutionError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (isGovernanceDenial(message)) {
      throw new McpExecutionError(403, "mcp_tool_denied", message);
    }
    throw new McpExecutionError(502, "mcp_tool_failed", message);
  } finally {
    client.disconnect();
  }
}

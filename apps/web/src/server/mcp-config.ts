import type { MCPClientOptions, MCPTool, MCPTransport } from "@agenthub/agent-runtime";
import type { McpServer } from "./db/schema";

export const MCP_TRANSPORTS = ["stdio", "http", "streamable-http", "sse"] as const satisfies readonly MCPTransport[];

export type SupportedMcpTransport = (typeof MCP_TRANSPORTS)[number];

export interface ExportedMcpServerConfig {
  name: string;
  transport: SupportedMcpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJsonRecord(raw: unknown, label: string): Record<string, string> {
  if (raw === null || raw === undefined || raw === "") return {};
  const parsed = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  if (!isRecord(parsed)) throw new Error(`${label} must be a JSON object`);
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export function parseMcpArgs(raw: unknown): string[] {
  if (raw === null || raw === undefined || raw === "") return [];
  if (Array.isArray(raw)) {
    if (!raw.every((arg) => typeof arg === "string")) {
      throw new Error("MCP args must be a string array");
    }
    return raw;
  }
  if (typeof raw !== "string") throw new Error("MCP args must be a string array or command string");
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((arg) => typeof arg === "string")) {
      throw new Error("MCP args must be a JSON string array");
    }
    return parsed;
  }
  return trimmed.split(/\s+/).filter(Boolean);
}

export function buildMcpClientConfig(
  server: Pick<McpServer, "transport" | "command" | "args" | "env" | "url" | "headers">,
): MCPClientOptions {
  const transport = server.transport as SupportedMcpTransport;
  if (transport === "stdio") {
    if (!server.command) throw new Error("Command required for stdio MCP transport");
    return {
      transport,
      command: server.command,
      args: parseMcpArgs(server.args),
      env: parseJsonRecord(server.env, "MCP env"),
    };
  }
  if (!server.url) throw new Error(`URL required for ${transport} MCP transport`);
  return {
    transport,
    url: server.url,
    headers: parseJsonRecord(server.headers, "MCP headers"),
  };
}

function redactRecord(record: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!record || Object.keys(record).length === 0) return undefined;
  return Object.fromEntries(Object.keys(record).map((key) => [key, "<redacted>"]));
}

export function serializeMcpServerConfig(server: McpServer, includeSecrets = false): ExportedMcpServerConfig {
  const env = parseJsonRecord(server.env, "MCP env");
  const headers = parseJsonRecord(server.headers, "MCP headers");
  return {
    name: server.name,
    transport: server.transport as SupportedMcpTransport,
    command: server.command ?? undefined,
    args: parseMcpArgs(server.args),
    env: includeSecrets ? env : redactRecord(env),
    url: server.url ?? undefined,
    headers: includeSecrets ? headers : redactRecord(headers),
    enabled: server.enabled,
  };
}

export function normalizeToolSchemaSnapshot(value: unknown): MCPTool[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((tool): tool is MCPTool => {
      return isRecord(tool) && typeof tool.name === "string" && isRecord(tool.inputSchema);
    })
    .map((tool) => ({
      name: tool.name,
      description: typeof tool.description === "string" ? tool.description : "",
      inputSchema: tool.inputSchema,
    }));
}

import { z } from "zod";
import { MCP_TRANSPORTS, type SupportedMcpTransport } from "../mcp-config";
import { fetchWithOutboundGuard } from "../security/outbound";

export const MCP_MARKETPLACE_ITEM_VERSION = "agenthub.mcp.marketplace.item.v1" as const;
export const MCP_MARKETPLACE_INDEX_VERSION = "agenthub.mcp.marketplace.index.v1" as const;
export const MCP_MARKETPLACE_CACHE_TTL_MS = 5 * 60 * 1000;
export const MCP_MARKETPLACE_TIMEOUT_MS = 5000;
export const AGENTHUB_MCP_INDEX_URL = "AGENTHUB_MCP_INDEX_URL";

export const mcpMarketplaceItemSchema = z
  .object({
    schemaVersion: z.literal(MCP_MARKETPLACE_ITEM_VERSION),
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    description: z.string().default(""),
    category: z.string().default("General"),
    transport: z.enum(MCP_TRANSPORTS),
    commandTemplate: z.string().optional(),
    argsTemplate: z.array(z.string()).default([]),
    envTemplate: z.record(z.string()).default({}),
    urlTemplate: z.string().optional(),
    headersTemplate: z.record(z.string()).default({}),
    requiredVariables: z.array(z.string()).default([]),
    permissions: z.array(z.string()).default([]),
    dependencies: z
      .object({
        desktop: z.boolean().default(false),
        commands: z.array(z.string()).default([]),
        env: z.array(z.string()).default([]),
      })
      .default({ desktop: false, commands: [], env: [] }),
    tags: z.array(z.string()).default([]),
  })
  .strict();

export const mcpMarketplaceIndexSchema = z
  .object({
    schemaVersion: z.literal(MCP_MARKETPLACE_INDEX_VERSION),
    generatedAt: z.string().optional(),
    items: z.array(z.unknown()).default([]),
  })
  .strict();

export type McpMarketplaceItem = z.infer<typeof mcpMarketplaceItemSchema>;

export interface McpMarketplaceCatalog {
  items: McpMarketplaceItem[];
  warnings: string[];
  source: "bundled" | "remote" | "cache" | "offline";
}

export interface McpInstallTemplate {
  name: string;
  transport: SupportedMcpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

export interface McpMarketplacePreflight {
  status: "ready" | "needs_configuration" | "manual_required";
  missingVariables: string[];
  dependencies: string[];
  permissions: string[];
  manualInstructions: string[];
}

export const bundledMcpMarketplaceItems: McpMarketplaceItem[] = [
  mcpMarketplaceItemSchema.parse({
    schemaVersion: MCP_MARKETPLACE_ITEM_VERSION,
    id: "filesystem",
    slug: "filesystem",
    name: "Filesystem MCP",
    description: "Expose an explicit workspace path to MCP file tools.",
    category: "Local tools",
    transport: "stdio",
    commandTemplate: "npx",
    argsTemplate: ["-y", "@modelcontextprotocol/server-filesystem", "{{workspacePath}}"],
    requiredVariables: ["workspacePath"],
    permissions: ["filesystem:read", "filesystem:write"],
    dependencies: { desktop: true, commands: ["npx"], env: [] },
    tags: ["desktop", "files"],
  }),
  mcpMarketplaceItemSchema.parse({
    schemaVersion: MCP_MARKETPLACE_ITEM_VERSION,
    id: "streamable-template",
    slug: "streamable-template",
    name: "Streamable HTTP MCP",
    description: "Connect to a hosted streamable HTTP MCP endpoint.",
    category: "Remote tools",
    transport: "streamable-http",
    urlTemplate: "{{mcpUrl}}",
    headersTemplate: { Authorization: "Bearer {{apiToken}}" },
    requiredVariables: ["mcpUrl", "apiToken"],
    permissions: ["remote:http", "tool:call"],
    dependencies: { desktop: false, commands: [], env: [] },
    tags: ["remote", "http"],
  }),
  mcpMarketplaceItemSchema.parse({
    schemaVersion: MCP_MARKETPLACE_ITEM_VERSION,
    id: "sse-template",
    slug: "sse-template",
    name: "SSE MCP",
    description: "Connect to an MCP server that replies with server-sent events.",
    category: "Remote tools",
    transport: "sse",
    urlTemplate: "{{mcpUrl}}",
    requiredVariables: ["mcpUrl"],
    permissions: ["remote:sse", "tool:call"],
    dependencies: { desktop: false, commands: [], env: [] },
    tags: ["remote", "sse"],
  }),
];

interface McpMarketplaceCache {
  indexUrl: string;
  expiresAt: number;
  catalog: McpMarketplaceCatalog;
}

let mcpMarketplaceCache: McpMarketplaceCache | null = null;

function template(value: string | undefined, variables: Record<string, string>) {
  if (!value) return undefined;
  return value.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? `{{${key}}}`);
}

function templateRecord(record: Record<string, string>, variables: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [key, template(value, variables) ?? ""])
      .filter(([, value]) => value !== ""),
  );
}

function parseRemoteMcpItem(item: unknown) {
  return mcpMarketplaceItemSchema.parse(item);
}

function dedupeBySlug(items: McpMarketplaceItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.slug)) return false;
    seen.add(item.slug);
    return true;
  });
}

export function renderMcpInstallTemplate(
  item: McpMarketplaceItem,
  variables: Record<string, string> = {},
): McpInstallTemplate {
  return {
    name: item.name,
    transport: item.transport,
    command: template(item.commandTemplate, variables),
    args: item.argsTemplate.map((arg) => template(arg, variables) ?? arg),
    env: templateRecord(item.envTemplate, variables),
    url: template(item.urlTemplate, variables),
    headers: templateRecord(item.headersTemplate, variables),
    enabled: true,
  };
}

export function buildMcpManualInstructions(item: McpMarketplaceItem, variables: Record<string, string> = {}) {
  const rendered = renderMcpInstallTemplate(item, variables);
  if (rendered.transport !== "stdio") {
    return [`Add ${item.name} as a ${rendered.transport} MCP server using URL: ${rendered.url ?? "<endpoint>"}`];
  }
  const command = [rendered.command ?? "<command>", ...(rendered.args ?? [])].join(" ");
  return [
    "Desktop runtime is required for one-click STDIO MCP install.",
    `Run or configure this command in a trusted local desktop shell: ${command}`,
    "Then add the same command and arguments in MCP settings after verifying the path and permissions.",
  ];
}

export function preflightMcpMarketplaceInstall(
  item: McpMarketplaceItem,
  options: { variables?: Record<string, string>; desktopAvailable?: boolean } = {},
): McpMarketplacePreflight {
  const variables = options.variables ?? {};
  const missingVariables = item.requiredVariables.filter((key) => !variables[key]?.trim());
  const manualRequired = item.transport === "stdio" && item.dependencies.desktop && !options.desktopAvailable;
  return {
    status: missingVariables.length > 0 ? "needs_configuration" : manualRequired ? "manual_required" : "ready",
    missingVariables,
    dependencies: [
      ...(item.dependencies.desktop ? ["desktop-runtime"] : []),
      ...item.dependencies.commands,
      ...item.dependencies.env.map((name) => `env:${name}`),
    ],
    permissions: item.permissions,
    manualInstructions: manualRequired ? buildMcpManualInstructions(item, variables) : [],
  };
}

export async function fetchMcpMarketplaceCatalog(
  indexUrl = process.env[AGENTHUB_MCP_INDEX_URL],
): Promise<McpMarketplaceCatalog> {
  if (!indexUrl) {
    return { items: bundledMcpMarketplaceItems, warnings: [], source: "bundled" };
  }

  const now = Date.now();
  if (mcpMarketplaceCache?.indexUrl === indexUrl && mcpMarketplaceCache.expiresAt > now) {
    return { ...mcpMarketplaceCache.catalog, source: "cache" };
  }

  try {
    const res = await fetchWithOutboundGuard(
      indexUrl,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(MCP_MARKETPLACE_TIMEOUT_MS),
      },
      {
        purpose: "MCP marketplace",
      },
    );
    if (!res.ok) {
      return {
        items: bundledMcpMarketplaceItems,
        warnings: [`MCP marketplace returned ${res.status}.`],
        source: "offline",
      };
    }
    const remoteIndex = mcpMarketplaceIndexSchema.parse(await res.json());
    const warnings: string[] = [];
    const remoteItems: McpMarketplaceItem[] = [];
    for (const item of remoteIndex.items) {
      try {
        remoteItems.push(parseRemoteMcpItem(item));
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : "Skipped invalid MCP marketplace item.");
      }
    }
    const catalog = {
      items: dedupeBySlug([...bundledMcpMarketplaceItems, ...remoteItems]),
      warnings,
      source: "remote" as const,
    };
    mcpMarketplaceCache = { indexUrl, expiresAt: now + MCP_MARKETPLACE_CACHE_TTL_MS, catalog };
    return catalog;
  } catch (error) {
    return {
      items: bundledMcpMarketplaceItems,
      warnings: [error instanceof Error ? error.message : "MCP marketplace unavailable."],
      source: "offline",
    };
  }
}

export async function findMcpMarketplaceItem(slug: string) {
  const catalog = await fetchMcpMarketplaceCatalog();
  return catalog.items.find((item) => item.slug === slug || item.id === slug) ?? null;
}

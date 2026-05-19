import { z } from "zod";
import { fetchWithOutboundGuard } from "../security/outbound";
import type { ExtraTool } from "@agenthub/agent-runtime";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
const OPENAPI_TOOL_TIMEOUT_MS = 10_000;

const openApiDocumentSchema = z
  .object({
    openapi: z.string().startsWith("3."),
    info: z
      .object({
        title: z.string().min(1),
        version: z.string().optional(),
        description: z.string().optional(),
      })
      .passthrough(),
    servers: z.array(z.object({ url: z.string().min(1) }).passthrough()).optional(),
    paths: z.record(z.record(z.unknown())),
  })
  .passthrough();

export type OpenApiPluginTool = {
  name: string;
  description: string;
  method: Uppercase<HttpMethod>;
  path: string;
  operationId?: string;
  parameters: Record<string, unknown>;
};

export type OpenApiPluginManifest = {
  schemaVersion: "agenthub.openapi-plugin.v1";
  slug: string;
  title: string;
  version?: string;
  description?: string;
  sourceUrl?: string;
  serverUrl?: string;
  tools: OpenApiPluginTool[];
};

export type InstalledOpenApiPlugin = OpenApiPluginManifest & {
  id: string;
  enabledToolIds: string[];
};

function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value);
}

function safeToolName(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return /^[a-z]/.test(normalized) ? normalized : `openapi_${normalized || "tool"}`;
}

function safeSlug(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || "openapi-plugin";
}

export function openApiToolRuntimeName(pluginSlug: string, toolName: string) {
  return safeToolName(`openapi_${pluginSlug}_${toolName}`);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parameterProperty(parameter: Record<string, unknown>) {
  const schema = asRecord(parameter.schema) || { type: "string" };
  const description = typeof parameter.description === "string" ? parameter.description : undefined;
  return description ? { ...schema, description } : schema;
}

function buildParameters(pathItem: Record<string, unknown>, operation: Record<string, unknown>) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const parameters = [
    ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation.parameters) ? operation.parameters : []),
  ];

  for (const rawParameter of parameters) {
    const parameter = asRecord(rawParameter);
    if (!parameter || typeof parameter.name !== "string") continue;
    const location = typeof parameter.in === "string" ? parameter.in : "query";
    const propertyName = `${location}_${parameter.name}`.replace(/[^a-zA-Z0-9_]/g, "_");
    properties[propertyName] = parameterProperty(parameter);
    if (parameter.required === true || location === "path") {
      required.push(propertyName);
    }
  }

  const requestBody = asRecord(operation.requestBody);
  const content = asRecord(requestBody?.content);
  const jsonBody = asRecord(content?.["application/json"]);
  const bodySchema = asRecord(jsonBody?.schema);
  if (bodySchema) {
    properties.body = bodySchema;
    if (requestBody?.required === true) required.push("body");
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

export function parseOpenApiPlugin(input: unknown, options: { sourceUrl?: string } = {}): OpenApiPluginManifest {
  const document = openApiDocumentSchema.parse(input);
  const tools: OpenApiPluginTool[] = [];

  for (const [path, rawPathItem] of Object.entries(document.paths)) {
    const pathItem = asRecord(rawPathItem);
    if (!pathItem) continue;
    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!isHttpMethod(method)) continue;
      const operation = asRecord(rawOperation);
      if (!operation) continue;
      const operationId = typeof operation.operationId === "string" ? operation.operationId : undefined;
      const fallbackName = `${method}_${path.replace(/[{}]/g, "")}`;
      const summary = typeof operation.summary === "string" ? operation.summary : undefined;
      const description = typeof operation.description === "string" ? operation.description : undefined;
      tools.push({
        name: safeToolName(operationId || fallbackName),
        description: summary || description || `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase() as Uppercase<HttpMethod>,
        path,
        operationId,
        parameters: buildParameters(pathItem, operation),
      });
    }
  }

  if (tools.length === 0) {
    throw new Error("OpenAPI document does not expose any supported HTTP operations.");
  }

  return {
    schemaVersion: "agenthub.openapi-plugin.v1",
    slug: `openapi-${safeSlug(document.info.title)}`,
    title: document.info.title,
    version: document.info.version,
    description: document.info.description,
    sourceUrl: options.sourceUrl,
    serverUrl: document.servers?.[0]?.url,
    tools,
  };
}

export async function fetchOpenApiPlugin(url: string) {
  const response = await fetchWithOutboundGuard(
    url,
    {
      headers: { Accept: "application/json, application/vnd.oai.openapi+json;q=0.9" },
      signal: AbortSignal.timeout(5000),
    },
    {
      purpose: "OpenAPI plugin loader",
    },
  );
  if (!response.ok) {
    throw new Error(`OpenAPI plugin fetch failed with HTTP ${response.status}.`);
  }
  return parseOpenApiPlugin(await response.json(), { sourceUrl: url });
}

export function openApiPluginToSkillPackage(manifest: OpenApiPluginManifest) {
  const toolList = manifest.tools
    .map((tool) => `- ${openApiToolRuntimeName(manifest.slug, tool.name)}: ${tool.description}`)
    .join("\n");

  return {
    schemaVersion: "agenthub.skill.v1" as const,
    metadata: {
      slug: manifest.slug,
      name: manifest.title,
      description: manifest.description || `OpenAPI plugin with ${manifest.tools.length} generated tool(s).`,
      version: manifest.version || "1.0.0",
      sourceUrl: manifest.sourceUrl,
      tags: ["openapi", "plugin"],
    },
    skillMarkdown: [
      `# ${manifest.title}`,
      "",
      "This installed package stores a governed OpenAPI plugin manifest.",
      "Enable one of its generated OpenAPI tool IDs on an agent before use.",
      "",
      "## Generated Tools",
      toolList,
    ]
      .filter(Boolean)
      .join("\n"),
    resources: [
      {
        path: "openapi/manifest.json",
        type: "reference" as const,
        mimeType: "application/json",
        description: "Normalized AgentHub OpenAPI plugin manifest.",
        content: JSON.stringify(manifest, null, 2),
      },
    ],
    scripts: [],
    templates: [],
    permissions: {
      operations: ["readReference"] as const,
      allowNetwork: true,
      allowFileSystem: false,
      scriptExecution: "disabled" as const,
    },
  };
}

function readManifestResource(plugin: { slug: string }, resources: Array<{ path: string; content: string }>) {
  const resource = resources.find((candidate) => candidate.path === "openapi/manifest.json");
  if (!resource) throw new Error(`OpenAPI manifest resource missing for ${plugin.slug}`);
  return JSON.parse(resource.content) as OpenApiPluginManifest;
}

export function createInstalledOpenApiPlugin(
  plugin: { id: string; slug: string },
  resources: Array<{ path: string; content: string }>,
): InstalledOpenApiPlugin {
  const manifest = readManifestResource(plugin, resources);
  return {
    ...manifest,
    id: plugin.id,
    enabledToolIds: manifest.tools.map((tool) => openApiToolRuntimeName(manifest.slug, tool.name)),
  };
}

function appendSearchParam(url: URL, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) appendSearchParam(url, key, item);
    return;
  }
  url.searchParams.append(key, String(value));
}

function jsonResponseBody(contentType: string | null, body: string) {
  if (!contentType?.includes("application/json")) return body.slice(0, 20_000);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body.slice(0, 20_000);
  }
}

export async function executeOpenApiPluginTool(
  manifest: OpenApiPluginManifest,
  tool: OpenApiPluginTool,
  args: Record<string, unknown>,
  options: { timeoutMs?: number } = {},
) {
  if (!manifest.serverUrl) {
    throw new Error(`OpenAPI plugin ${manifest.title} does not declare a server URL.`);
  }

  const path = tool.path.replace(/\{([^}]+)\}/g, (match, name: string) => {
    const value = args[`path_${name}`] ?? args[name];
    if (value === undefined || value === null || value === "") {
      throw new Error(`Missing required OpenAPI path parameter: ${name}`);
    }
    return encodeURIComponent(String(value));
  });
  const url = new URL(path, manifest.serverUrl.endsWith("/") ? manifest.serverUrl : `${manifest.serverUrl}/`);
  const headers: Record<string, string> = { Accept: "application/json, text/plain;q=0.9" };
  let body: string | undefined;

  for (const [key, value] of Object.entries(args)) {
    if (key.startsWith("query_")) appendSearchParam(url, key.slice("query_".length), value);
    if (key.startsWith("header_") || key.startsWith("cookie_")) {
      throw new Error("OpenAPI plugin runtime does not accept dynamic header or cookie parameters.");
    }
  }

  if (args.body !== undefined && args.body !== null) {
    headers["Content-Type"] = "application/json";
    body = typeof args.body === "string" ? args.body : JSON.stringify(args.body);
  }

  const response = await fetchWithOutboundGuard(
    url.toString(),
    {
      method: tool.method,
      headers,
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? OPENAPI_TOOL_TIMEOUT_MS),
    },
    { purpose: "OpenAPI plugin tool" },
  );
  const responseText = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type") ?? "",
    body: jsonResponseBody(response.headers.get("content-type"), responseText),
  };
}

export function createOpenApiRuntimeTools(plugins: InstalledOpenApiPlugin[], selectedTools: string[]): ExtraTool[] {
  const selected = new Set(selectedTools);
  return plugins.flatMap((plugin) =>
    plugin.tools
      .map((tool) => ({ tool, runtimeName: openApiToolRuntimeName(plugin.slug, tool.name) }))
      .filter(({ runtimeName }) => selected.has(runtimeName))
      .map(({ tool, runtimeName }) => ({
        name: runtimeName,
        description: `[OpenAPI: ${plugin.title}] ${tool.description}`,
        parameters: tool.parameters,
        execute: (args: Record<string, unknown>) => executeOpenApiPluginTool(plugin, tool, args),
      })),
  );
}

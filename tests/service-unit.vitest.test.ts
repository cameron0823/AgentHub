import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMcpClientConfig,
  normalizeToolSchemaSnapshot,
  parseJsonRecord,
  parseMcpArgs,
  serializeMcpServerConfig,
} from "../apps/web/src/server/mcp-config";
import { validateMediaUrl, validateMessageMedia } from "../apps/web/src/server/media-safety";
import {
  createOpenApiRuntimeTools,
  executeOpenApiPluginTool,
  openApiToolRuntimeName,
  parseOpenApiPlugin,
} from "../apps/web/src/server/marketplace/openapi";
import { compileToolProfile, isToolAllowedByProfile } from "../apps/web/src/server/tool-profiles";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MCP server configuration service", () => {
  it("normalizes JSON records and args into client-ready stdio config", () => {
    const config = buildMcpClientConfig({
      transport: "stdio",
      command: "node",
      args: '["server.mjs", "--stdio"]',
      env: { API_KEY: "secret", RETRIES: 3 },
      url: null,
      headers: null,
    });

    expect(config).toEqual({
      transport: "stdio",
      command: "node",
      args: ["server.mjs", "--stdio"],
      env: { API_KEY: "secret" },
    });
    expect(parseMcpArgs("--flag value")).toEqual(["--flag", "value"]);
    expect(parseJsonRecord('{"token":"abc","nested":{"skip":true},"empty":""}', "MCP env")).toEqual({
      token: "abc",
      empty: "",
    });
  });

  it("serializes HTTP config with redacted secrets and valid tool snapshots", () => {
    const clientConfig = buildMcpClientConfig({
      transport: "http",
      command: null,
      args: null,
      env: null,
      url: "https://mcp.example.test/rpc",
      headers: '{"Authorization":"Bearer secret"}',
    });

    expect(clientConfig).toEqual({
      transport: "http",
      url: "https://mcp.example.test/rpc",
      headers: { Authorization: "Bearer secret" },
    });
    expect(
      serializeMcpServerConfig({
        name: "example",
        transport: "http",
        command: null,
        args: null,
        env: '{"TOKEN":"secret"}',
        url: "https://mcp.example.test/rpc",
        headers: '{"Authorization":"Bearer secret"}',
        enabled: true,
      } as never),
    ).toMatchObject({
      env: { TOKEN: "<redacted>" },
      headers: { Authorization: "<redacted>" },
      enabled: true,
    });
    expect(
      normalizeToolSchemaSnapshot([
        { name: "search", description: "Search", inputSchema: { type: "object" } },
        { name: 123, inputSchema: { type: "object" } },
        { name: "broken", inputSchema: null },
      ]),
    ).toEqual([{ name: "search", description: "Search", inputSchema: { type: "object" } }]);
  });
});

describe("tool profile service", () => {
  it("enforces built-in profile allowlists and wildcard denials", () => {
    const access = compileToolProfile({
      profile: "coding",
      selectedTools: ["calculator", "execute_code", "mcp:filesystem", "skill:review", "web_fetch", "web_fetch"],
      deniedTools: ["execute_code", "mcp:*"],
    });

    expect(access.allowedTools).toEqual(["calculator", "skill:review", "web_fetch"]);
    expect(access.removedTools).toEqual(["execute_code", "mcp:filesystem"]);
    expect(isToolAllowedByProfile("execute_code", access)).toBe(false);
    expect(isToolAllowedByProfile("mcp:filesystem", access)).toBe(false);
    expect(isToolAllowedByProfile("run_skill", access)).toBe(true);
  });

  it("allows selected OpenAPI tools only under extension-capable profiles and wildcard denials", () => {
    const toolId = "openapi_example_get_item";
    const allowed = compileToolProfile({
      profile: "coding",
      selectedTools: [toolId],
    });
    const denied = compileToolProfile({
      profile: "coding",
      selectedTools: [toolId],
      deniedTools: ["openapi:*"],
    });

    expect(allowed.allowedTools).toEqual([toolId]);
    expect(isToolAllowedByProfile(toolId, allowed)).toBe(true);
    expect(denied.allowedTools).toEqual([]);
    expect(isToolAllowedByProfile(toolId, denied)).toBe(false);
  });

  it("falls back unknown profiles to minimal permissions", () => {
    const access = compileToolProfile({
      profile: "unknown",
      selectedTools: ["calculator", "web_search", "skill:review"],
    });

    expect(access.profile).toBe("minimal");
    expect(access.allowedTools).toEqual(["calculator"]);
    expect(isToolAllowedByProfile("web_search", access)).toBe(false);
  });
});

describe("media safety service", () => {
  it("blocks private media URLs unless explicitly trusted", () => {
    expect(() => validateMediaUrl("http://127.0.0.1:9000/image.png")).toThrow(/private or local network target/);
    expect(
      validateMediaUrl("http://127.0.0.1:9000/image.png#discarded", {
        trustedOrigins: ["http://127.0.0.1:9000"],
      }),
    ).toBe("http://127.0.0.1:9000/image.png");
  });

  it("validates image content without mutating non-image parts", () => {
    const messages = validateMessageMedia(
      [
        {
          role: "user",
          content: [
            { type: "text", text: "inspect this" },
            { type: "image_url", url: "https://example.com/screenshot.png#hash" },
          ],
        },
      ],
      { trustedOrigins: ["https://example.com"] },
    );

    expect(messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "inspect this" },
          { type: "image_url", url: "https://example.com/screenshot.png" },
        ],
      },
    ]);
  });
});

describe("OpenAPI plugin service", () => {
  const document = {
    openapi: "3.1.0",
    info: { title: "Example API", version: "1.2.3", description: "Example operations" },
    servers: [{ url: "https://api.example.test" }],
    paths: {
      "/items/{id}": {
        get: {
          operationId: "getItem",
          summary: "Get item",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "verbose", in: "query", schema: { type: "boolean" } },
          ],
        },
      },
    },
  };

  it("creates provider-safe runtime tools from installed plugin manifests", () => {
    const manifest = parseOpenApiPlugin(document);
    const [tool] = createOpenApiRuntimeTools(
      [
        {
          ...manifest,
          id: "plugin-id",
          enabledToolIds: [openApiToolRuntimeName(manifest.slug, manifest.tools[0].name)],
        },
      ],
      [openApiToolRuntimeName(manifest.slug, manifest.tools[0].name)],
    );

    expect(manifest.slug).toBe("openapi-example-api");
    expect(tool.name).toBe("openapi_openapi_example_api_getitem");
    expect(tool.description).toContain("Example API");
    expect(tool.parameters).toMatchObject({
      type: "object",
      required: ["path_id"],
    });
  });

  it("executes OpenAPI tools through guarded fetch with encoded path, query args, and timeout signal", async () => {
    const manifest = parseOpenApiPlugin(document);
    const tool = manifest.tools[0];
    const fetchMock = vi.fn(async (url: URL, init: RequestInit) => {
      return new Response(
        JSON.stringify({
          url: url.toString(),
          method: init.method,
          hasSignal: init.signal instanceof AbortSignal,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeOpenApiPluginTool(
      manifest,
      tool,
      { path_id: "item 1", query_verbose: true },
      { timeoutMs: 25 },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result).toEqual({
      ok: true,
      status: 200,
      statusText: "",
      contentType: "application/json",
      body: {
        url: "https://api.example.test/items/item%201?verbose=true",
        method: "GET",
        hasSignal: true,
      },
    });
  });

  it("returns observable HTTP errors and rejects unsafe dynamic headers", async () => {
    const manifest = parseOpenApiPlugin(document);
    const tool = manifest.tools[0];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("failed", { status: 502, statusText: "Bad Gateway" })),
    );

    await expect(
      executeOpenApiPluginTool(manifest, tool, { path_id: "1", header_Authorization: "Bearer secret" }),
    ).rejects.toThrow(/does not accept dynamic header/);
    await expect(executeOpenApiPluginTool(manifest, tool, { query_verbose: true })).rejects.toThrow(
      /Missing required OpenAPI path parameter/,
    );
    await expect(executeOpenApiPluginTool(manifest, tool, { path_id: "1" })).resolves.toMatchObject({
      ok: false,
      status: 502,
      body: "failed",
    });
  });
});

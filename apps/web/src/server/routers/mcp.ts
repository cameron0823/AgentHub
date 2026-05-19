import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { MCPClient, createToolSchemaFingerprint, diffToolSchemas } from "@agenthub/agent-runtime";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { mcpServers } from "../db/schema";
import {
  MCP_TRANSPORTS,
  buildMcpClientConfig,
  normalizeToolSchemaSnapshot,
  parseJsonRecord,
  parseMcpArgs,
  serializeMcpServerConfig,
  type ExportedMcpServerConfig,
  type SupportedMcpTransport,
} from "../mcp-config";
import {
  fetchMcpMarketplaceCatalog,
  findMcpMarketplaceItem,
  preflightMcpMarketplaceInstall,
  renderMcpInstallTemplate,
} from "../mcp/marketplace";

const SHELL_METACHAR_RE = /[;&|$>`!(){}\[\]]/;
const SIMPLE_COMMAND_RE = /^[A-Za-z0-9._+-]+$/;

function validateStdioCommandPath(command: string | undefined) {
  if (!command) return;
  const trimmed = command.trim();
  if (SHELL_METACHAR_RE.test(command)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "MCP command contains forbidden shell metacharacters (;&|$>`!(){}[]). Provide an absolute path or executable name only.",
    });
  }
  if (!trimmed.startsWith("/") && !SIMPLE_COMMAND_RE.test(trimmed)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "MCP command must be an absolute path or executable name only.",
    });
  }
}

const validateCommand = validateStdioCommandPath;

const mcpServerInput = z.object({
  name: z.string().min(1),
  transport: z.enum(MCP_TRANSPORTS),
  command: z.string().optional(),
  args: z.string().optional(),
  env: z.string().optional(),
  url: z.string().url().optional(),
  headers: z.string().optional(),
  enabled: z.boolean().optional(),
});

function ensureJsonObjectValue(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return;
  try {
    parseJsonRecord(value, label);
  } catch (err) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: err instanceof Error ? err.message : `${label} must be valid JSON`,
    });
  }
}

function validateMcpConfig(input: {
  transport?: SupportedMcpTransport;
  command?: string | null;
  url?: string | null;
  env?: unknown;
  headers?: unknown;
}) {
  if (input.transport === "stdio" || input.command !== undefined) {
    validateCommand(input.command ?? undefined);
  }
  if (input.transport === "stdio") {
    if (!input.command?.trim()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Command required for stdio MCP transport" });
    }
  }
  if (input.transport && input.transport !== "stdio" && !input.url?.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `URL required for ${input.transport} MCP transport` });
  }
  ensureJsonObjectValue(input.env, "MCP env");
  ensureJsonObjectValue(input.headers, "MCP headers");
}

function safeRecord(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "<redacted>",
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function serializeRecordForStorage(value: unknown): Record<string, string> {
  const record = safeRecord(value);
  return record ?? {};
}

function normalizeImportedServers(config: unknown): ExportedMcpServerConfig[] {
  const rawServers = Array.isArray(config)
    ? config
    : typeof config === "object" && config !== null && Array.isArray((config as { servers?: unknown }).servers)
      ? (config as { servers: unknown[] }).servers
      : [];
  return rawServers
    .filter((server): server is ExportedMcpServerConfig => {
      if (typeof server !== "object" || server === null) return false;
      const candidate = server as { name?: unknown; transport?: unknown };
      return (
        typeof candidate.name === "string" && MCP_TRANSPORTS.includes(candidate.transport as SupportedMcpTransport)
      );
    })
    .map((server) => ({
      name: server.name,
      transport: server.transport,
      command: typeof server.command === "string" ? server.command : undefined,
      args: Array.isArray(server.args)
        ? server.args.filter((arg): arg is string => typeof arg === "string")
        : undefined,
      env: safeRecord(server.env),
      url: typeof server.url === "string" ? server.url : undefined,
      headers: safeRecord(server.headers),
      enabled: typeof server.enabled === "boolean" ? server.enabled : true,
    }));
}

async function runMcpServerHealth(userId: string, id: string) {
  const [server] = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)))
    .limit(1);
  if (!server) throw new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" });

  let client: MCPClient | null = null;
  const checkedAt = new Date();
  try {
    client = new MCPClient(buildMcpClientConfig(server));
    const health = await client.healthCheck();
    const tools = client.getTools();
    const schemaDiff = diffToolSchemas(normalizeToolSchemaSnapshot(server.toolSchemaSnapshot), tools);
    const schemaFingerprint = createToolSchemaFingerprint(tools);
    await db
      .update(mcpServers)
      .set({
        lastHealthStatus: health.ok ? "healthy" : "error",
        lastHealthCheckedAt: checkedAt,
        lastToolCount: tools.length,
        lastError: health.error ?? null,
        toolSchemaSnapshot: tools,
        toolSchemaFingerprint: schemaFingerprint,
      })
      .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)));

    return {
      ok: health.ok,
      status: health.ok ? "healthy" : "error",
      toolCount: tools.length,
      error: health.error,
      latencyMs: health.latencyMs,
      schemaFingerprint,
      schemaDiff,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db
      .update(mcpServers)
      .set({
        lastHealthStatus: "error",
        lastHealthCheckedAt: checkedAt,
        lastError: error,
      })
      .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)));
    return { ok: false, status: "error", toolCount: 0, error, schemaDiff: { added: [], removed: [], changed: [] } };
  } finally {
    if (client) client.disconnect();
  }
}

export const mcpRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.select().from(mcpServers).where(eq(mcpServers.userId, ctx.user.id)).orderBy(desc(mcpServers.createdAt));
  }),

  create: authedProcedure.input(mcpServerInput).mutation(async ({ ctx, input }) => {
    validateMcpConfig(input);
    const [server] = await db
      .insert(mcpServers)
      .values({
        userId: ctx.user.id,
        name: input.name,
        transport: input.transport,
        command: input.command || null,
        args: parseMcpArgs(input.args),
        env: parseJsonRecord(input.env, "MCP env"),
        url: input.url || null,
        headers: parseJsonRecord(input.headers, "MCP headers"),
        enabled: input.enabled ?? true,
      })
      .returning();
    return server;
  }),

  update: authedProcedure
    .input(mcpServerInput.partial().extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      validateMcpConfig(input);
      const { id, ...updates } = input;
      await db
        .update(mcpServers)
        .set({
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.transport !== undefined && { transport: updates.transport }),
          ...(updates.command !== undefined && { command: updates.command || null }),
          ...(updates.args !== undefined && { args: parseMcpArgs(updates.args) }),
          ...(updates.env !== undefined && { env: parseJsonRecord(updates.env, "MCP env") }),
          ...(updates.url !== undefined && { url: updates.url || null }),
          ...(updates.headers !== undefined && { headers: parseJsonRecord(updates.headers, "MCP headers") }),
          ...(updates.enabled !== undefined && { enabled: updates.enabled }),
        })
        .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db.delete(mcpServers).where(and(eq(mcpServers.id, input.id), eq(mcpServers.userId, ctx.user.id)));
    return { success: true };
  }),

  test: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    return runMcpServerHealth(ctx.user.id, input.id);
  }),

  health: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    return runMcpServerHealth(ctx.user.id, input.id);
  }),

  discover: authedProcedure
    .input(
      z.object({
        transport: z.enum(MCP_TRANSPORTS),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional(),
        url: z.string().url().optional(),
        headers: z.record(z.string()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      validateMcpConfig({
        transport: input.transport,
        command: input.command,
        url: input.url,
        env: input.env,
        headers: input.headers,
      });
      const config = buildMcpClientConfig({
        transport: input.transport,
        command: input.command ?? null,
        args: input.args ?? [],
        env: input.env ?? {},
        url: input.url ?? null,
        headers: input.headers ?? {},
      });
      const client = new MCPClient(config);
      try {
        await client.connect();
        const tools = client.getTools();
        await client.disconnect();
        return {
          ok: true,
          tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
          schemaFingerprint: createToolSchemaFingerprint(tools),
        };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err), tools: [] };
      }
    }),

  exportConfig: authedProcedure
    .input(z.object({ includeSecrets: z.boolean().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const servers = await db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.userId, ctx.user.id))
        .orderBy(desc(mcpServers.createdAt));
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        servers: servers.map((server) => serializeMcpServerConfig(server, input?.includeSecrets ?? false)),
      };
    }),

  importConfig: authedProcedure
    .input(z.object({ config: z.unknown(), replace: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const servers = normalizeImportedServers(input.config);
      if (input.replace) {
        await db.delete(mcpServers).where(eq(mcpServers.userId, ctx.user.id));
      }
      if (servers.length === 0) return { imported: 0 };

      const values = servers.map((server) => {
        const row = {
          userId: ctx.user.id,
          name: server.name,
          transport: server.transport,
          command: server.command ?? null,
          args: server.args ?? [],
          env: serializeRecordForStorage(server.env),
          url: server.url ?? null,
          headers: serializeRecordForStorage(server.headers),
          enabled: server.enabled ?? true,
        };
        validateMcpConfig(row);
        return row;
      });
      await db.insert(mcpServers).values(values);
      return { imported: values.length };
    }),

  marketplaceCatalog: authedProcedure
    .input(z.object({ query: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const catalog = await fetchMcpMarketplaceCatalog();
      const query = input?.query?.trim().toLowerCase();
      if (!query) return catalog;
      return {
        ...catalog,
        items: catalog.items.filter((item) => {
          return [item.name, item.slug, item.description, item.category, ...item.tags].some((value) =>
            value.toLowerCase().includes(query),
          );
        }),
      };
    }),

  marketplacePreflight: authedProcedure
    .input(
      z.object({
        slug: z.string().min(1),
        variables: z.record(z.string()).optional(),
        desktopAvailable: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const item = await findMcpMarketplaceItem(input.slug);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "MCP marketplace item not found" });
      return {
        item,
        preflight: preflightMcpMarketplaceInstall(item, {
          variables: input.variables,
          desktopAvailable: input.desktopAvailable,
        }),
      };
    }),

  installMarketplaceItem: authedProcedure
    .input(
      z.object({
        slug: z.string().min(1),
        variables: z.record(z.string()).optional(),
        desktopAvailable: z.boolean().optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const item = await findMcpMarketplaceItem(input.slug);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "MCP marketplace item not found" });
      const variables = input.variables ?? {};
      const preflight = preflightMcpMarketplaceInstall(item, {
        variables,
        desktopAvailable: input.desktopAvailable,
      });
      const manualInstructions = preflight.manualInstructions;
      if (preflight.status === "manual_required") {
        return { installed: false, server: null, preflight, manualInstructions };
      }
      if (preflight.status === "needs_configuration") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Missing required MCP marketplace variables: ${preflight.missingVariables.join(", ")}`,
        });
      }

      const rendered = renderMcpInstallTemplate(item, variables);
      const row = {
        userId: ctx.user.id,
        name: rendered.name,
        transport: rendered.transport,
        command: rendered.command ?? null,
        args: rendered.args ?? [],
        env: serializeRecordForStorage(rendered.env),
        url: rendered.url ?? null,
        headers: serializeRecordForStorage(rendered.headers),
        enabled: input.enabled ?? rendered.enabled,
      };
      validateMcpConfig(row);
      const [server] = await db.insert(mcpServers).values(row).returning();
      return { installed: true, server, preflight, manualInstructions };
    }),
});

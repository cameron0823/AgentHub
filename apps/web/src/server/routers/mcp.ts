import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { mcpServers } from "../db/schema";

const mcpServerInput = z.object({
  name:      z.string().min(1),
  transport: z.enum(["stdio", "http"]),
  command:   z.string().optional(),
  args:      z.string().optional(),
  env:       z.string().optional(),
  url:       z.string().url().optional(),
  enabled:   z.boolean().optional(),
});

export const mcpRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.select().from(mcpServers)
      .where(eq(mcpServers.userId, ctx.user.id))
      .orderBy(desc(mcpServers.createdAt));
  }),

  create: authedProcedure
    .input(mcpServerInput)
    .mutation(async ({ ctx, input }) => {
      const [server] = await db.insert(mcpServers).values({
        userId:    ctx.user.id,
        name:      input.name,
        transport: input.transport,
        command:   input.command || null,
        args:      input.args || null,
        env:       input.env || null,
        url:       input.url || null,
        enabled:   input.enabled ?? true,
      }).returning();
      return server;
    }),

  update: authedProcedure
    .input(mcpServerInput.partial().extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      await db.update(mcpServers).set({
        ...(updates.name      !== undefined && { name:      updates.name }),
        ...(updates.transport !== undefined && { transport: updates.transport }),
        ...(updates.command   !== undefined && { command:   updates.command || null }),
        ...(updates.args      !== undefined && { args:      updates.args || null }),
        ...(updates.env       !== undefined && { env:       updates.env || null }),
        ...(updates.url       !== undefined && { url:       updates.url || null }),
        ...(updates.enabled   !== undefined && { enabled:   updates.enabled }),
      }).where(and(eq(mcpServers.id, id), eq(mcpServers.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(mcpServers)
        .where(and(eq(mcpServers.id, input.id), eq(mcpServers.userId, ctx.user.id)));
      return { success: true };
    }),

  test: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [server] = await db.select().from(mcpServers)
        .where(and(eq(mcpServers.id, input.id), eq(mcpServers.userId, ctx.user.id)))
        .limit(1);
      if (!server) throw new Error("MCP server not found");

      const { MCPClient } = await import("@agenthub/agent-runtime");
      const config = server.transport === "stdio"
        ? { transport: "stdio" as const, command: server.command!, args: server.args ? JSON.parse(server.args) : [], env: server.env ? JSON.parse(server.env) : {} }
        : { transport: "http" as const, url: server.url! };

      const client = new MCPClient(config);
      try {
        await client.connect();
        const tools = await client.getTools();
        await client.disconnect();
        return { ok: true, toolCount: tools.length };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
});

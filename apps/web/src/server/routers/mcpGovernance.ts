import { z } from "zod";
import { and, desc, eq, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { credentialAuditLog, mcpServers } from "../db/schema";

const allowedHoursSchema = z.union([
  z.array(z.number().int().min(0).max(23)).max(24),
  z.object({
    start: z.number().int().min(0).max(23),
    end: z.number().int().min(0).max(23),
  }),
]);

const governancePolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    allowedTools: z.array(z.string().min(1).max(100)).max(200).optional(),
    deniedTools: z.array(z.string().min(1).max(100)).max(200).optional(),
    rateLimitPerMinute: z.number().int().positive().max(10_000).optional(),
    allowedHoursUtc: allowedHoursSchema.optional(),
    blockedPatterns: z.array(z.string().min(1).max(200)).max(100).optional(),
  })
  .strict();

async function assertOwnedMcpServer(userId: string, serverId: string) {
  const [server] = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, serverId), eq(mcpServers.userId, userId)))
    .limit(1);
  if (!server) throw new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" });
  return server;
}

export const mcpGovernanceRouter = router({
  getPolicy: authedProcedure.input(z.object({ serverId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const server = await assertOwnedMcpServer(ctx.user.id, input.serverId);
    return {
      serverId: server.id,
      governanceEnabled: server.governanceEnabled,
      governancePolicy: server.governancePolicy,
    };
  }),

  upsertPolicy: authedProcedure
    .input(
      z.object({
        serverId: z.string().uuid(),
        governanceEnabled: z.boolean().optional(),
        governancePolicy: governancePolicySchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnedMcpServer(ctx.user.id, input.serverId);
      await db
        .update(mcpServers)
        .set({
          ...(input.governanceEnabled !== undefined && { governanceEnabled: input.governanceEnabled }),
          governancePolicy: input.governancePolicy,
        })
        .where(and(eq(mcpServers.id, input.serverId), eq(mcpServers.userId, ctx.user.id)));
      return { success: true };
    }),

  auditLog: authedProcedure
    .input(
      z
        .object({
          serverId: z.string().uuid().optional(),
          limit: z.number().int().positive().max(200).default(50),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      if (input?.serverId) {
        await assertOwnedMcpServer(ctx.user.id, input.serverId);
      }
      const where = input?.serverId
        ? and(eq(credentialAuditLog.userId, ctx.user.id), like(credentialAuditLog.tool, `mcp:${input.serverId}:%`))
        : and(eq(credentialAuditLog.userId, ctx.user.id), like(credentialAuditLog.tool, "mcp:%"));

      return db
        .select()
        .from(credentialAuditLog)
        .where(where)
        .orderBy(desc(credentialAuditLog.createdAt))
        .limit(input?.limit ?? 50);
    }),
});

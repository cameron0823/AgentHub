import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { agents, agentCredentials, credentialAuditLog, trustPolicies } from "../db/schema";
import { encrypt, keyHint } from "../trust-engine";

// ── Credential Vault ──────────────────────────────────────────────────────────

const credentialInput = z.object({
  name: z.string().min(1).max(100),
  tool: z.string().min(1).max(100),
  value: z.string().min(1).max(65536), // 64 KB max; prevent DB bloat
  agentId: z.string().uuid().optional(),
});

export const trustRouter = router({
  // ── Credentials ────────────────────────────────────────────────────────────

  listCredentials: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id: agentCredentials.id,
        name: agentCredentials.name,
        tool: agentCredentials.tool,
        agentId: agentCredentials.agentId,
        keyHint: agentCredentials.keyHint,
        createdAt: agentCredentials.createdAt,
      })
      .from(agentCredentials)
      .where(eq(agentCredentials.userId, ctx.user.id))
      .orderBy(desc(agentCredentials.createdAt));
    return rows;
  }),

  createCredential: authedProcedure
    .input(credentialInput)
    .mutation(async ({ ctx, input }) => {
      const { encryptedValue, iv, authTag } = encrypt(input.value);
      const hint = keyHint(input.value);

      const [cred] = await db
        .insert(agentCredentials)
        .values({
          userId: ctx.user.id,
          agentId: input.agentId ?? null,
          name: input.name,
          tool: input.tool,
          encryptedValue,
          iv,
          authTag,
          keyHint: hint,
        })
        .returning();

      return { id: cred.id, keyHint: hint };
    }),

  deleteCredential: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await db
        .delete(agentCredentials)
        .where(and(eq(agentCredentials.id, input.id), eq(agentCredentials.userId, ctx.user.id)))
        .returning({ id: agentCredentials.id });
      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Credential not found" });
      }
      return { success: true };
    }),

  // ── Trust Policies ─────────────────────────────────────────────────────────

  getPolicy: authedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, input.agentId), eq(agents.userId, ctx.user.id)))
        .limit(1);
      if (!agent) throw new TRPCError({ code: "FORBIDDEN", message: "Agent not found" });

      const [policy] = await db
        .select()
        .from(trustPolicies)
        .where(and(eq(trustPolicies.userId, ctx.user.id), eq(trustPolicies.agentId, input.agentId)))
        .limit(1);
      return policy ?? null;
    }),

  upsertPolicy: authedProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        allowedTools: z.array(z.string()).optional(),
        maxTokensPerDay: z.number().int().positive().optional(),
        maxRequestsPerMinute: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, input.agentId), eq(agents.userId, ctx.user.id)))
        .limit(1);
      if (!agent) throw new TRPCError({ code: "FORBIDDEN", message: "Agent not found" });

      const [existing] = await db
        .select({ id: trustPolicies.id })
        .from(trustPolicies)
        .where(and(eq(trustPolicies.userId, ctx.user.id), eq(trustPolicies.agentId, input.agentId)))
        .limit(1);

      const values = {
        userId: ctx.user.id,
        agentId: input.agentId,
        allowedTools: input.allowedTools ?? [],
        maxTokensPerDay: input.maxTokensPerDay ?? null,
        maxRequestsPerMinute: input.maxRequestsPerMinute ?? null,
        updatedAt: new Date(),
      };

      if (existing) {
        await db.update(trustPolicies).set(values).where(eq(trustPolicies.id, existing.id));
        return { id: existing.id };
      } else {
        const [policy] = await db.insert(trustPolicies).values(values).returning();
        return { id: policy.id };
      }
    }),

  deletePolicy: authedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, input.agentId), eq(agents.userId, ctx.user.id)))
        .limit(1);
      if (!agent) throw new TRPCError({ code: "FORBIDDEN", message: "Agent not found" });

      await db
        .delete(trustPolicies)
        .where(and(eq(trustPolicies.agentId, input.agentId), eq(trustPolicies.userId, ctx.user.id)));
      return { success: true };
    }),

  // ── Audit Log ──────────────────────────────────────────────────────────────

  auditLog: authedProcedure
    .input(z.object({ agentId: z.string().uuid().optional(), limit: z.number().int().max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      if (input.agentId) {
        const [agent] = await db
          .select({ id: agents.id })
          .from(agents)
          .where(and(eq(agents.id, input.agentId), eq(agents.userId, ctx.user.id)))
          .limit(1);
        if (!agent) throw new TRPCError({ code: "FORBIDDEN", message: "Agent not found" });
      }

      const where = input.agentId
        ? and(eq(credentialAuditLog.userId, ctx.user.id), eq(credentialAuditLog.agentId, input.agentId))
        : eq(credentialAuditLog.userId, ctx.user.id);

      return db
        .select()
        .from(credentialAuditLog)
        .where(where)
        .orderBy(desc(credentialAuditLog.createdAt))
        .limit(input.limit);
    }),
});

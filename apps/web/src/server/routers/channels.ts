import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { agents, channelAccounts, channelAuditLog, channelSenderPolicies } from "../db/schema";
import { encrypt, keyHint } from "../trust-engine";
import { CHANNEL_DM_POLICIES, CHANNEL_PROVIDERS } from "../channels/types";

const channelProviderSchema = z.enum(CHANNEL_PROVIDERS);
const channelDmPolicySchema = z.enum(CHANNEL_DM_POLICIES);

const toolListSchema = z.array(z.string().min(1)).default([]);

const channelAccountPublicSelection = {
  id: channelAccounts.id,
  userId: channelAccounts.userId,
  agentId: channelAccounts.agentId,
  provider: channelAccounts.provider,
  name: channelAccounts.name,
  externalTeamId: channelAccounts.externalTeamId,
  externalChannelId: channelAccounts.externalChannelId,
  verificationSecretHint: channelAccounts.verificationSecretHint,
  isEnabled: channelAccounts.isEnabled,
  allowedTools: channelAccounts.allowedTools,
  dmPolicy: channelAccounts.dmPolicy,
  createdAt: channelAccounts.createdAt,
  updatedAt: channelAccounts.updatedAt,
};

async function assertOwnedAgent(agentId: string, userId: string) {
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .limit(1);
  if (!agent) throw new Error("Agent not found");
}

async function assertOwnedChannelAccount(channelAccountId: string, userId: string) {
  const [account] = await db
    .select({ id: channelAccounts.id })
    .from(channelAccounts)
    .where(and(eq(channelAccounts.id, channelAccountId), eq(channelAccounts.userId, userId)))
    .limit(1);
  if (!account) throw new Error("Channel account not found");
}

export const channelsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return db
      .select(channelAccountPublicSelection)
      .from(channelAccounts)
      .where(eq(channelAccounts.userId, ctx.user.id))
      .orderBy(desc(channelAccounts.updatedAt));
  }),

  create: authedProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        provider: channelProviderSchema,
        name: z.string().min(1),
        verificationSecret: z.string().min(1),
        externalTeamId: z.string().optional().nullable(),
        externalChannelId: z.string().optional().nullable(),
        allowedTools: toolListSchema,
        dmPolicy: channelDmPolicySchema.default("paired-only"),
        isEnabled: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnedAgent(input.agentId, ctx.user.id);
      const encrypted = encrypt(input.verificationSecret);
      const [account] = await db
        .insert(channelAccounts)
        .values({
          userId: ctx.user.id,
          agentId: input.agentId,
          provider: input.provider,
          name: input.name,
          externalTeamId: input.externalTeamId ?? null,
          externalChannelId: input.externalChannelId ?? null,
          verificationSecretEncrypted: encrypted.encryptedValue,
          verificationSecretIv: encrypted.iv,
          verificationSecretAuthTag: encrypted.authTag,
          verificationSecretHint: keyHint(input.verificationSecret),
          isEnabled: input.isEnabled,
          allowedTools: input.allowedTools,
          dmPolicy: input.dmPolicy,
        })
        .returning(channelAccountPublicSelection);
      return account;
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        agentId: z.string().uuid().optional(),
        name: z.string().min(1).optional(),
        verificationSecret: z.string().min(1).optional(),
        externalTeamId: z.string().optional().nullable(),
        externalChannelId: z.string().optional().nullable(),
        allowedTools: z.array(z.string().min(1)).optional(),
        dmPolicy: channelDmPolicySchema.optional(),
        isEnabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnedChannelAccount(input.id, ctx.user.id);
      if (input.agentId) await assertOwnedAgent(input.agentId, ctx.user.id);

      const encrypted = input.verificationSecret ? encrypt(input.verificationSecret) : null;
      const [account] = await db
        .update(channelAccounts)
        .set({
          ...(input.agentId !== undefined && { agentId: input.agentId }),
          ...(input.name !== undefined && { name: input.name }),
          ...(input.externalTeamId !== undefined && { externalTeamId: input.externalTeamId }),
          ...(input.externalChannelId !== undefined && { externalChannelId: input.externalChannelId }),
          ...(input.allowedTools !== undefined && { allowedTools: input.allowedTools }),
          ...(input.dmPolicy !== undefined && { dmPolicy: input.dmPolicy }),
          ...(input.isEnabled !== undefined && { isEnabled: input.isEnabled }),
          ...(encrypted && {
            verificationSecretEncrypted: encrypted.encryptedValue,
            verificationSecretIv: encrypted.iv,
            verificationSecretAuthTag: encrypted.authTag,
            verificationSecretHint: keyHint(input.verificationSecret ?? ""),
          }),
          updatedAt: new Date(),
        })
        .where(and(eq(channelAccounts.id, input.id), eq(channelAccounts.userId, ctx.user.id)))
        .returning(channelAccountPublicSelection);
      return account;
    }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db
      .delete(channelAccounts)
      .where(and(eq(channelAccounts.id, input.id), eq(channelAccounts.userId, ctx.user.id)));
    return { success: true };
  }),

  setSenderPolicy: authedProcedure
    .input(
      z.object({
        channelAccountId: z.string().uuid(),
        externalSenderId: z.string().min(1),
        displayName: z.string().optional().nullable(),
        isPaired: z.boolean().default(false),
        allowedTools: toolListSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnedChannelAccount(input.channelAccountId, ctx.user.id);
      const [policy] = await db
        .insert(channelSenderPolicies)
        .values({
          channelAccountId: input.channelAccountId,
          externalSenderId: input.externalSenderId,
          displayName: input.displayName ?? null,
          isPaired: input.isPaired,
          allowedTools: input.allowedTools,
        })
        .onConflictDoUpdate({
          target: [channelSenderPolicies.channelAccountId, channelSenderPolicies.externalSenderId],
          set: {
            displayName: input.displayName ?? null,
            isPaired: input.isPaired,
            allowedTools: input.allowedTools,
            updatedAt: new Date(),
          },
        })
        .returning();
      return policy;
    }),

  auditLog: authedProcedure
    .input(
      z
        .object({ channelAccountId: z.string().uuid().optional(), limit: z.number().int().min(1).max(200).default(50) })
        .default({ limit: 50 }),
    )
    .query(async ({ ctx, input }) => {
      return db
        .select()
        .from(channelAuditLog)
        .where(
          input.channelAccountId
            ? and(eq(channelAuditLog.userId, ctx.user.id), eq(channelAuditLog.channelAccountId, input.channelAccountId))
            : eq(channelAuditLog.userId, ctx.user.id),
        )
        .orderBy(desc(channelAuditLog.createdAt))
        .limit(input.limit);
    }),
});

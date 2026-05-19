import { z } from "zod";
import { eq, desc, and, inArray } from "drizzle-orm";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { agents, agentGroups, groupMembers } from "../db/schema";

const routeStrategySchema = z.enum([
  "fixed",
  "local-first",
  "speed-first",
  "cost-first",
  "reasoning-first",
  "fallback-chain",
]);
const toolProfileSchema = z.enum(["minimal", "research", "coding", "messaging", "admin", "full"]);
const voiceProviderSchema = z.enum(["browser", "edge", "openai", "piper", "faster-whisper"]);

const agentInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  avatar: z.string().optional(),
  systemPrompt: z.string().min(1),
  model: z.string().optional(),
  routeStrategy: routeStrategySchema.optional(),
  fallbackModelIds: z.array(z.string()).optional(),
  voiceProvider: voiceProviderSchema.optional(),
  voiceId: z.string().optional(),
  voiceSpeed: z.number().min(0.25).max(4).optional(),
  sttProvider: voiceProviderSchema.optional(),
  handsFreeVoice: z.boolean().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
  tools: z.array(z.string()).optional(),
  toolProfile: toolProfileSchema.optional(),
  deniedTools: z.array(z.string()).optional(),
  memoryEnabled: z.boolean().optional(),
  knowledgeBaseId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  openingMessage: z.string().optional().nullable(),
  openingQuestions: z.array(z.string()).optional(),
});

const groupMemberInput = z.object({
  agentId: z.string().uuid(),
  role: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

const agentGroupInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  pattern: z.enum(["sequential", "parallel", "supervisor", "iterative", "debate", "groupchat"]).default("sequential"),
  members: z.array(groupMemberInput).default([]),
});

async function validateAgentIds(agentIds: string[]) {
  const uniqueIds = [...new Set(agentIds)];
  if (uniqueIds.length === 0) return;
  const found = await db.select({ id: agents.id }).from(agents).where(inArray(agents.id, uniqueIds));
  const foundIds = new Set(found.map((a) => a.id));
  const missing = uniqueIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) throw new Error(`Agent not found: ${missing.join(", ")}`);
}

async function getGroupWithMembers(id: string) {
  const [group] = await db.select().from(agentGroups).where(eq(agentGroups.id, id)).limit(1);
  if (!group) throw new Error("Agent group not found");
  const members = await db
    .select({
      groupId: groupMembers.groupId,
      agentId: groupMembers.agentId,
      role: groupMembers.role,
      sortOrder: groupMembers.sortOrder,
      agent: agents,
    })
    .from(groupMembers)
    .innerJoin(agents, eq(groupMembers.agentId, agents.id))
    .where(eq(groupMembers.groupId, id))
    .orderBy(groupMembers.sortOrder);
  return { ...group, members };
}

export const agentsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.select().from(agents).where(eq(agents.userId, ctx.user.id)).orderBy(desc(agents.updatedAt));
  }),

  get: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, input.id), eq(agents.userId, ctx.user.id)))
      .limit(1);
    if (!agent) throw new Error("Agent not found");
    return agent;
  }),

  create: authedProcedure.input(agentInput).mutation(async ({ ctx, input }) => {
    const [agent] = await db
      .insert(agents)
      .values({
        userId: ctx.user.id,
        name: input.name,
        description: input.description || null,
        avatar: input.avatar || null,
        systemPrompt: input.systemPrompt,
        model: input.model || "ollama:qwen2.5:7b",
        routeStrategy: input.routeStrategy ?? "fixed",
        fallbackModelIds: input.fallbackModelIds ?? [],
        voiceProvider: input.voiceProvider ?? "browser",
        voiceId: input.voiceId || "alloy",
        voiceSpeed: input.voiceSpeed ?? 1,
        sttProvider: input.sttProvider ?? "browser",
        handsFreeVoice: input.handsFreeVoice ?? false,
        temperature: input.temperature ?? 0.7,
        maxTokens: input.maxTokens ?? 4096,
        tools: JSON.stringify(input.tools || []),
        toolProfile: input.toolProfile ?? "full",
        deniedTools: input.deniedTools ?? [],
        memoryEnabled: input.memoryEnabled ?? true,
        knowledgeBaseId: input.knowledgeBaseId || null,
        tags: JSON.stringify(input.tags || []),
      })
      .returning();
    return agent;
  }),

  update: authedProcedure
    .input(agentInput.partial().extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, tools, tags, fallbackModelIds, deniedTools, ...updates } = input;
      await db
        .update(agents)
        .set({
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.description !== undefined && { description: updates.description || null }),
          ...(updates.avatar !== undefined && { avatar: updates.avatar || null }),
          ...(updates.systemPrompt !== undefined && { systemPrompt: updates.systemPrompt }),
          ...(updates.model !== undefined && { model: updates.model }),
          ...(updates.routeStrategy !== undefined && { routeStrategy: updates.routeStrategy }),
          ...(fallbackModelIds !== undefined && { fallbackModelIds: input.fallbackModelIds }),
          ...(updates.voiceProvider !== undefined && { voiceProvider: updates.voiceProvider }),
          ...(updates.voiceId !== undefined && { voiceId: updates.voiceId || "alloy" }),
          ...(updates.voiceSpeed !== undefined && { voiceSpeed: updates.voiceSpeed }),
          ...(updates.sttProvider !== undefined && { sttProvider: updates.sttProvider }),
          ...(updates.handsFreeVoice !== undefined && { handsFreeVoice: updates.handsFreeVoice }),
          ...(updates.temperature !== undefined && { temperature: updates.temperature }),
          ...(updates.maxTokens !== undefined && { maxTokens: updates.maxTokens }),
          ...(tools !== undefined && { tools: JSON.stringify(tools) }),
          ...(updates.toolProfile !== undefined && { toolProfile: updates.toolProfile }),
          ...(deniedTools !== undefined && { deniedTools: input.deniedTools }),
          ...(tags !== undefined && { tags: JSON.stringify(tags) }),
          ...(updates.memoryEnabled !== undefined && { memoryEnabled: updates.memoryEnabled }),
          ...(updates.knowledgeBaseId !== undefined && { knowledgeBaseId: updates.knowledgeBaseId }),
          updatedAt: new Date(),
        })
        .where(and(eq(agents.id, id), eq(agents.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db.delete(agents).where(and(eq(agents.id, input.id), eq(agents.userId, ctx.user.id)));
    return { success: true };
  }),
});

export const agentGroupsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const groups = await db
      .select()
      .from(agentGroups)
      .where(eq(agentGroups.userId, ctx.user.id))
      .orderBy(desc(agentGroups.updatedAt));
    const rows = await db
      .select({
        groupId: groupMembers.groupId,
        agentId: groupMembers.agentId,
        role: groupMembers.role,
        sortOrder: groupMembers.sortOrder,
      })
      .from(groupMembers)
      .orderBy(groupMembers.sortOrder);
    return groups.map((group) => ({ ...group, members: rows.filter((m) => m.groupId === group.id) }));
  }),

  get: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const group = await getGroupWithMembers(input.id);
    if (group.userId !== ctx.user.id) throw new Error("Not found");
    return group;
  }),

  create: authedProcedure.input(agentGroupInput).mutation(async ({ ctx, input }) => {
    await validateAgentIds(input.members.map((m) => m.agentId));
    const [group] = await db
      .insert(agentGroups)
      .values({
        userId: ctx.user.id,
        name: input.name,
        description: input.description || null,
        pattern: input.pattern,
      })
      .returning();
    if (input.members.length > 0) {
      await db.insert(groupMembers).values(
        input.members.map((member, index) => ({
          groupId: group.id,
          agentId: member.agentId,
          role: member.role || null,
          sortOrder: member.sortOrder ?? index,
        })),
      );
    }
    return { ...group, members: input.members };
  }),

  update: authedProcedure
    .input(agentGroupInput.partial().extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.members) await validateAgentIds(input.members.map((m) => m.agentId));
      const [existing] = await db
        .select()
        .from(agentGroups)
        .where(and(eq(agentGroups.id, input.id), eq(agentGroups.userId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new Error("Not found");
      await db
        .update(agentGroups)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description || null }),
          ...(input.pattern !== undefined && { pattern: input.pattern }),
          updatedAt: new Date(),
        })
        .where(eq(agentGroups.id, input.id));
      if (input.members) {
        await db.delete(groupMembers).where(eq(groupMembers.groupId, input.id));
        if (input.members.length > 0) {
          await db.insert(groupMembers).values(
            input.members.map((member, index) => ({
              groupId: input.id,
              agentId: member.agentId,
              role: member.role || null,
              sortOrder: member.sortOrder ?? index,
            })),
          );
        }
      }
      return { success: true };
    }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db.delete(agentGroups).where(and(eq(agentGroups.id, input.id), eq(agentGroups.userId, ctx.user.id)));
    return { success: true };
  }),
});

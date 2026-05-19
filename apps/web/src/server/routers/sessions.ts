import { z } from "zod";
import { eq, desc, and, ilike, gt, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { checkProviderPlanAccess, providerRegistry, type ProviderRegistry } from "@agenthub/ai-providers";
import { router, authedProcedure, publicProcedure } from "../trpc";
import { db } from "../db";
import { chatSessions, messages, agents, agentGroups, providerCredentials } from "../db/schema";
import { decryptProviderCredentials } from "../provider-credentials";
import { ensureUserQuota } from "../quotas";
import { validateProviderBaseUrl } from "../security/outbound";
import { generateLlmSessionTitle, isDefaultSessionTitle } from "../session-title";

type ChatSessionRow = typeof chatSessions.$inferSelect;

type SessionBranchMetadata = {
  branchMode?: unknown;
  parentSessionId?: unknown;
  forkedFromMessageId?: unknown;
};

type BranchTreeNode = {
  id: string;
  title: string | null;
  parentSessionId: string | null;
  parentMessageId: string | null;
  branchMode: "root" | "continuation" | "standalone";
  forkedFromMessageId: string | null;
  createdAt: string;
  children: BranchTreeNode[];
};

function getBranchMetadata(metadata: unknown): SessionBranchMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return metadata as SessionBranchMetadata;
}

function metadataString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function branchModeFromMetadata(metadata: unknown): BranchTreeNode["branchMode"] {
  const branchMode = getBranchMetadata(metadata).branchMode;
  return branchMode === "standalone" || branchMode === "continuation" ? branchMode : "root";
}

function parentSessionIdFor(session: ChatSessionRow): string | null {
  return metadataString(getBranchMetadata(session.metadata).parentSessionId);
}

function forkedFromMessageIdFor(session: ChatSessionRow): string | null {
  return metadataString(getBranchMetadata(session.metadata).forkedFromMessageId);
}

async function registryForTitleGeneration(userId: string): Promise<ProviderRegistry> {
  const encryptedUserCreds = await db
    .select()
    .from(providerCredentials)
    .where(and(eq(providerCredentials.userId, userId), eq(providerCredentials.isEnabled, true)));
  const quota = await ensureUserQuota(userId);
  const userCreds = decryptProviderCredentials(encryptedUserCreds).filter(
    (credential) => checkProviderPlanAccess(credential.providerId, quota.plan).allowed,
  );
  if (userCreds.length === 0) return providerRegistry;
  return providerRegistry.forUser(
    userCreds.map((credential) => ({
      providerId: credential.providerId,
      authType: credential.authType as "api_key" | "oauth",
      apiKey: credential.apiKey || undefined,
      baseUrl: credential.baseUrl ? validateProviderBaseUrl(credential.baseUrl, credential.baseUrl) : undefined,
      accessToken: credential.accessToken || undefined,
      expiresAt: credential.expiresAt,
    })),
  );
}

export const sessionsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.userId, ctx.user.id))
      .orderBy(desc(chatSessions.updatedAt));
  }),

  create: authedProcedure
    .input(
      z.object({
        title: z.string().optional(),
        model: z.string().optional(),
        agentId: z.string().uuid().optional(),
        groupId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let agent, group;
      if (input.agentId) {
        [agent] = await db
          .select()
          .from(agents)
          .where(and(eq(agents.id, input.agentId), eq(agents.userId, ctx.user.id)))
          .limit(1);
      }
      if (input.groupId) {
        [group] = await db
          .select()
          .from(agentGroups)
          .where(and(eq(agentGroups.id, input.groupId), eq(agentGroups.userId, ctx.user.id)))
          .limit(1);
      }
      const [session] = await db
        .insert(chatSessions)
        .values({
          userId: ctx.user.id,
          agentId: agent?.id || null,
          groupId: group?.id || null,
          title: input.title || group?.name || agent?.name || "New Chat",
          model: input.model || agent?.model || "ollama:qwen2.5:7b",
        })
        .returning();
      return session;
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().optional(),
        model: z.string().optional(),
        agentId: z.string().uuid().nullable().optional(),
        groupId: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      await db
        .update(chatSessions)
        .set({
          ...(updates.title && { title: updates.title }),
          ...(updates.model && { model: updates.model }),
          ...(updates.agentId !== undefined && { agentId: updates.agentId }),
          ...(updates.groupId !== undefined && { groupId: updates.groupId }),
          updatedAt: new Date(),
        })
        .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, ctx.user.id)));
      return { success: true };
    }),

  generateTitle: authedProcedure
    .input(z.object({ id: z.string().uuid(), force: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, input.id), eq(chatSessions.userId, ctx.user.id)))
        .limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (!input.force && !isDefaultSessionTitle(session.title)) {
        return { title: session.title || "New Chat", source: "existing" as const, updated: false };
      }

      const rows = await db
        .select({ role: messages.role, content: messages.content })
        .from(messages)
        .where(eq(messages.sessionId, input.id))
        .orderBy(messages.createdAt)
        .limit(8);
      const registry = await registryForTitleGeneration(ctx.user.id);
      const generated = await generateLlmSessionTitle({
        registry,
        modelId: session.model,
        messages: rows,
      });

      const titleGuard = input.force
        ? undefined
        : session.title
          ? eq(chatSessions.title, session.title)
          : sql`${chatSessions.title} is null`;
      const [updated] = await db
        .update(chatSessions)
        .set({ title: generated.title, updatedAt: new Date() })
        .where(
          and(eq(chatSessions.id, input.id), eq(chatSessions.userId, ctx.user.id), ...(titleGuard ? [titleGuard] : [])),
        )
        .returning({ title: chatSessions.title });

      return {
        title: updated?.title ?? session.title ?? generated.title,
        source: updated ? generated.source : ("stale" as const),
        updated: Boolean(updated),
      };
    }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db.delete(chatSessions).where(and(eq(chatSessions.id, input.id), eq(chatSessions.userId, ctx.user.id)));
    return { success: true };
  }),

  pin: authedProcedure
    .input(z.object({ id: z.string().uuid(), isPinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, input.id), eq(chatSessions.userId, ctx.user.id)))
        .limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      await db
        .update(chatSessions)
        .set({ isPinned: input.isPinned, updatedAt: new Date() })
        .where(eq(chatSessions.id, input.id));
      return { success: true };
    }),

  listBranches: authedProcedure
    .input(z.object({ parentMessageId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.userId, ctx.user.id), eq(chatSessions.parentMessageId, input.parentMessageId)))
        .orderBy(chatSessions.createdAt);
    }),

  branchTree: authedProcedure.input(z.object({ sessionId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [activeSession] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, input.sessionId), eq(chatSessions.userId, ctx.user.id)))
      .limit(1);
    if (!activeSession) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

    const userSessions = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.userId, ctx.user.id))
      .orderBy(chatSessions.createdAt);
    const sessionsById = new Map(userSessions.map((session) => [session.id, session]));

    let rootSession = activeSession;
    const seenAncestors = new Set<string>();
    while (!seenAncestors.has(rootSession.id)) {
      seenAncestors.add(rootSession.id);
      const parentSessionId = parentSessionIdFor(rootSession);
      if (!parentSessionId) break;
      const parentSession = sessionsById.get(parentSessionId);
      if (!parentSession) break;
      rootSession = parentSession;
    }

    const treeSessionIds = new Set<string>([rootSession.id]);
    let added = true;
    while (added) {
      added = false;
      for (const session of userSessions) {
        if (treeSessionIds.has(session.id)) continue;
        const parentSessionId = parentSessionIdFor(session);
        if (parentSessionId && treeSessionIds.has(parentSessionId)) {
          treeSessionIds.add(session.id);
          added = true;
        }
      }
    }

    const treeSessions = userSessions.filter((session) => treeSessionIds.has(session.id));
    const nodesById = new Map<string, BranchTreeNode>();
    for (const session of treeSessions) {
      nodesById.set(session.id, {
        id: session.id,
        title: session.title,
        parentSessionId: parentSessionIdFor(session),
        parentMessageId: session.parentMessageId,
        branchMode: session.id === rootSession.id ? "root" : branchModeFromMetadata(session.metadata),
        forkedFromMessageId: forkedFromMessageIdFor(session),
        createdAt: session.createdAt.toISOString(),
        children: [],
      });
    }

    for (const node of nodesById.values()) {
      if (!node.parentSessionId) continue;
      const parent = nodesById.get(node.parentSessionId);
      parent?.children.push(node);
    }

    const sortNodes = (nodes: BranchTreeNode[]) => {
      nodes.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      for (const node of nodes) sortNodes(node.children);
    };

    const rootNode = nodesById.get(rootSession.id);
    if (!rootNode) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Branch tree root missing" });
    sortNodes(rootNode.children);

    return {
      rootSessionId: rootSession.id,
      activeSessionId: activeSession.id,
      nodeCount: nodesById.size,
      tree: rootNode,
    };
  }),

  fork: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        messageId: z.string().uuid(),
        mode: z.enum(["continuation", "standalone"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const branchMode = input.mode ?? "continuation";
      const [session] = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, input.id), eq(chatSessions.userId, ctx.user.id)))
        .limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      const [forkPoint] = await db
        .select()
        .from(messages)
        .where(and(eq(messages.id, input.messageId), eq(messages.sessionId, input.id)))
        .limit(1);
      if (!forkPoint) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found in this session" });

      const [newSession] = await db
        .insert(chatSessions)
        .values({
          userId: ctx.user.id,
          agentId: session.agentId,
          groupId: session.groupId,
          parentMessageId: input.messageId,
          title: `${session.title} (${branchMode === "standalone" ? "standalone branch" : "branch"})`,
          model: session.model,
          metadata: { branchMode, parentSessionId: session.id, forkedFromMessageId: input.messageId },
        })
        .returning();

      const msgsToCopy = await db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, input.id))
        .orderBy(messages.createdAt);
      const forkIndex = msgsToCopy.findIndex((m) => m.id === input.messageId);
      const continuationMessages = forkIndex >= 0 ? msgsToCopy.slice(0, forkIndex + 1) : [];
      const messagesToCopy = branchMode === "standalone" ? [forkPoint] : continuationMessages;

      for (const msg of messagesToCopy) {
        await db.insert(messages).values({
          sessionId: newSession.id,
          role: msg.role,
          content: msg.content,
          reasoning: msg.reasoning,
          model: msg.model,
          toolCalls: msg.toolCalls,
          artifacts: msg.artifacts,
          metadata: msg.metadata,
          tokensUsed: msg.tokensUsed,
          latencyMs: msg.latencyMs,
          feedback: msg.feedback,
          parentId: branchMode === "standalone" ? null : msg.parentId,
        });
      }
      return newSession;
    }),

  publish: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const slug = nanoid(10);
    const [updated] = await db
      .update(chatSessions)
      .set({ isPublic: true, publicSlug: slug, updatedAt: new Date() })
      .where(and(eq(chatSessions.id, input.id), eq(chatSessions.userId, ctx.user.id)))
      .returning();
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
    return { slug };
  }),

  unpublish: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db
      .update(chatSessions)
      .set({ isPublic: false, publicSlug: null, updatedAt: new Date() })
      .where(and(eq(chatSessions.id, input.id), eq(chatSessions.userId, ctx.user.id)));
  }),

  getPublic: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ input }) => {
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.publicSlug, input.slug), eq(chatSessions.isPublic, true)))
      .limit(1);
    if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
    const msgs = await db.select().from(messages).where(eq(messages.sessionId, session.id)).orderBy(messages.createdAt);
    return { session, messages: msgs };
  }),
});

export const messagesRouter = router({
  list: authedProcedure.input(z.object({ sessionId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, input.sessionId), eq(chatSessions.userId, ctx.user.id)))
      .limit(1);
    if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
    return db.select().from(messages).where(eq(messages.sessionId, input.sessionId)).orderBy(messages.createdAt);
  }),

  create: authedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        sessionId: z.string().uuid(),
        role: z.enum(["user", "assistant", "system", "tool"]),
        content: z.string(),
        parentId: z.string().uuid().optional(),
        reasoning: z.string().optional(),
        model: z.string().optional(),
        toolCalls: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [session] = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, input.sessionId), eq(chatSessions.userId, ctx.user.id)))
        .limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const id = input.id || crypto.randomUUID();
      const [message] = await db
        .insert(messages)
        .values({
          id,
          sessionId: input.sessionId,
          parentId: input.parentId || null,
          role: input.role,
          content: input.content,
          reasoning: input.reasoning || null,
          model: input.model || null,
          toolCalls: input.toolCalls || null,
          metadata: input.metadata ?? null,
        })
        .returning();
      await db.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, input.sessionId));
      return message;
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        content: z.string().optional(),
        reasoning: z.string().optional(),
        model: z.string().optional(),
        toolCalls: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [msg] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
      if (!msg) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
      const [session] = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, msg.sessionId), eq(chatSessions.userId, ctx.user.id)))
        .limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      await db
        .update(messages)
        .set({
          ...(updates.content !== undefined && { content: updates.content }),
          ...(updates.reasoning !== undefined && { reasoning: updates.reasoning }),
          ...(updates.model !== undefined && { model: updates.model }),
          ...(updates.toolCalls !== undefined && { toolCalls: updates.toolCalls }),
        })
        .where(eq(messages.id, id));
      return { success: true };
    }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [msg] = await db.select().from(messages).where(eq(messages.id, input.id)).limit(1);
    if (!msg) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, msg.sessionId), eq(chatSessions.userId, ctx.user.id)))
      .limit(1);
    if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
    await db.delete(messages).where(eq(messages.id, input.id));
    return { success: true };
  }),

  deleteAfter: authedProcedure
    .input(z.object({ sessionId: z.string().uuid(), messageId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, input.sessionId), eq(chatSessions.userId, ctx.user.id)))
        .limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const [target] = await db
        .select({ id: messages.id, createdAt: messages.createdAt })
        .from(messages)
        .where(and(eq(messages.id, input.messageId), eq(messages.sessionId, input.sessionId)))
        .limit(1);
      if (target) {
        await db
          .delete(messages)
          .where(and(eq(messages.sessionId, input.sessionId), gt(messages.createdAt, target.createdAt)));
      }
      return { success: true };
    }),

  search: authedProcedure
    .input(z.object({ query: z.string().trim().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      const pattern = `%${input.query}%`;
      const searchVector = sql`
      setweight(to_tsvector('english', coalesce(${chatSessions.title}, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(${messages.content}, '')), 'B')
    `;
      const searchQuery = sql`websearch_to_tsquery('english', ${input.query})`;
      const searchRank = sql<number>`ts_rank_cd(${searchVector}, ${searchQuery}, 32)`;
      return db
        .select({
          messageId: messages.id,
          sessionId: messages.sessionId,
          sessionTitle: chatSessions.title,
          content: messages.content,
          createdAt: messages.createdAt,
          role: messages.role,
          rank: searchRank.as("rank"),
        })
        .from(messages)
        .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
        .where(
          and(
            eq(chatSessions.userId, ctx.user.id),
            or(
              sql`${searchVector} @@ ${searchQuery}`,
              ilike(messages.content, pattern),
              ilike(chatSessions.title, pattern),
            ),
          ),
        )
        .orderBy(desc(searchRank), desc(messages.createdAt))
        .limit(30);
    }),

  setFeedback: authedProcedure
    .input(z.object({ id: z.string().uuid(), feedback: z.enum(["up", "down"]).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const [msg] = await db.select().from(messages).where(eq(messages.id, input.id)).limit(1);
      if (!msg) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
      const [session] = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, msg.sessionId), eq(chatSessions.userId, ctx.user.id)))
        .limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      await db.update(messages).set({ feedback: input.feedback }).where(eq(messages.id, input.id));
      return { success: true };
    }),
});

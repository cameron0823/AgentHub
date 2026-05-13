import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { router, authedProcedure, publicProcedure } from "../trpc";
import { db } from "../db";
import { chatSessions, messages, agents, agentGroups } from "../db/schema";

export const sessionsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.select().from(chatSessions)
      .where(eq(chatSessions.userId, ctx.user.id))
      .orderBy(desc(chatSessions.updatedAt));
  }),

  create: authedProcedure
    .input(z.object({
      title: z.string().optional(),
      model: z.string().optional(),
      agentId: z.string().uuid().optional(),
      groupId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let agent, group;
      if (input.agentId) {
        [agent] = await db.select().from(agents)
          .where(and(eq(agents.id, input.agentId), eq(agents.userId, ctx.user.id))).limit(1);
      }
      if (input.groupId) {
        [group] = await db.select().from(agentGroups)
          .where(and(eq(agentGroups.id, input.groupId), eq(agentGroups.userId, ctx.user.id))).limit(1);
      }
      const [session] = await db.insert(chatSessions).values({
        userId: ctx.user.id,
        agentId: agent?.id || null,
        groupId: group?.id || null,
        title: input.title || group?.name || agent?.name || "New Chat",
        model: input.model || agent?.model || "ollama:qwen2.5:7b",
      }).returning();
      return session;
    }),

  update: authedProcedure
    .input(z.object({ id: z.string().uuid(), title: z.string().optional(), model: z.string().optional(), agentId: z.string().uuid().nullable().optional(), groupId: z.string().uuid().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      await db.update(chatSessions).set({
        ...(updates.title && { title: updates.title }),
        ...(updates.model && { model: updates.model }),
        ...(updates.agentId !== undefined && { agentId: updates.agentId }),
        ...(updates.groupId !== undefined && { groupId: updates.groupId }),
        updatedAt: new Date(),
      }).where(and(eq(chatSessions.id, id), eq(chatSessions.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(chatSessions).where(and(eq(chatSessions.id, input.id), eq(chatSessions.userId, ctx.user.id)));
      return { success: true };
    }),

  listBranches: authedProcedure
    .input(z.object({ parentMessageId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return db.select().from(chatSessions)
        .where(and(
          eq(chatSessions.userId, ctx.user.id),
          eq(chatSessions.parentMessageId, input.parentMessageId),
        ))
        .orderBy(chatSessions.createdAt);
    }),

  fork: authedProcedure
    .input(z.object({ id: z.string().uuid(), messageId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await db.select().from(chatSessions)
        .where(and(eq(chatSessions.id, input.id), eq(chatSessions.userId, ctx.user.id))).limit(1);
      if (!session) throw new Error("Session not found");

      const [forkPoint] = await db.select().from(messages).where(eq(messages.id, input.messageId)).limit(1);
      if (!forkPoint) throw new Error("Message not found");

      const [newSession] = await db.insert(chatSessions).values({
        userId: ctx.user.id,
        agentId: session.agentId,
        groupId: session.groupId,
        parentMessageId: input.messageId,
        title: `${session.title} (branch)`,
        model: session.model,
      }).returning();

      const msgsToCopy = await db.select().from(messages)
        .where(eq(messages.sessionId, input.id)).orderBy(messages.createdAt);
      const forkIndex = msgsToCopy.findIndex((m) => m.id === input.messageId);
      const messagesToCopy = forkIndex >= 0 ? msgsToCopy.slice(0, forkIndex + 1) : msgsToCopy;

      for (const msg of messagesToCopy) {
        await db.insert(messages).values({
          sessionId: newSession.id,
          role: msg.role,
          content: msg.content,
          reasoning: msg.reasoning,
          model: msg.model,
          toolCalls: msg.toolCalls,
          parentId: msg.parentId,
        });
      }
      return newSession;
    }),

  publish: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const slug = nanoid(10);
      const [updated] = await db.update(chatSessions)
        .set({ isPublic: true, publicSlug: slug, updatedAt: new Date() })
        .where(and(eq(chatSessions.id, input.id), eq(chatSessions.userId, ctx.user.id)))
        .returning();
      if (!updated) throw new Error("Session not found");
      return { slug };
    }),

  unpublish: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(chatSessions)
        .set({ isPublic: false, publicSlug: null, updatedAt: new Date() })
        .where(and(eq(chatSessions.id, input.id), eq(chatSessions.userId, ctx.user.id)));
    }),

  getPublic: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const [session] = await db.select().from(chatSessions)
        .where(and(eq(chatSessions.publicSlug, input.slug), eq(chatSessions.isPublic, true))).limit(1);
      if (!session) throw new Error("Not found");
      const msgs = await db.select().from(messages)
        .where(eq(messages.sessionId, session.id)).orderBy(messages.createdAt);
      return { session, messages: msgs };
    }),
});

export const messagesRouter = router({
  list: authedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [session] = await db.select().from(chatSessions)
        .where(and(eq(chatSessions.id, input.sessionId), eq(chatSessions.userId, ctx.user.id))).limit(1);
      if (!session) throw new Error("Session not found");
      return db.select().from(messages).where(eq(messages.sessionId, input.sessionId)).orderBy(messages.createdAt);
    }),

  create: authedProcedure
    .input(z.object({
      id: z.string().uuid().optional(),
      sessionId: z.string().uuid(),
      role: z.enum(["user", "assistant", "system", "tool"]),
      content: z.string(),
      parentId: z.string().uuid().optional(),
      reasoning: z.string().optional(),
      model: z.string().optional(),
      toolCalls: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await db.select().from(chatSessions)
        .where(and(eq(chatSessions.id, input.sessionId), eq(chatSessions.userId, ctx.user.id))).limit(1);
      if (!session) throw new Error("Session not found");
      const id = input.id || crypto.randomUUID();
      const [message] = await db.insert(messages).values({
        id,
        sessionId: input.sessionId,
        parentId: input.parentId || null,
        role: input.role,
        content: input.content,
        reasoning: input.reasoning || null,
        model: input.model || null,
        toolCalls: input.toolCalls || null,
      }).returning();
      await db.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, input.sessionId));
      return message;
    }),

  update: authedProcedure
    .input(z.object({
      id: z.string().uuid(),
      content: z.string().optional(),
      reasoning: z.string().optional(),
      model: z.string().optional(),
      toolCalls: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [msg] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
      if (!msg) throw new Error("Message not found");
      const [session] = await db.select().from(chatSessions)
        .where(and(eq(chatSessions.id, msg.sessionId), eq(chatSessions.userId, ctx.user.id))).limit(1);
      if (!session) throw new Error("Session not found");
      await db.update(messages).set({
        ...(updates.content !== undefined && { content: updates.content }),
        ...(updates.reasoning !== undefined && { reasoning: updates.reasoning }),
        ...(updates.model !== undefined && { model: updates.model }),
        ...(updates.toolCalls !== undefined && { toolCalls: updates.toolCalls }),
      }).where(eq(messages.id, id));
      return { success: true };
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [msg] = await db.select().from(messages).where(eq(messages.id, input.id)).limit(1);
      if (!msg) throw new Error("Message not found");
      const [session] = await db.select().from(chatSessions)
        .where(and(eq(chatSessions.id, msg.sessionId), eq(chatSessions.userId, ctx.user.id))).limit(1);
      if (!session) throw new Error("Session not found");
      await db.delete(messages).where(eq(messages.id, input.id));
      return { success: true };
    }),

  deleteAfter: authedProcedure
    .input(z.object({ sessionId: z.string().uuid(), messageId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await db.select().from(chatSessions)
        .where(and(eq(chatSessions.id, input.sessionId), eq(chatSessions.userId, ctx.user.id))).limit(1);
      if (!session) throw new Error("Session not found");
      const msgs = await db.select().from(messages)
        .where(eq(messages.sessionId, input.sessionId)).orderBy(messages.createdAt);
      const idx = msgs.findIndex((m) => m.id === input.messageId);
      if (idx >= 0) {
        for (const m of msgs.slice(idx + 1)) {
          await db.delete(messages).where(eq(messages.id, m.id));
        }
      }
      return { success: true };
    }),

  search: authedProcedure
    .input(z.object({ q: z.string().min(1), limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      return db.select({
        id: messages.id,
        sessionId: messages.sessionId,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
        similarity: sql<number>` similarity(${messages.content}, ${input.q}) `,
      })
        .from(messages)
        .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
        .where(and(eq(chatSessions.userId, ctx.user.id), sql`${messages.content} % ${input.q}`))
        .orderBy(sql` similarity(${messages.content}, ${input.q}) DESC `)
        .limit(input.limit);
    }),
});

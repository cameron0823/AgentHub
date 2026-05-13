import { z } from "zod";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { chatSessions, messages, agents } from "../db/schema";

export const analyticsRouter = router({
  summary: authedProcedure.query(async ({ ctx }) => {
    const [sessionCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chatSessions)
      .where(eq(chatSessions.userId, ctx.user.id));

    const [messageCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
      .where(eq(chatSessions.userId, ctx.user.id));

    const [tokenSum] = await db
      .select({ total: sql<number>`coalesce(sum(tokens_used), 0)::int` })
      .from(messages)
      .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
      .where(eq(chatSessions.userId, ctx.user.id));

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [weekTokens] = await db
      .select({ total: sql<number>`coalesce(sum(tokens_used), 0)::int` })
      .from(messages)
      .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
      .where(and(eq(chatSessions.userId, ctx.user.id), gte(messages.createdAt, weekAgo)));

    const agentUsage = await db
      .select({
        agentId: chatSessions.agentId,
        count: sql<number>`count(*)::int`,
      })
      .from(chatSessions)
      .where(and(eq(chatSessions.userId, ctx.user.id)))
      .groupBy(chatSessions.agentId)
      .orderBy(desc(sql`count(*)`))
      .limit(1);

    let favoriteAgentName: string | null = null;
    if (agentUsage[0]?.agentId) {
      const [a] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, agentUsage[0].agentId)).limit(1);
      favoriteAgentName = a?.name ?? null;
    }

    return {
      totalSessions: sessionCount?.count ?? 0,
      totalMessages: messageCount?.count ?? 0,
      totalTokens: tokenSum?.total ?? 0,
      weekTokens: weekTokens?.total ?? 0,
      favoriteAgent: favoriteAgentName,
    };
  }),

  messagesPerDay: authedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      return db
        .select({
          day: sql<string>`date_trunc('day', ${messages.createdAt})::date::text`,
          count: sql<number>`count(*)::int`,
        })
        .from(messages)
        .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
        .where(and(eq(chatSessions.userId, ctx.user.id), gte(messages.createdAt, since)))
        .groupBy(sql`date_trunc('day', ${messages.createdAt})`)
        .orderBy(sql`date_trunc('day', ${messages.createdAt})`);
    }),

  tokensByAgent: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        agentId: chatSessions.agentId,
        tokens: sql<number>`coalesce(sum(${messages.tokensUsed}), 0)::int`,
      })
      .from(messages)
      .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
      .where(eq(chatSessions.userId, ctx.user.id))
      .groupBy(chatSessions.agentId);

    const agentIds = rows.map((r) => r.agentId).filter(Boolean) as string[];
    const agentNames: Record<string, string> = {};
    if (agentIds.length > 0) {
      const agentRows = await db.select({ id: agents.id, name: agents.name }).from(agents);
      for (const a of agentRows) agentNames[a.id] = a.name;
    }

    return rows.map((r) => ({
      name: r.agentId ? (agentNames[r.agentId] ?? "Unknown Agent") : "No Agent",
      tokens: r.tokens,
    }));
  }),

  roleDistribution: authedProcedure.query(async ({ ctx }) => {
    return db
      .select({
        role: messages.role,
        count: sql<number>`count(*)::int`,
      })
      .from(messages)
      .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
      .where(eq(chatSessions.userId, ctx.user.id))
      .groupBy(messages.role);
  }),

  tokensPerDay: authedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      return db
        .select({
          day: sql<string>`date_trunc('day', ${messages.createdAt})::date::text`,
          tokens: sql<number>`coalesce(sum(${messages.tokensUsed}), 0)::int`,
        })
        .from(messages)
        .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
        .where(and(eq(chatSessions.userId, ctx.user.id), gte(messages.createdAt, since)))
        .groupBy(sql`date_trunc('day', ${messages.createdAt})`)
        .orderBy(sql`date_trunc('day', ${messages.createdAt})`);
    }),

  latencyPerDay: authedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      return db
        .select({
          day: sql<string>`date_trunc('day', ${messages.createdAt})::date::text`,
          avgLatency: sql<number>`coalesce(avg(${messages.latencyMs}) filter (where ${messages.latencyMs} is not null), 0)::int`,
        })
        .from(messages)
        .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
        .where(and(eq(chatSessions.userId, ctx.user.id), gte(messages.createdAt, since)))
        .groupBy(sql`date_trunc('day', ${messages.createdAt})`)
        .orderBy(sql`date_trunc('day', ${messages.createdAt})`);
    }),
});

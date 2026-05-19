import { z } from "zod";
import { adminProcedure, router } from "../trpc";
import { db } from "../db";
import { users, agents, chatSessions, messages, agentTasks, graphThreadStates } from "../db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { getQueueMetrics } from "../queues";
import { deadLetterQueue } from "../queues/dead-letter";
import { graphResumeRegistry } from "../graph";

const usersRouter = router({
  list: adminProcedure.query(() =>
    db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
      .from(users)
      .orderBy(users.createdAt),
  ),
  setRole: adminProcedure
    .input(z.object({ userId: z.string().uuid(), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ input }) => {
      await db.update(users).set({ role: input.role, updatedAt: new Date() }).where(eq(users.id, input.userId));
      return { ok: true };
    }),
});

const statsRouter = router({
  overview: adminProcedure.query(async () => {
    const [[u], [a], [s], [m], [t]] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(agents),
      db.select({ count: sql<number>`count(*)::int` }).from(chatSessions),
      db.select({ count: sql<number>`count(*)::int` }).from(messages),
      db.select({ count: sql<number>`count(*)::int` }).from(agentTasks),
    ]);
    return {
      users: u?.count ?? 0,
      agents: a?.count ?? 0,
      sessions: s?.count ?? 0,
      messages: m?.count ?? 0,
      tasks: t?.count ?? 0,
    };
  }),
  queues: adminProcedure.query(async () => {
    const deadLetters = await deadLetterQueue.list();
    try {
      const queues = await getQueueMetrics();
      return {
        available: true,
        queues,
        deadLetters,
      };
    } catch {
      return {
        available: false,
        queues: [],
        deadLetters,
      };
    }
  }),
  graphThreads: adminProcedure.query(async () => {
    return db
      .select({
        threadId: graphThreadStates.threadId,
        graphId: graphThreadStates.graphId,
        paused: graphThreadStates.paused,
        pauseReason: graphThreadStates.pauseReason,
        latestCheckpointId: graphThreadStates.latestCheckpointId,
        updatedAt: graphThreadStates.updatedAt,
      })
      .from(graphThreadStates)
      .where(eq(graphThreadStates.paused, true))
      .orderBy(desc(graphThreadStates.updatedAt))
      .limit(25);
  }),
  resumeGraphThread: adminProcedure
    .input(z.object({ threadId: z.string().min(1), resumeInput: z.unknown().optional() }))
    .mutation(async ({ input }) => {
      const replayResult = await graphResumeRegistry.resumeThread(input.threadId, input.resumeInput);
      if (replayResult) {
        return { ok: true, replayed: true, result: replayResult };
      }

      await db
        .update(graphThreadStates)
        .set({
          paused: false,
          pauseReason: null,
          updatedAt: new Date(),
        })
        .where(eq(graphThreadStates.threadId, input.threadId));
      return { ok: true, replayed: false };
    }),
});

export const adminRouter = router({
  users: usersRouter,
  stats: statsRouter,
});

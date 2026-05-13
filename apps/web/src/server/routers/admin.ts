import { z } from "zod";
import { adminProcedure, router } from "../trpc";
import { db } from "../db";
import { users, agents, chatSessions, messages, agentTasks } from "../db/schema";
import { eq, sql } from "drizzle-orm";

const usersRouter = router({
  list: adminProcedure.query(() =>
    db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
      .from(users)
      .orderBy(users.createdAt)
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
});

export const adminRouter = router({
  users: usersRouter,
  stats: statsRouter,
});

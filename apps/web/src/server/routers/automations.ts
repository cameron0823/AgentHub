import { z } from "zod";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { automations, automationRuns, agents } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

export const automationsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id: automations.id,
        name: automations.name,
        prompt: automations.prompt,
        cronExpression: automations.cronExpression,
        isActive: automations.isActive,
        lastRunAt: automations.lastRunAt,
        agentId: automations.agentId,
        agentName: agents.name,
        webhookUrl: automations.webhookUrl,
        createdAt: automations.createdAt,
      })
      .from(automations)
      .leftJoin(agents, eq(automations.agentId, agents.id))
      .where(eq(automations.userId, ctx.user.id))
      .orderBy(desc(automations.createdAt));

    const result = await Promise.all(
      rows.map(async (row) => {
        const [lastRun] = await db
          .select({ status: automationRuns.status, completedAt: automationRuns.completedAt })
          .from(automationRuns)
          .where(eq(automationRuns.automationId, row.id))
          .orderBy(desc(automationRuns.startedAt))
          .limit(1);
        return { ...row, lastRunStatus: lastRun?.status ?? null };
      })
    );

    return result;
  }),

  create: authedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        prompt: z.string().min(1),
        cronExpression: z.string().min(1),
        agentId: z.string().uuid().optional(),
        webhookUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(automations)
        .values({
          userId: ctx.user.id,
          name: input.name,
          prompt: input.prompt,
          cronExpression: input.cronExpression,
          agentId: input.agentId ?? null,
          webhookUrl: input.webhookUrl ?? null,
        })
        .returning();
      return row;
    }),

  toggle: authedProcedure
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(automations)
        .set({ isActive: input.isActive })
        .where(and(eq(automations.id, input.id), eq(automations.userId, ctx.user.id)));
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(automations)
        .where(and(eq(automations.id, input.id), eq(automations.userId, ctx.user.id)));
    }),

  runs: authedProcedure
    .input(z.object({ automationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [auto] = await db
        .select({ id: automations.id })
        .from(automations)
        .where(and(eq(automations.id, input.automationId), eq(automations.userId, ctx.user.id)))
        .limit(1);
      if (!auto) throw new Error("Not found");

      return db
        .select()
        .from(automationRuns)
        .where(eq(automationRuns.automationId, input.automationId))
        .orderBy(desc(automationRuns.startedAt))
        .limit(20);
    }),

  triggerNow: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [auto] = await db
        .select()
        .from(automations)
        .where(and(eq(automations.id, input.id), eq(automations.userId, ctx.user.id)))
        .limit(1);
      if (!auto) throw new Error("Not found");

      const [run] = await db
        .insert(automationRuns)
        .values({ automationId: auto.id, status: "pending", startedAt: new Date() })
        .returning();

      try {
        const { automationQueue } = await import("../workers/automationWorker");
        await automationQueue.add("run", { automationId: auto.id, runId: run.id });
      } catch {
        await db
          .update(automationRuns)
          .set({ status: "error", error: "Queue unavailable", completedAt: new Date() })
          .where(eq(automationRuns.id, run.id));
      }

      return run;
    }),
});

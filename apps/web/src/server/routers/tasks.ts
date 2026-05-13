import { z } from "zod";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { agentTasks } from "../db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

export const tasksRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.userId, ctx.user.id))
      .orderBy(desc(agentTasks.createdAt));
  }),

  create: authedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        prompt: z.string().min(1),
        agentId: z.string().uuid().optional(),
        dependsOn: z.array(z.string().uuid()).optional(),
        priority: z.number().int().min(-2).max(2).optional(),
        maxRetries: z.number().int().min(0).max(5).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const depIds = input.dependsOn ?? [];

      // Validate all dep IDs belong to this user
      if (depIds.length > 0) {
        const owned = await db
          .select({ id: agentTasks.id })
          .from(agentTasks)
          .where(and(inArray(agentTasks.id, depIds), eq(agentTasks.userId, userId)));
        if (owned.length !== depIds.length) {
          throw new Error("One or more dependency task IDs not found");
        }
      }

      const [row] = await db
        .insert(agentTasks)
        .values({
          userId,
          agentId: input.agentId ?? null,
          title: input.title,
          prompt: input.prompt,
          dependsOn: depIds.length > 0 ? JSON.stringify(depIds) : null,
          priority: input.priority ?? 0,
          maxRetries: input.maxRetries ?? 2,
          status: "pending",
        })
        .returning();

      // If all deps already succeeded, queue immediately
      if (depIds.length === 0) {
        await db
          .update(agentTasks)
          .set({ status: "queued", updatedAt: new Date() })
          .where(eq(agentTasks.id, row.id));
        try {
          const { taskQueue } = await import("../workers/taskWorker");
          await taskQueue.add("run", { taskId: row.id }, { priority: 3 - (input.priority ?? 0) });
        } catch {
          // Redis unavailable — task stays queued, will run when worker restarts
        }
      } else {
        const depRows = await db
          .select({ status: agentTasks.status })
          .from(agentTasks)
          .where(inArray(agentTasks.id, depIds));
        const allDone = depRows.every((r) => r.status === "success");
        if (allDone) {
          await db
            .update(agentTasks)
            .set({ status: "queued", updatedAt: new Date() })
            .where(eq(agentTasks.id, row.id));
          try {
            const { taskQueue } = await import("../workers/taskWorker");
            await taskQueue.add("run", { taskId: row.id }, { priority: 3 - (input.priority ?? 0) });
          } catch {
            // Redis unavailable
          }
        }
      }

      return row;
    }),

  cancel: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [task] = await db
        .select({ status: agentTasks.status })
        .from(agentTasks)
        .where(and(eq(agentTasks.id, input.id), eq(agentTasks.userId, ctx.user.id)))
        .limit(1);
      if (!task) throw new Error("Task not found");
      if (task.status === "running") throw new Error("Cannot cancel a running task");

      await db
        .update(agentTasks)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(agentTasks.id, input.id), eq(agentTasks.userId, ctx.user.id)));
    }),

  retry: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [task] = await db
        .select()
        .from(agentTasks)
        .where(and(eq(agentTasks.id, input.id), eq(agentTasks.userId, ctx.user.id)))
        .limit(1);
      if (!task) throw new Error("Task not found");
      if (!["error", "cancelled"].includes(task.status)) {
        throw new Error("Only error or cancelled tasks can be retried");
      }

      await db
        .update(agentTasks)
        .set({ status: "queued", retryCount: 0, error: null, updatedAt: new Date() })
        .where(eq(agentTasks.id, input.id));

      try {
        const { taskQueue } = await import("../workers/taskWorker");
        await taskQueue.add("run", { taskId: input.id }, { priority: 3 - (task.priority ?? 0) });
      } catch {
        // Redis unavailable
      }
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [task] = await db
        .select({ status: agentTasks.status })
        .from(agentTasks)
        .where(and(eq(agentTasks.id, input.id), eq(agentTasks.userId, ctx.user.id)))
        .limit(1);
      if (!task) throw new Error("Task not found");
      if (task.status === "running") throw new Error("Cannot delete a running task");

      await db
        .delete(agentTasks)
        .where(and(eq(agentTasks.id, input.id), eq(agentTasks.userId, ctx.user.id)));
    }),
});

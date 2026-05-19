import { z } from "zod";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { agentTaskComments, agentTaskTemplates, agentTasks, agents } from "../db/schema";
import { eq, and, desc, asc, inArray, ilike, isNull, lt, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

const TASK_STATUSES = ["pending", "queued", "running", "success", "error", "cancelled"] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

const STATUS_ALIAS_MAP: Record<string, TaskStatus[]> = {
  todo: ["pending", "queued"],
  in_progress: ["running"],
  done: ["success"],
  error: ["error"],
  cancelled: ["cancelled"],
};

const statusSchema = z.enum(TASK_STATUSES);
const statusAliasSchema = z.enum(["todo", "in_progress", "done", "error", "cancelled"]);
const managerActionSchema = z.enum(["queue_ready", "retry_failed", "rebalance_unassigned", "annotate_blocked"]);

const subtaskSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  agentId: z.string().uuid().nullable().optional(),
  priority: z.number().int().min(-2).max(2).optional(),
  maxRetries: z.number().int().min(0).max(5).optional(),
});

async function queueTask(taskId: string, priority: number) {
  try {
    const { taskQueue } = await import("../workers/taskWorker");
    await taskQueue.add("run", { taskId }, { priority: 3 - priority });
  } catch {
    // Redis unavailable: the task remains queued and can run when the worker restarts.
  }
}

async function assertTaskOwned(userId: string, taskId: string) {
  const [task] = await db
    .select()
    .from(agentTasks)
    .where(and(eq(agentTasks.id, taskId), eq(agentTasks.userId, userId)))
    .limit(1);
  if (!task) throw new Error("Task not found");
  return task;
}

async function assertTemplateOwned(userId: string, templateId: string) {
  const [template] = await db
    .select()
    .from(agentTaskTemplates)
    .where(and(eq(agentTaskTemplates.id, templateId), eq(agentTaskTemplates.userId, userId)))
    .limit(1);
  if (!template) throw new Error("Template not found");
  return template;
}

async function assertAgentOwned(userId: string, agentId: string) {
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .limit(1);
  if (!agent) throw new Error("Agent not found");
  return agent;
}

async function validateDependencies(userId: string, depIds: string[]) {
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
}

function normalizeDependsOn(dependsOn: unknown) {
  if (!dependsOn) return [] as string[];
  if (Array.isArray(dependsOn)) return dependsOn.filter((dep): dep is string => typeof dep === "string");
  if (typeof dependsOn !== "string") return [];
  try {
    const parsed = JSON.parse(dependsOn) as unknown;
    return Array.isArray(parsed) ? parsed.filter((dep): dep is string => typeof dep === "string") : [];
  } catch {
    return [];
  }
}

async function dependenciesSatisfiedForUser(userId: string, dependsOn: unknown) {
  const depIds = normalizeDependsOn(dependsOn);
  if (depIds.length === 0) return true;
  const deps = await db
    .select({ id: agentTasks.id, status: agentTasks.status })
    .from(agentTasks)
    .where(and(inArray(agentTasks.id, depIds), eq(agentTasks.userId, userId)));
  return deps.length === depIds.length && deps.every((dep) => dep.status === "success");
}

async function getManagerCandidates(userId: string) {
  const [tasks, agentRows] = await Promise.all([
    db.select().from(agentTasks).where(eq(agentTasks.userId, userId)).orderBy(desc(agentTasks.createdAt)).limit(200),
    db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(eq(agents.userId, userId))
      .orderBy(asc(agents.name)),
  ]);
  const ready: typeof tasks = [];
  const blocked: typeof tasks = [];
  for (const task of tasks) {
    if (task.status !== "pending") continue;
    const deps = normalizeDependsOn(task.dependsOn);
    if (await dependenciesSatisfiedForUser(userId, task.dependsOn)) ready.push(task);
    else if (deps.length > 0) blocked.push(task);
  }
  const retryable = tasks.filter(
    (task) => ["error", "cancelled"].includes(task.status) && (task.retryCount ?? 0) < (task.maxRetries ?? 2),
  );
  const unassigned = tasks.filter((task) => !task.agentId && ["pending", "queued"].includes(task.status));
  const runningCutoff = Date.now() - 30 * 60_000;
  const staleRunning = tasks.filter(
    (task) => task.status === "running" && task.startedAt && task.startedAt.getTime() < runningCutoff,
  );
  return { tasks, agents: agentRows, ready, blocked, retryable, unassigned, staleRunning };
}

export const tasksRouter = router({
  managerState: authedProcedure.query(async ({ ctx }) => {
    const candidates = await getManagerCandidates(ctx.user.id);
    return {
      summary: {
        total: candidates.tasks.length,
        ready: candidates.ready.length,
        retryable: candidates.retryable.length,
        blocked: candidates.blocked.length,
        unassigned: candidates.unassigned.length,
        staleRunning: candidates.staleRunning.length,
      },
      recommendations: [
        {
          action: "queue_ready" as const,
          count: candidates.ready.length,
          taskIds: candidates.ready.map((task) => task.id),
        },
        {
          action: "retry_failed" as const,
          count: candidates.retryable.length,
          taskIds: candidates.retryable.map((task) => task.id),
        },
        {
          action: "rebalance_unassigned" as const,
          count: candidates.agents.length > 0 ? candidates.unassigned.length : 0,
          taskIds: candidates.unassigned.map((task) => task.id),
        },
        {
          action: "annotate_blocked" as const,
          count: candidates.blocked.length,
          taskIds: candidates.blocked.map((task) => task.id),
        },
      ],
    };
  }),

  runManager: authedProcedure
    .input(
      z.object({ actions: z.array(managerActionSchema).min(1), maxTasks: z.number().int().min(1).max(50).default(25) }),
    )
    .mutation(async ({ ctx, input }) => {
      const candidates = await getManagerCandidates(ctx.user.id);
      const applied: Array<{ action: z.infer<typeof managerActionSchema>; count: number }> = [];

      if (input.actions.includes("queue_ready")) {
        const tasksToQueue = candidates.ready.slice(0, input.maxTasks);
        for (const task of tasksToQueue) {
          await db
            .update(agentTasks)
            .set({ status: "queued", updatedAt: new Date() })
            .where(and(eq(agentTasks.id, task.id), eq(agentTasks.userId, ctx.user.id)));
          await queueTask(task.id, task.priority ?? 0);
        }
        applied.push({ action: "queue_ready", count: tasksToQueue.length });
      }

      if (input.actions.includes("retry_failed")) {
        const tasksToRetry = candidates.retryable.slice(0, input.maxTasks);
        for (const task of tasksToRetry) {
          await db
            .update(agentTasks)
            .set({ status: "queued", retryCount: 0, error: null, updatedAt: new Date() })
            .where(and(eq(agentTasks.id, task.id), eq(agentTasks.userId, ctx.user.id)));
          await queueTask(task.id, task.priority ?? 0);
          await db.insert(agentTaskComments).values({
            taskId: task.id,
            userId: ctx.user.id,
            agentId: task.agentId,
            authorType: "system",
            body: "Auto-manager retried this task.",
          });
        }
        applied.push({ action: "retry_failed", count: tasksToRetry.length });
      }

      if (input.actions.includes("rebalance_unassigned")) {
        const agentsToUse = candidates.agents;
        const tasksToAssign = agentsToUse.length > 0 ? candidates.unassigned.slice(0, input.maxTasks) : [];
        for (const [index, task] of tasksToAssign.entries()) {
          const agent = agentsToUse[index % agentsToUse.length];
          await db
            .update(agentTasks)
            .set({ agentId: agent.id, reassignedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(agentTasks.id, task.id), eq(agentTasks.userId, ctx.user.id)));
          await db.insert(agentTaskComments).values({
            taskId: task.id,
            userId: ctx.user.id,
            agentId: agent.id,
            authorType: "system",
            body: `Auto-manager assigned this task to ${agent.name}.`,
          });
        }
        applied.push({ action: "rebalance_unassigned", count: tasksToAssign.length });
      }

      if (input.actions.includes("annotate_blocked")) {
        const tasksToAnnotate = candidates.blocked.slice(0, input.maxTasks);
        for (const task of tasksToAnnotate) {
          await db.insert(agentTaskComments).values({
            taskId: task.id,
            userId: ctx.user.id,
            agentId: task.agentId,
            authorType: "system",
            body: `Auto-manager is waiting on dependencies: ${normalizeDependsOn(task.dependsOn).join(", ")}`,
          });
        }
        applied.push({ action: "annotate_blocked", count: tasksToAnnotate.length });
      }

      return { applied };
    }),

  list: authedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(25),
          cursor: z.string().datetime().optional(),
          status: statusSchema.optional(),
          statusAlias: statusAliasSchema.optional(),
          agentId: z.string().uuid().optional(),
          parentTaskId: z.string().uuid().nullable().optional(),
          q: z.string().trim().min(1).optional(),
          includeChildren: z.boolean().default(true),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const filters: SQL[] = [eq(agentTasks.userId, ctx.user.id)];
      const limit = input?.limit ?? 25;

      if (input?.cursor) filters.push(lt(agentTasks.createdAt, new Date(input.cursor)));
      if (input?.status) filters.push(eq(agentTasks.status, input.status));
      if (input?.statusAlias) filters.push(inArray(agentTasks.status, STATUS_ALIAS_MAP[input.statusAlias]));
      if (input?.agentId) filters.push(eq(agentTasks.agentId, input.agentId));
      if (input?.parentTaskId !== undefined) {
        filters.push(
          input.parentTaskId ? eq(agentTasks.parentTaskId, input.parentTaskId) : isNull(agentTasks.parentTaskId),
        );
      } else if (input?.includeChildren === false) {
        filters.push(isNull(agentTasks.parentTaskId));
      }
      if (input?.q) {
        const query = `%${input.q}%`;
        const search = or(ilike(agentTasks.title, query), ilike(agentTasks.prompt, query));
        if (search) filters.push(search);
      }

      const rows = await db
        .select()
        .from(agentTasks)
        .where(and(...filters))
        .orderBy(desc(agentTasks.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? (items[items.length - 1]?.createdAt.toISOString() ?? null) : null;

      return { items, nextCursor };
    }),

  create: authedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        prompt: z.string().min(1),
        agentId: z.string().uuid().nullable().optional(),
        parentTaskId: z.string().uuid().optional(),
        templateId: z.string().uuid().optional(),
        dependsOn: z.array(z.string().uuid()).optional(),
        priority: z.number().int().min(-2).max(2).optional(),
        maxRetries: z.number().int().min(0).max(5).optional(),
        subtasks: z.array(subtaskSchema).max(25).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const depIds = input.dependsOn ?? (input.parentTaskId ? [input.parentTaskId] : []);

      if (input.parentTaskId) await assertTaskOwned(userId, input.parentTaskId);
      if (input.templateId) await assertTemplateOwned(userId, input.templateId);
      if (input.agentId) await assertAgentOwned(userId, input.agentId);
      for (const subtask of input.subtasks ?? []) {
        if (subtask.agentId) await assertAgentOwned(userId, subtask.agentId);
      }
      await validateDependencies(userId, depIds);

      const [row] = await db
        .insert(agentTasks)
        .values({
          userId,
          agentId: input.agentId ?? null,
          parentTaskId: input.parentTaskId ?? null,
          templateId: input.templateId ?? null,
          assignedByUserId: userId,
          title: input.title,
          prompt: input.prompt,
          dependsOn: depIds,
          priority: input.priority ?? 0,
          maxRetries: input.maxRetries ?? 2,
          status: "pending",
        })
        .returning();

      for (const subtask of input.subtasks ?? []) {
        await db.insert(agentTasks).values({
          userId,
          agentId: subtask.agentId ?? input.agentId ?? null,
          parentTaskId: row.id,
          templateId: input.templateId ?? null,
          assignedByUserId: userId,
          title: subtask.title,
          prompt: subtask.prompt,
          dependsOn: [row.id],
          priority: subtask.priority ?? input.priority ?? 0,
          maxRetries: subtask.maxRetries ?? input.maxRetries ?? 2,
          status: "pending",
        });
      }

      // If all deps already succeeded, queue immediately
      if (depIds.length === 0) {
        await db.update(agentTasks).set({ status: "queued", updatedAt: new Date() }).where(eq(agentTasks.id, row.id));
        await queueTask(row.id, input.priority ?? 0);
      } else {
        const depRows = await db
          .select({ status: agentTasks.status })
          .from(agentTasks)
          .where(inArray(agentTasks.id, depIds));
        const allDone = depRows.every((r) => r.status === "success");
        if (allDone) {
          await db.update(agentTasks).set({ status: "queued", updatedAt: new Date() }).where(eq(agentTasks.id, row.id));
          await queueTask(row.id, input.priority ?? 0);
        }
      }

      return row;
    }),

  templates: authedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(agentTaskTemplates)
      .where(eq(agentTaskTemplates.userId, ctx.user.id))
      .orderBy(asc(agentTaskTemplates.name));
  }),

  createTemplate: authedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        title: z.string().min(1),
        prompt: z.string().min(1),
        agentId: z.string().uuid().nullable().optional(),
        variables: z.array(z.string()).optional(),
        subtasks: z.array(subtaskSchema).max(25).optional(),
        defaultPriority: z.number().int().min(-2).max(2).optional(),
        defaultMaxRetries: z.number().int().min(0).max(5).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.agentId) await assertAgentOwned(ctx.user.id, input.agentId);
      const [template] = await db
        .insert(agentTaskTemplates)
        .values({
          userId: ctx.user.id,
          agentId: input.agentId ?? null,
          name: input.name,
          description: input.description ?? null,
          title: input.title,
          prompt: input.prompt,
          variables: input.variables ?? [],
          subtasks: input.subtasks ?? [],
          defaultPriority: input.defaultPriority ?? 0,
          defaultMaxRetries: input.defaultMaxRetries ?? 2,
        })
        .returning();
      return template;
    }),

  deleteTemplate: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await assertTemplateOwned(ctx.user.id, input.id);
    await db
      .delete(agentTaskTemplates)
      .where(and(eq(agentTaskTemplates.id, input.id), eq(agentTaskTemplates.userId, ctx.user.id)));
  }),

  comments: authedProcedure.input(z.object({ taskId: z.string().uuid() })).query(async ({ ctx, input }) => {
    await assertTaskOwned(ctx.user.id, input.taskId);
    return db
      .select()
      .from(agentTaskComments)
      .where(eq(agentTaskComments.taskId, input.taskId))
      .orderBy(asc(agentTaskComments.createdAt));
  }),

  addComment: authedProcedure
    .input(
      z.object({
        taskId: z.string().uuid(),
        body: z.string().min(1),
        authorType: z.enum(["human", "agent", "system"]).default("human"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const task = await assertTaskOwned(ctx.user.id, input.taskId);
      const [comment] = await db
        .insert(agentTaskComments)
        .values({
          taskId: input.taskId,
          userId: ctx.user.id,
          agentId: input.authorType === "agent" ? task.agentId : null,
          authorType: input.authorType,
          body: input.body,
        })
        .returning();
      return comment;
    }),

  reassign: authedProcedure
    .input(z.object({ id: z.string().uuid(), agentId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await assertTaskOwned(ctx.user.id, input.id);
      if (input.agentId) await assertAgentOwned(ctx.user.id, input.agentId);

      await db
        .update(agentTasks)
        .set({ agentId: input.agentId, reassignedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(agentTasks.id, input.id), eq(agentTasks.userId, ctx.user.id)));

      await db.insert(agentTaskComments).values({
        taskId: input.id,
        userId: ctx.user.id,
        agentId: input.agentId,
        authorType: "system",
        body: input.agentId ? "Task reassigned to a new agent." : "Task unassigned from agent.",
      });
    }),

  cancel: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
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

  retry: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
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

    await queueTask(input.id, task.priority ?? 0);
  }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [task] = await db
      .select({ status: agentTasks.status })
      .from(agentTasks)
      .where(and(eq(agentTasks.id, input.id), eq(agentTasks.userId, ctx.user.id)))
      .limit(1);
    if (!task) throw new Error("Task not found");
    if (task.status === "running") throw new Error("Cannot delete a running task");

    await db.delete(agentTasks).where(and(eq(agentTasks.id, input.id), eq(agentTasks.userId, ctx.user.id)));
  }),
});

import { z } from "zod";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { automations, automationRuns, agents } from "../db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import cron from "node-cron";
import { normalizeAutomationWorkflow, WORKFLOW_NODE_TYPES } from "@/lib/workflow-designer";

function isValidTimezone(timezone: string) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

const automationInput = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  cronExpression: z
    .string()
    .min(1)
    .refine((value) => cron.validate(value), "Invalid cron expression"),
  timezone: z.string().min(1).default("UTC").refine(isValidTimezone, "Invalid timezone"),
  maxExecutions: z.number().int().positive().optional().nullable(),
  agentId: z.string().uuid().optional(),
  webhookUrl: z.string().url().optional(),
  notificationWebhookUrl: z.string().url().optional(),
  workflowDefinition: z.unknown().optional(),
});

const workflowPositionSchema = z.object({
  x: z.number().finite().min(0).max(1200),
  y: z.number().finite().min(0).max(720),
});

const workflowNodeSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(WORKFLOW_NODE_TYPES),
  title: z.string().min(1).max(120),
  handler: z.string().max(160).optional(),
  prompt: z.string().max(8000).optional(),
  interrupt: z.boolean().optional(),
  position: workflowPositionSchema,
});

const workflowEdgeSchema = z.object({
  id: z.string().min(1).max(120),
  from: z.string().min(1),
  to: z.string().min(1),
  condition: z.string().max(500).optional(),
});

const workflowDefinitionSchema = z.object({
  version: z.literal("1"),
  entryNodeId: z.string().min(1),
  nodes: z.array(workflowNodeSchema).min(1).max(40),
  edges: z.array(workflowEdgeSchema).max(80),
  updatedAt: z.string().optional(),
});

function hasReachedExecutionLimit(auto: typeof automations.$inferSelect) {
  return auto.maxExecutions !== null && auto.executionCount >= auto.maxExecutions;
}

export const automationsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id: automations.id,
        name: automations.name,
        prompt: automations.prompt,
        cronExpression: automations.cronExpression,
        timezone: automations.timezone,
        maxExecutions: automations.maxExecutions,
        executionCount: automations.executionCount,
        isActive: automations.isActive,
        pausedAt: automations.pausedAt,
        pauseReason: automations.pauseReason,
        lastRunAt: automations.lastRunAt,
        agentId: automations.agentId,
        agentName: agents.name,
        webhookUrl: automations.webhookUrl,
        notificationWebhookUrl: automations.notificationWebhookUrl,
        workflowDefinition: automations.workflowDefinition,
        createdAt: automations.createdAt,
      })
      .from(automations)
      .leftJoin(agents, eq(automations.agentId, agents.id))
      .where(eq(automations.userId, ctx.user.id))
      .orderBy(desc(automations.createdAt));

    const lastRuns =
      rows.length > 0
        ? await db
            .select({
              automationId: automationRuns.automationId,
              status: automationRuns.status,
              completedAt: automationRuns.completedAt,
              startedAt: automationRuns.startedAt,
            })
            .from(automationRuns)
            .where(
              inArray(
                automationRuns.automationId,
                rows.map((row) => row.id),
              ),
            )
            .orderBy(automationRuns.automationId, desc(automationRuns.startedAt))
        : [];
    const lastRunByAutomation = new Map<string, (typeof lastRuns)[number]>();
    for (const run of lastRuns) {
      if (!lastRunByAutomation.has(run.automationId)) {
        lastRunByAutomation.set(run.automationId, run);
      }
    }

    return rows.map((row) => ({ ...row, lastRunStatus: lastRunByAutomation.get(row.id)?.status ?? null }));
  }),

  create: authedProcedure.input(automationInput).mutation(async ({ ctx, input }) => {
    const [row] = await db
      .insert(automations)
      .values({
        userId: ctx.user.id,
        name: input.name,
        prompt: input.prompt,
        cronExpression: input.cronExpression,
        timezone: input.timezone,
        maxExecutions: input.maxExecutions ?? null,
        agentId: input.agentId ?? null,
        webhookUrl: input.webhookUrl ?? null,
        notificationWebhookUrl: input.notificationWebhookUrl ?? input.webhookUrl ?? null,
        workflowDefinition: normalizeAutomationWorkflow(input.workflowDefinition, input.prompt),
      })
      .returning();
    return row;
  }),

  updateWorkflow: authedProcedure
    .input(z.object({ id: z.string().uuid(), workflowDefinition: workflowDefinitionSchema }))
    .mutation(async ({ ctx, input }) => {
      const workflowDefinition = normalizeAutomationWorkflow({
        ...input.workflowDefinition,
        updatedAt: new Date().toISOString(),
      });
      const [row] = await db
        .update(automations)
        .set({ workflowDefinition })
        .where(and(eq(automations.id, input.id), eq(automations.userId, ctx.user.id)))
        .returning({ id: automations.id, workflowDefinition: automations.workflowDefinition });
      if (!row) throw new Error("Automation not found");
      return row;
    }),

  toggle: authedProcedure
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(automations)
        .set({
          isActive: input.isActive,
          pausedAt: input.isActive ? null : new Date(),
          pauseReason: input.isActive ? null : "manual_toggle",
        })
        .where(and(eq(automations.id, input.id), eq(automations.userId, ctx.user.id)));
    }),

  pause: authedProcedure
    .input(z.object({ id: z.string().uuid(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(automations)
        .set({ isActive: false, pausedAt: new Date(), pauseReason: input.reason ?? "manual_pause" })
        .where(and(eq(automations.id, input.id), eq(automations.userId, ctx.user.id)));
      return { success: true };
    }),

  resume: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db
      .update(automations)
      .set({ isActive: true, pausedAt: null, pauseReason: null })
      .where(and(eq(automations.id, input.id), eq(automations.userId, ctx.user.id)));
    return { success: true };
  }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db.delete(automations).where(and(eq(automations.id, input.id), eq(automations.userId, ctx.user.id)));
  }),

  runs: authedProcedure.input(z.object({ automationId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [auto] = await db
      .select({ id: automations.id })
      .from(automations)
      .where(and(eq(automations.id, input.automationId), eq(automations.userId, ctx.user.id)))
      .limit(1);
    if (!auto) throw new Error("Not found");

    return db
      .select({
        id: automationRuns.id,
        automationId: automationRuns.automationId,
        sessionId: automationRuns.sessionId,
        status: automationRuns.status,
        output: automationRuns.output,
        error: automationRuns.error,
        notificationStatus: automationRuns.notificationStatus,
        notificationError: automationRuns.notificationError,
        startedAt: automationRuns.startedAt,
        completedAt: automationRuns.completedAt,
      })
      .from(automationRuns)
      .where(eq(automationRuns.automationId, input.automationId))
      .orderBy(desc(automationRuns.startedAt))
      .limit(20);
  }),

  triggerNow: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [auto] = await db
      .select()
      .from(automations)
      .where(and(eq(automations.id, input.id), eq(automations.userId, ctx.user.id)))
      .limit(1);
    if (!auto) throw new Error("Not found");
    if (hasReachedExecutionLimit(auto)) throw new Error("Automation has reached its maxExecutions limit");

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

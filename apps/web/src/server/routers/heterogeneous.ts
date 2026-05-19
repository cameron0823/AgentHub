import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import {
  runHeterogeneousAgent,
  type HeterogeneousAgentProfile,
  type HeterogeneousRunStatus,
} from "@agenthub/agent-runtime";
import { authedProcedure, router } from "../trpc";
import { db } from "../db";
import { heterogeneousAgentProfiles, heterogeneousAgentRuns } from "../db/schema";

const runStatus = {
  success: { status: "success" as HeterogeneousRunStatus },
  error: { status: "error" as HeterogeneousRunStatus },
};

const profileInput = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  kind: z.enum(["claude", "codex", "generic"]).default("generic"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  workingDirectory: z.string().optional().nullable(),
  env: z.record(z.string(), z.string()).default({}),
  isEnabled: z.boolean().default(false),
});

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function parseStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function toRuntimeProfile(row: typeof heterogeneousAgentProfiles.$inferSelect): HeterogeneousAgentProfile {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    kind: row.kind,
    command: row.command,
    args: parseStringArray(row.args),
    workingDirectory: row.workingDirectory,
    env: parseStringRecord(row.env),
    isEnabled: row.isEnabled,
  };
}

export const heterogeneousRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(heterogeneousAgentProfiles)
      .where(eq(heterogeneousAgentProfiles.userId, ctx.user.id))
      .orderBy(desc(heterogeneousAgentProfiles.createdAt));
  }),

  create: authedProcedure.input(profileInput).mutation(async ({ ctx, input }) => {
    const [profile] = await db
      .insert(heterogeneousAgentProfiles)
      .values({
        userId: ctx.user.id,
        name: input.name,
        description: input.description || null,
        kind: input.kind,
        command: input.command,
        args: input.args,
        workingDirectory: input.workingDirectory || null,
        env: input.env,
        isEnabled: input.isEnabled,
      })
      .returning();
    return profile;
  }),

  update: authedProcedure
    .input(profileInput.partial().extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      await db
        .update(heterogeneousAgentProfiles)
        .set({
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.description !== undefined && { description: updates.description || null }),
          ...(updates.kind !== undefined && { kind: updates.kind }),
          ...(updates.command !== undefined && { command: updates.command }),
          ...(updates.args !== undefined && { args: updates.args }),
          ...(updates.workingDirectory !== undefined && { workingDirectory: updates.workingDirectory || null }),
          ...(updates.env !== undefined && { env: updates.env }),
          ...(updates.isEnabled !== undefined && { isEnabled: updates.isEnabled }),
          updatedAt: new Date(),
        })
        .where(and(eq(heterogeneousAgentProfiles.id, id), eq(heterogeneousAgentProfiles.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db
      .delete(heterogeneousAgentProfiles)
      .where(and(eq(heterogeneousAgentProfiles.id, input.id), eq(heterogeneousAgentProfiles.userId, ctx.user.id)));
    return { success: true };
  }),

  runs: authedProcedure
    .input(z.object({ profileId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const filters = input?.profileId
        ? and(eq(heterogeneousAgentRuns.userId, ctx.user.id), eq(heterogeneousAgentRuns.profileId, input.profileId))
        : eq(heterogeneousAgentRuns.userId, ctx.user.id);
      return db.select().from(heterogeneousAgentRuns).where(filters).orderBy(desc(heterogeneousAgentRuns.createdAt));
    }),

  startRun: authedProcedure
    .input(
      z.object({
        profileId: z.string().uuid(),
        prompt: z.string().min(1),
        args: z.array(z.string()).optional(),
        stdin: z.string().optional(),
        sessionId: z.string().uuid().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [profileRow] = await db
        .select()
        .from(heterogeneousAgentProfiles)
        .where(
          and(eq(heterogeneousAgentProfiles.id, input.profileId), eq(heterogeneousAgentProfiles.userId, ctx.user.id)),
        )
        .limit(1);
      if (!profileRow) throw new Error("Heterogeneous agent profile not found");

      const [run] = await db
        .insert(heterogeneousAgentRuns)
        .values({
          userId: ctx.user.id,
          profileId: profileRow.id,
          sessionId: input.sessionId || null,
          status: "running",
          input: input.prompt,
          startedAt: new Date(),
        })
        .returning();

      let output = "";
      let error = "";
      let exitCode: number | null = null;
      let finalStatus: HeterogeneousRunStatus = runStatus.success.status;
      const events = [];

      try {
        for await (const event of runHeterogeneousAgent(toRuntimeProfile(profileRow), {
          prompt: input.prompt,
          args: input.args,
          stdin: input.stdin,
        })) {
          events.push(event);
          if (event.type === "stdout") output += event.content;
          if (event.type === "stderr") error += event.content;
          if (event.type === "status" && event.status === "feature_disabled") {
            finalStatus = "feature_disabled";
            error = event.message || "Heterogeneous runtime is disabled.";
          }
          if (event.type === "status" && event.status === "error") {
            finalStatus = runStatus.error.status;
            error = event.message || error;
          }
          if (event.type === "exit") {
            exitCode = event.exitCode;
            if (event.exitCode !== 0) finalStatus = runStatus.error.status;
          }
        }
      } catch (err) {
        finalStatus = runStatus.error.status;
        error = err instanceof Error ? err.message : String(err);
      }

      await db
        .update(heterogeneousAgentRuns)
        .set({
          status: finalStatus === "feature_disabled" ? "feature_disabled" : finalStatus,
          output: output || null,
          error: error || null,
          exitCode,
          metadata: { events },
          completedAt: new Date(),
        })
        .where(and(eq(heterogeneousAgentRuns.id, run.id), eq(heterogeneousAgentRuns.userId, ctx.user.id)));

      return {
        ...run,
        status: finalStatus,
        output,
        error,
        exitCode,
        events,
      };
    }),
});

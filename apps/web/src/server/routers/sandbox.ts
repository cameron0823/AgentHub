import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { resources } from "../db/schema";
import { createSandboxSession, downloadSandboxOutput, executePython, sandboxResourceFromResourceRow } from "../sandbox";

export const sandboxRouter = router({
  executeCode: authedProcedure
    .input(z.object({ code: z.string().min(1).max(80_000), language: z.literal("python").default("python") }))
    .mutation(async ({ input }) => {
      const result = await executePython(input.code);
      return createSandboxSession({
        provider: "local-docker",
        language: input.language,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        outputs: [
          ...(result.stdout
            ? [
                {
                  type: "file" as const,
                  filename: "stdout.txt",
                  mimeType: "text/plain",
                  content: result.stdout,
                },
              ]
            : []),
          ...(result.stderr
            ? [
                {
                  type: "file" as const,
                  filename: "stderr.txt",
                  mimeType: "text/plain",
                  content: result.stderr,
                },
              ]
            : []),
        ],
      });
    }),

  listOutputs: authedProcedure
    .input(z.object({ sessionId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(resources.userId, ctx.user.id), eq(resources.source, "sandbox")];
      if (input?.sessionId) conditions.push(eq(resources.sessionId, input.sessionId));

      const rows = await db
        .select()
        .from(resources)
        .where(and(...conditions))
        .orderBy(desc(resources.createdAt))
        .limit(100);

      return rows.map(sandboxResourceFromResourceRow);
    }),

  downloadOutput: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    try {
      return await downloadSandboxOutput({ userId: ctx.user.id, resourceId: input.id });
    } catch (error) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: error instanceof Error ? error.message : "Sandbox output not found",
      });
    }
  }),
});

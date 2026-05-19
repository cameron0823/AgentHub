import { z } from "zod";
import { and, desc, eq, lt } from "drizzle-orm";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { dailyBriefs } from "../db/schema";
import { createDailyBriefForUser, latestDailyBriefForUser } from "../daily-brief";

export const dailyBriefsRouter = router({
  latest: authedProcedure.query(async ({ ctx }) => {
    return latestDailyBriefForUser(ctx.user.id);
  }),

  list: authedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(30).default(10),
          cursor: z.string().datetime().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const filters = [eq(dailyBriefs.userId, ctx.user.id)];
      const limit = input?.limit ?? 10;
      if (input?.cursor) filters.push(lt(dailyBriefs.generatedAt, new Date(input.cursor)));

      const rows = await db
        .select()
        .from(dailyBriefs)
        .where(and(...filters))
        .orderBy(desc(dailyBriefs.generatedAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      return {
        items,
        nextCursor: hasMore ? (items[items.length - 1]?.generatedAt.toISOString() ?? null) : null,
      };
    }),

  generate: authedProcedure
    .input(
      z
        .object({
          generatedForDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          windowHours: z.number().int().min(1).max(168).default(24),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      return createDailyBriefForUser(ctx.user.id, {
        generatedBy: "manual",
        generatedForDate: input?.generatedForDate,
        windowHours: input?.windowHours,
      });
    }),
});

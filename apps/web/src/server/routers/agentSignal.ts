import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { agentSignalReviewItems, agentSignalReviews } from "../db/schema";
import { runAgentSignalForUser } from "../agent-signal";

export const agentSignalRouter = router({
  latest: authedProcedure.query(async ({ ctx }) => {
    const [review] = await db
      .select()
      .from(agentSignalReviews)
      .where(eq(agentSignalReviews.userId, ctx.user.id))
      .orderBy(desc(agentSignalReviews.createdAt))
      .limit(1);
    return review ?? null;
  }),

  items: authedProcedure
    .input(z.object({ reviewId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let reviewId = input?.reviewId;
      if (reviewId) {
        const [review] = await db
          .select({ id: agentSignalReviews.id })
          .from(agentSignalReviews)
          .where(and(eq(agentSignalReviews.id, reviewId), eq(agentSignalReviews.userId, ctx.user.id)))
          .limit(1);
        if (!review) throw new Error("Review not found");
      } else {
        const [latest] = await db
          .select({ id: agentSignalReviews.id })
          .from(agentSignalReviews)
          .where(eq(agentSignalReviews.userId, ctx.user.id))
          .orderBy(desc(agentSignalReviews.createdAt))
          .limit(1);
        reviewId = latest?.id;
      }
      if (!reviewId) return [];

      return db
        .select()
        .from(agentSignalReviewItems)
        .where(and(eq(agentSignalReviewItems.reviewId, reviewId), eq(agentSignalReviewItems.userId, ctx.user.id)))
        .orderBy(desc(agentSignalReviewItems.createdAt));
    }),

  runNow: authedProcedure.mutation(async ({ ctx }) => {
    return runAgentSignalForUser(ctx.user.id, { generatedBy: "manual" });
  }),
});

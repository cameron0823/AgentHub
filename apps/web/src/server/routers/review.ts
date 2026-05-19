import { z } from "zod";
import { router, authedProcedure } from "../trpc";
import { getRepositorySummary, getReviewCapabilities, listRepositoryDiff, validateReviewRepository } from "../git/diff";

const reviewFileStatusSchema = z.enum(["modified", "added", "deleted", "renamed", "binary"]);

export const reviewRouter = router({
  capabilities: authedProcedure.query(() => getReviewCapabilities()),

  registerRepository: authedProcedure.input(z.object({ repoPath: z.string().min(1) })).mutation(async ({ input }) => {
    await validateReviewRepository(input.repoPath);
    return getRepositorySummary(input.repoPath);
  }),

  diff: authedProcedure
    .input(
      z.object({
        repoPath: z.string().min(1),
        cursor: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(200).default(50),
        filter: z.string().trim().optional(),
        status: reviewFileStatusSchema.optional(),
        paths: z.array(z.string().min(1)).max(100).optional(),
      }),
    )
    .query(async ({ input }) => {
      return listRepositoryDiff({
        repoPath: input.repoPath,
        cursor: input.cursor,
        limit: input.limit,
        filter: input.filter || undefined,
        status: input.status,
        paths: input.paths,
      });
    }),
});

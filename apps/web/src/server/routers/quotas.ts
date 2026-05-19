import { z } from "zod";
import { router, authedProcedure } from "../trpc";
import { checkQuota, ensureUserQuota, quotaSummary, type QuotaAction } from "../quotas";
import { providerCatalog, checkProviderPlanAccess } from "@agenthub/ai-providers";

const quotaActionSchema = z.enum(["message", "token", "storage", "api"]);

export const quotasRouter = router({
  current: authedProcedure.query(async ({ ctx }) => {
    const quota = await ensureUserQuota(ctx.user.id);
    return quotaSummary(quota);
  }),

  check: authedProcedure
    .input(
      z.object({
        action: quotaActionSchema,
        requested: z.number().int().positive().default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      return checkQuota(ctx.user.id, input.action as QuotaAction, input.requested);
    }),

  providerGates: authedProcedure.query(async ({ ctx }) => {
    const quota = await ensureUserQuota(ctx.user.id);
    return providerCatalog
      .filter((entry) => entry.type === "cloud")
      .map((entry) => ({
        providerId: entry.id,
        ...checkProviderPlanAccess(entry.id, quota.plan),
      }));
  }),
});

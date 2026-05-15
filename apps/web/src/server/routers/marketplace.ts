import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { router, authedProcedure, publicProcedure } from "../trpc";
import { db } from "../db";
import { agents } from "../db/schema";
import {
  createAgentExportManifest,
  findBundledCatalogItem,
  getBundledCatalogItems,
  parseMarketplaceManifest,
  summarizeMarketplaceManifest,
} from "../marketplace/manifest";

async function installMarketplaceManifest(input: unknown, userId: string) {
  const manifest = parseMarketplaceManifest(input);
  const inserted = await db.insert(agents).values(manifest.agents.map((agent) => ({
    id: crypto.randomUUID(),
    userId,
    name: agent.name,
    description: agent.description || null,
    avatar: agent.avatar || null,
    systemPrompt: agent.systemPrompt,
    model: agent.model,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    tools: JSON.stringify(agent.tools),
    memoryEnabled: agent.memoryEnabled,
  }))).returning();

  return {
    summary: summarizeMarketplaceManifest(manifest),
    installedAgents: inserted,
  };
}

export const marketplaceRouter = router({
  catalog: publicProcedure.query(() => getBundledCatalogItems()),

  validateManifest: publicProcedure
    .input(z.unknown())
    .mutation(({ input }) => {
      const manifest = parseMarketplaceManifest(input);
      return {
        summary: summarizeMarketplaceManifest(manifest),
        warnings: [] as string[],
      };
    }),

  installManifest: authedProcedure
    .input(z.unknown())
    .mutation(async ({ ctx, input }) => installMarketplaceManifest(input, ctx.user.id)),

  installCatalogItem: authedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const manifest = findBundledCatalogItem(input.slug);
      if (!manifest) throw new Error("Catalog item not found");
      return installMarketplaceManifest(manifest, ctx.user.id);
    }),

  exportAgent: authedProcedure
    .input(z.object({ agentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [agent] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, input.agentId), eq(agents.userId, ctx.user.id)))
        .limit(1);
      if (!agent) throw new Error("Agent not found");
      const manifest = createAgentExportManifest(agent);
      return { manifest, summary: summarizeMarketplaceManifest(manifest) };
    }),
});

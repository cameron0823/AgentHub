import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { router, authedProcedure, publicProcedure } from "../trpc";
import { db } from "../db";
import { agents, installedSkills, skillResources } from "../db/schema";
import {
  createAgentExportManifest,
  findBundledCatalogItem,
  getBundledCatalogItems,
  parseMarketplaceManifest,
  summarizeMarketplaceManifest,
} from "../marketplace/manifest";
import { fetchRemoteMarketplaceCatalog, findRemoteCatalogItem } from "../marketplace/remote";
import {
  createInstalledOpenApiPlugin,
  fetchOpenApiPlugin,
  openApiPluginToSkillPackage,
  parseOpenApiPlugin,
} from "../marketplace/openapi";
import { publishCommunityManifest } from "../marketplace/community";

async function installMarketplaceManifest(input: unknown, userId: string) {
  const manifest = parseMarketplaceManifest(input);
  const inserted = await db
    .insert(agents)
    .values(
      manifest.agents.map((agent) => ({
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
      })),
    )
    .returning();

  return {
    summary: summarizeMarketplaceManifest(manifest),
    installedAgents: inserted,
  };
}

async function installOpenApiPluginManifest(input: unknown, userId: string) {
  const manifest =
    typeof input === "object" &&
    input !== null &&
    (input as { schemaVersion?: unknown }).schemaVersion === "agenthub.openapi-plugin.v1"
      ? parseOpenApiPluginManifest(input)
      : parseOpenApiPlugin(input);
  const pkg = openApiPluginToSkillPackage(manifest);

  await db
    .delete(installedSkills)
    .where(and(eq(installedSkills.userId, userId), eq(installedSkills.slug, pkg.metadata.slug)));

  const [plugin] = await db
    .insert(installedSkills)
    .values({
      userId,
      slug: pkg.metadata.slug,
      name: pkg.metadata.name,
      description: pkg.metadata.description || null,
      version: pkg.metadata.version,
      author: "OpenAPI",
      license: null,
      source: "openapi",
      sourceUrl: pkg.metadata.sourceUrl || null,
      skillMarkdown: pkg.skillMarkdown,
      manifest: pkg,
      permissions: pkg.permissions,
    })
    .returning();

  await db.insert(skillResources).values(
    pkg.resources.map((resource) => ({
      userId,
      skillId: plugin.id,
      path: resource.path,
      type: resource.type,
      content: resource.content,
      mimeType: resource.mimeType,
      metadata: { description: resource.description },
    })),
  );

  const installed = createInstalledOpenApiPlugin(plugin, pkg.resources);
  return {
    plugin: installed,
    toolCount: installed.tools.length,
    enabledToolIds: installed.enabledToolIds,
  };
}

function parseOpenApiPluginManifest(input: unknown) {
  return z
    .object({
      schemaVersion: z.literal("agenthub.openapi-plugin.v1"),
      slug: z.string().min(1),
      title: z.string().min(1),
      version: z.string().optional(),
      description: z.string().optional(),
      sourceUrl: z.string().url().optional(),
      serverUrl: z.string().optional(),
      tools: z.array(
        z.object({
          name: z.string().min(1),
          description: z.string().min(1),
          method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
          path: z.string().min(1),
          operationId: z.string().optional(),
          parameters: z.record(z.unknown()),
        }),
      ),
    })
    .parse(input);
}

async function listInstalledOpenApiPlugins(userId: string) {
  const rows = await db
    .select()
    .from(installedSkills)
    .where(and(eq(installedSkills.userId, userId), eq(installedSkills.source, "openapi")));
  if (rows.length === 0) return [];
  const resources = await db
    .select()
    .from(skillResources)
    .where(
      inArray(
        skillResources.skillId,
        rows.map((row) => row.id),
      ),
    );

  return rows.map((row) =>
    createInstalledOpenApiPlugin(
      row,
      resources.filter((resource) => resource.skillId === row.id),
    ),
  );
}

export const marketplaceRouter = router({
  catalog: publicProcedure.query(() => getBundledCatalogItems()),

  remoteCatalog: publicProcedure.query(() => fetchRemoteMarketplaceCatalog()),

  validateManifest: publicProcedure.input(z.unknown()).mutation(({ input }) => {
    const manifest = parseMarketplaceManifest(input);
    return {
      summary: summarizeMarketplaceManifest(manifest),
      warnings: [] as string[],
    };
  }),

  validateOpenApiPlugin: publicProcedure.input(z.unknown()).mutation(({ input }) => {
    const manifest = parseOpenApiPlugin(input);
    return {
      manifest,
      toolCount: manifest.tools.length,
      warnings: [] as string[],
    };
  }),

  loadOpenApiPlugin: publicProcedure.input(z.object({ url: z.string().url() })).mutation(async ({ input }) => {
    const manifest = await fetchOpenApiPlugin(input.url);
    return {
      manifest,
      toolCount: manifest.tools.length,
      warnings: [] as string[],
    };
  }),

  installOpenApiPlugin: authedProcedure
    .input(z.unknown())
    .mutation(async ({ ctx, input }) => installOpenApiPluginManifest(input, ctx.user.id)),

  installOpenApiPluginFromUrl: authedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ ctx, input }) => installOpenApiPluginManifest(await fetchOpenApiPlugin(input.url), ctx.user.id)),

  listOpenApiPlugins: authedProcedure.query(async ({ ctx }) => listInstalledOpenApiPlugins(ctx.user.id)),

  installManifest: authedProcedure
    .input(z.unknown())
    .mutation(async ({ ctx, input }) => installMarketplaceManifest(input, ctx.user.id)),

  installCatalogItem: authedProcedure.input(z.object({ slug: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const manifest = findBundledCatalogItem(input.slug);
    if (!manifest) throw new Error("Catalog item not found");
    return installMarketplaceManifest(manifest, ctx.user.id);
  }),

  installRemoteItem: authedProcedure.input(z.object({ slug: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const item = await findRemoteCatalogItem(input.slug);
    if (!item) throw new Error("Remote catalog item not found");
    return installMarketplaceManifest(item.manifest, ctx.user.id);
  }),

  forkRemoteItem: authedProcedure.input(z.object({ slug: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const item = await findRemoteCatalogItem(input.slug);
    if (!item) throw new Error("Remote catalog item not found");
    return installMarketplaceManifest(item.manifest, ctx.user.id);
  }),

  exportAgent: authedProcedure.input(z.object({ agentId: z.string() })).mutation(async ({ ctx, input }) => {
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, input.agentId), eq(agents.userId, ctx.user.id)))
      .limit(1);
    if (!agent) throw new Error("Agent not found");
    const manifest = createAgentExportManifest(agent);
    return { manifest, summary: summarizeMarketplaceManifest(manifest) };
  }),

  publishAgent: authedProcedure
    .input(z.object({ agentId: z.string().uuid(), submit: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const [agent] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, input.agentId), eq(agents.userId, ctx.user.id)))
        .limit(1);
      if (!agent) throw new Error("Agent not found");
      const manifest = createAgentExportManifest(agent);
      return publishCommunityManifest(manifest, input.submit);
    }),
});

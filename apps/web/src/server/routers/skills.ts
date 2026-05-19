import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { authedProcedure, publicProcedure, router } from "../trpc";
import { db } from "../db";
import { installedSkills, skillResources } from "../db/schema";
import {
  findBundledSkillPackage,
  getBundledSkillCatalog,
  parseSkillPackage,
  summarizeSkillPackage,
  type SkillPackage,
} from "../skills/schema";
import { createSkillRuntimeRecords, SkillRuntime } from "../skills/runtime";

function packageResourceRows(pkg: SkillPackage, userId: string, skillId: string) {
  return [
    ...pkg.resources.map((resource) => ({
      userId,
      skillId,
      path: resource.path,
      type: resource.type,
      content: resource.content,
      mimeType: resource.mimeType,
      metadata: {
        description: resource.description,
      },
    })),
    ...pkg.scripts.map((script) => ({
      userId,
      skillId,
      path: script.entrypoint,
      type: "script" as const,
      content: script.content,
      mimeType: "text/plain",
      metadata: {
        name: script.name,
        runtime: script.runtime,
        description: script.description,
      },
    })),
    ...pkg.templates.map((template) => ({
      userId,
      skillId,
      path: template.path,
      type: "template" as const,
      content: template.content,
      mimeType: template.mimeType,
      metadata: {
        name: template.name,
      },
    })),
  ];
}

async function installSkillPackage(userId: string, input: unknown, source = "local") {
  const pkg = parseSkillPackage(input);
  await db
    .delete(installedSkills)
    .where(and(eq(installedSkills.userId, userId), eq(installedSkills.slug, pkg.metadata.slug)));

  const [skill] = await db
    .insert(installedSkills)
    .values({
      userId,
      slug: pkg.metadata.slug,
      name: pkg.metadata.name,
      description: pkg.metadata.description || null,
      version: pkg.metadata.version,
      author: pkg.metadata.author || null,
      license: pkg.metadata.license || null,
      source,
      sourceUrl: pkg.metadata.sourceUrl || null,
      skillMarkdown: pkg.skillMarkdown,
      manifest: pkg,
      permissions: pkg.permissions,
    })
    .returning();

  const resources = packageResourceRows(pkg, userId, skill.id);
  if (resources.length > 0) await db.insert(skillResources).values(resources);

  return {
    summary: summarizeSkillPackage(pkg),
    installedSkill: skill,
    resourceCount: resources.length,
  };
}

async function loadOneRuntime(userId: string, slug: string) {
  const skillRows = await db
    .select()
    .from(installedSkills)
    .where(and(eq(installedSkills.userId, userId), eq(installedSkills.slug, slug)));
  const resourceRows =
    skillRows.length > 0
      ? await db.select().from(skillResources).where(eq(skillResources.skillId, skillRows[0].id))
      : [];
  const records = createSkillRuntimeRecords(skillRows, resourceRows);
  return new SkillRuntime(records);
}

export const skillsRouter = router({
  catalog: publicProcedure.query(() => getBundledSkillCatalog()),

  list: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(installedSkills)
      .where(and(eq(installedSkills.userId, ctx.user.id), ne(installedSkills.source, "openapi")));
    return rows.map((row) => {
      const pkg = parseSkillPackage(row.manifest);
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        version: row.version,
        enabledToolId: `skill:${row.slug}`,
        summary: summarizeSkillPackage(pkg),
      };
    });
  }),

  installPackage: authedProcedure
    .input(z.unknown())
    .mutation(async ({ ctx, input }) => installSkillPackage(ctx.user.id, input, "import")),

  installCatalogItem: authedProcedure.input(z.object({ slug: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const pkg = findBundledSkillPackage(input.slug);
    if (!pkg) throw new Error("Skill catalog item not found");
    return installSkillPackage(ctx.user.id, pkg, "local");
  }),

  updateFromCatalog: authedProcedure.input(z.object({ slug: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select()
      .from(installedSkills)
      .where(and(eq(installedSkills.userId, ctx.user.id), eq(installedSkills.slug, input.slug)))
      .limit(1);
    if (!existing) throw new Error("Installed skill not found");
    const pkg = findBundledSkillPackage(input.slug);
    if (!pkg) throw new Error("Skill catalog item not found");
    return installSkillPackage(ctx.user.id, pkg, "local");
  }),

  remove: authedProcedure.input(z.object({ slug: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    await db
      .delete(installedSkills)
      .where(and(eq(installedSkills.userId, ctx.user.id), eq(installedSkills.slug, input.slug)));
    return { success: true };
  }),

  runSkill: authedProcedure
    .input(z.object({ slug: z.string().min(1), task: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const runtime = await loadOneRuntime(ctx.user.id, input.slug);
      return runtime.runSkill(input);
    }),

  readReference: authedProcedure
    .input(z.object({ slug: z.string().min(1), path: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const runtime = await loadOneRuntime(ctx.user.id, input.slug);
      return runtime.readReference(input);
    }),

  execScript: authedProcedure
    .input(z.object({ slug: z.string().min(1), scriptName: z.string().min(1), args: z.record(z.unknown()).optional() }))
    .mutation(async ({ ctx, input }) => {
      const runtime = await loadOneRuntime(ctx.user.id, input.slug);
      return runtime.execScript(input);
    }),

  exportFile: authedProcedure
    .input(z.object({ slug: z.string().min(1), path: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const runtime = await loadOneRuntime(ctx.user.id, input.slug);
      return runtime.exportFile(input);
    }),
});

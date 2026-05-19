import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("skill package schema covers markdown, manifest, resources, scripts, templates, and permissions", async () => {
  const schema = await readText("apps/web/src/server/skills/schema.ts");

  assert.match(schema, /SKILL_PACKAGE_SCHEMA_VERSION = "agenthub\.skill\.v1"/);
  assert.match(schema, /skillMarkdown/);
  assert.match(schema, /resources/);
  assert.match(schema, /scripts/);
  assert.match(schema, /templates/);
  assert.match(schema, /permissions/);
  assert.match(schema, /parseSkillPackage/);
  assert.match(schema, /summarizeSkillPackage/);
  assert.match(schema, /Path cannot escape the skill package/);
});

test("skills store persists installed skills and bundled skill resources", async () => {
  const [dbSchema, migration] = await Promise.all([
    readText("apps/web/src/server/db/schema.ts"),
    readText("apps/web/drizzle/0009_skills.sql"),
  ]);

  assert.match(dbSchema, /installedSkills = pgTable\(\s*\"installed_skills\"/);
  assert.match(dbSchema, /skillResources = pgTable\(\s*\"skill_resources\"/);
  assert.match(dbSchema, /installed_skills_user_slug_idx/);
  assert.match(dbSchema, /skill_resources_skill_path_idx/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS installed_skills/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS skill_resources/);
  assert.match(migration, /ON DELETE CASCADE/);
});

test("skill runtime exposes governed operations and blocks unrelated file access", async () => {
  const runtime = await readText("apps/web/src/server/skills/runtime.ts");

  for (const operation of ["runSkill", "readReference", "execScript", "exportFile"]) {
    assert.match(runtime, new RegExp(`async ${operation}\\(`), `missing ${operation}`);
  }
  assert.match(runtime, /createSkillRuntimeTools/);
  assert.match(runtime, /run_skill/);
  assert.match(runtime, /read_skill_reference/);
  assert.match(runtime, /exec_skill_script/);
  assert.match(runtime, /export_skill_file/);
  assert.match(runtime, /Script execution is disabled by policy/);
  assert.match(runtime, /Reference not found or not permitted/);
});

test("skills router provides catalog, install, update, remove, and invocation procedures", async () => {
  const [router, appRouter] = await Promise.all([
    readText("apps/web/src/server/routers/skills.ts"),
    readText("apps/web/src/server/routers/_app.ts"),
  ]);

  for (const procedure of [
    "catalog",
    "list",
    "installPackage",
    "installCatalogItem",
    "updateFromCatalog",
    "remove",
    "runSkill",
    "readReference",
    "execScript",
    "exportFile",
  ]) {
    assert.match(router, new RegExp(`${procedure}:`), `missing skills.${procedure}`);
  }
  assert.match(router, /eq\(installedSkills\.userId, ctx\.user\.id\)/);
  assert.match(router, /parseSkillPackage/);
  assert.match(appRouter, /skills: skillsRouter/);
});

test("chat route injects installed skill runtime tools only for enabled skill tool IDs", async () => {
  const route = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(route, /installedSkills/);
  assert.match(route, /skillResources/);
  assert.match(route, /parseEnabledSkillSlugs/);
  assert.match(route, /createSkillRuntimeTools/);
  assert.match(route, /skill:/);
  assert.match(route, /extraTools\.push\(\s*\.\.\.createSkillRuntimeTools/);
});

test("skills marketplace UI supports browse, install, permissions, update, remove, and activation cues", async () => {
  const [component, marketplace, builder, spec] = await Promise.all([
    readText("apps/web/src/components/SkillsMarketplace.tsx"),
    readText("apps/web/src/components/AgentMarketplace.tsx"),
    readText("apps/web/src/components/AgentBuilder.tsx"),
    readText("apps/web/tests/e2e/specs/phase-h/skills-marketplace.spec.ts"),
  ]);

  assert.match(component, /Skills Marketplace/);
  assert.match(component, /Install Skill/);
  assert.match(component, /Permissions/);
  assert.match(component, /Update/);
  assert.match(component, /Remove/);
  assert.match(component, /run_skill/);
  assert.match(marketplace, /<SkillsMarketplace/);
  assert.match(builder, /skill:/);
  assert.match(builder, /Installed skills/);
  assert.match(spec, /getByTestId\("skills-marketplace"\)/);
  assert.match(spec, /Browse Skills/);
  assert.match(spec, /Installed Skills/);
  assert.match(spec, /Permissions/);
});

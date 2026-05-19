import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

test("release checklist and changelog automation are canonical and runnable", async () => {
  const [pkg, changelog, checklist, script, todo] = await Promise.all([
    readJson("package.json"),
    readText("CHANGELOG.md"),
    readText("docs/deployment/release-checklist.md"),
    readText("scripts/generate-changelog.mjs"),
    readText("TODO.md"),
  ]);

  assert.equal(pkg.scripts["changelog:check"], "node scripts/generate-changelog.mjs --check");
  assert.equal(pkg.scripts["changelog:update"], "node scripts/generate-changelog.mjs --write");
  assert.match(changelog, /## 0\.1\.0 - Unreleased/);
  assert.match(checklist, /pnpm changelog:check/);
  assert.match(checklist, /pnpm audit --audit-level=moderate/);
  assert.match(checklist, /\/api\/metrics/);
  assert.match(script, /git\(\["log", "--pretty=format:%s"/);
  assert.match(script, /CHANGELOG\.md is missing release header/);
  assert.match(todo, /Add a release checklist/);
});

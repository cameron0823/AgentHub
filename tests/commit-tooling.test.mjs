import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

test("workspace exposes format, husky, and commitlint tooling", async () => {
  const [pkg, commitlint, hook, prettier, prettierIgnore] = await Promise.all([
    readJson("package.json"),
    readText("commitlint.config.cjs"),
    readText(".husky/commit-msg"),
    readText(".prettierrc.json"),
    readText(".prettierignore"),
  ]);

  assert.match(pkg.scripts.format, /^prettier --write /);
  assert.match(pkg.scripts["format:check"], /^prettier --check /);
  assert.doesNotMatch(pkg.scripts["format:check"], / --check \.$/);
  assert.equal(pkg.scripts.prepare, "husky");
  assert.equal(pkg.scripts.commitlint, "commitlint --edit");

  for (const dependency of ["prettier", "husky", "@commitlint/cli", "@commitlint/config-conventional"]) {
    assert.ok(pkg.devDependencies[dependency], `missing ${dependency}`);
  }

  assert.match(commitlint, /@commitlint\/config-conventional/);
  assert.match(hook, /commitlint --edit "\$1"/);
  assert.match(prettier, /"printWidth": 120/);
  assert.match(prettierIgnore, /^data$/m);

  await access(new URL("../.husky/commit-msg", import.meta.url), constants.X_OK);
});

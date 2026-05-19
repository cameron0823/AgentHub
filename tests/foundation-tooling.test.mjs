import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

test("workspace ESLint config exposes flat base and Next configs", async () => {
  const pkg = await readJson("packages/eslint-config/package.json");
  const base = await readText("packages/eslint-config/base.mjs");
  const next = await readText("packages/eslint-config/next.mjs");
  const webConfig = await readText("apps/web/eslint.config.mjs");

  assert.equal(pkg.name, "@agenthub/eslint-config");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.exports["./base"], "./base.mjs");
  assert.equal(pkg.exports["./next"], "./next.mjs");
  assert.match(pkg.peerDependencies.eslint, /\^9/);
  assert.match(base, /typescript-eslint/);
  assert.match(next, /flatConfig\.coreWebVitals/);
  assert.match(next, /@next\/eslint-plugin-next/);
  assert.match(webConfig, /@agenthub\/eslint-config\/next/);
});

test("web app uses ESLint 9 flat config package instead of legacy eslintrc", async () => {
  const webPkg = await readJson("apps/web/package.json");

  assert.match(webPkg.devDependencies.eslint, /\^9/);
  assert.equal(webPkg.devDependencies["@agenthub/eslint-config"], "workspace:*");
});

test("lint-staged and env validation are wired into local and CI gates", async () => {
  const rootPkg = await readJson("package.json");
  const lintStaged = await readText("lint-staged.config.mjs");
  const preCommit = await readText(".husky/pre-commit");
  const envValidator = await readText("scripts/validate-env.mjs");
  const ci = await readText(".github/workflows/ci.yml");

  assert.match(rootPkg.devDependencies["lint-staged"], /\^17/);
  assert.match(rootPkg.devDependencies.zod, /\^4/);
  assert.equal(rootPkg.scripts["env:check"], "node scripts/validate-env.mjs");
  assert.match(rootPkg.scripts.validate, /pnpm env:check/);
  assert.match(rootPkg.scripts.validate, /turbo run typecheck/);
  assert.match(rootPkg.scripts.validate, /turbo run test/);
  assert.match(rootPkg.scripts.validate, /turbo run lint/);
  assert.match(rootPkg.scripts.validate, /turbo run build/);
  assert.match(lintStaged, /pnpm -C apps\/web exec eslint --fix/);
  assert.match(preCommit, /pnpm exec lint-staged/);
  assert.match(envValidator, /requiredKeys/);
  assert.match(envValidator, /z\s*\.\s*object/);
  assert.match(ci, /pnpm validate/);
});

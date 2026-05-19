import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function readText(rel) {
  return readFile(join(root, rel), "utf8");
}

test("workspace exposes Vitest happy-dom and v8 coverage harness without replacing Node tests", async () => {
  const [pkgRaw, config, smoke] = await Promise.all([
    readText("package.json"),
    readText("vitest.config.ts"),
    readText("tests/vitest-harness.vitest.test.ts"),
  ]);
  const pkg = JSON.parse(pkgRaw);

  assert.equal(pkg.scripts["test:vitest"], "vitest run");
  assert.equal(pkg.scripts["test:vitest:coverage"], "vitest run --coverage");
  assert.equal(pkg.scripts.test, "turbo run test");
  assert.equal(pkg.devDependencies.vitest.startsWith("^4."), true);
  assert.equal(pkg.devDependencies["happy-dom"].startsWith("^20."), true);
  assert.equal(pkg.devDependencies["@vitest/coverage-v8"].startsWith("^4."), true);
  assert.match(config, /environment: "happy-dom"/);
  assert.match(config, /provider: "v8"/);
  assert.match(config, /tests\/\*\*\/\*\.vitest\.test\.ts/);
  assert.match(smoke, /document\.createElement/);
});

test("Vitest service suite is part of the root validation gate used by CI", async () => {
  const [pkgRaw, workflow, serviceSuite] = await Promise.all([
    readText("package.json"),
    readText(".github/workflows/ci.yml"),
    readText("tests/service-unit.vitest.test.ts"),
  ]);
  const pkg = JSON.parse(pkgRaw);

  assert.match(pkg.scripts.validate, /pnpm test:vitest/, "root validate must run Vitest service tests");
  assert.match(workflow, /pnpm validate/, "CI must run the root validation gate");
  assert.match(serviceSuite, /buildMcpClientConfig/, "service suite must cover MCP config behavior");
  assert.match(serviceSuite, /compileToolProfile/, "service suite must cover tool profile behavior");
  assert.match(serviceSuite, /validateMediaUrl/, "service suite must cover media safety behavior");
});

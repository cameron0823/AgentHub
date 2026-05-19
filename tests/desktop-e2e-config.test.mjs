import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop Playwright config targets smoke tests", async () => {
  const config = await readText("apps/desktop/playwright.config.ts");
  assert.match(config, /defineConfig/);
  assert.match(config, /testDir:\s*"\.\/tests\/smoke"/);
  assert.match(config, /reporter:\s*"list"/);
});

test("desktop smoke suite covers launch auth and service state", async () => {
  const launch = await readText("apps/desktop/tests/smoke/launch.spec.ts");
  const auth = await readText("apps/desktop/tests/smoke/auth.spec.ts");
  const services = await readText("apps/desktop/tests/smoke/services.spec.ts");

  assert.match(launch, /launches desktop shell/);
  assert.match(launch, /desktop runtime is detected/);
  assert.match(launch, /leaves no owned child process/);
  assert.match(auth, /auth dev login works in dev mode/);
  assert.match(auth, /settings page renders/);
  assert.match(services, /web health route returns ok/);
  assert.match(services, /service state/);
});

test("desktop package exposes e2e command and Playwright dependency", async () => {
  const pkg = JSON.parse(await readText("apps/desktop/package.json"));
  assert.equal(pkg.scripts["test:e2e"], "playwright test -c playwright.config.ts");
  assert.ok(pkg.devDependencies["@playwright/test"], "desktop package must own its Playwright test dependency");
});

test("root package exposes one-step desktop startup", async () => {
  const pkg = JSON.parse(await readText("package.json"));
  const script = await readText("scripts/start-desktop.mjs");
  const docs = await readText("docs/desktop/local-services.md");

  assert.equal(pkg.scripts.desktop, "node scripts/start-desktop.mjs");
  assert.match(script, /docker", \["compose", "up", "-d"/);
  assert.match(script, /pnpm", \["db:migrate"\]/);
  assert.match(script, /pnpm", \["-C", "apps\/desktop", "dev"\]/);
  assert.match(script, /configureHostPorts/);
  assert.match(script, /SEARXNG_HOST_PORT/);
  assert.match(script, /waitForPostgres/);
  assert.match(script, /--dry-run/);
  assert.match(script, /--skip-launch/);
  assert.match(docs, /pnpm desktop/);
});

test("web Playwright standalone server prepares static and public assets", async () => {
  const config = await readText("apps/web/playwright.config.ts");
  const prepareScript = await readText("apps/web/scripts/prepare-standalone-assets.mjs");
  assert.match(config, /prepare-standalone-assets\.mjs/);
  assert.match(config, /\.next\/standalone\/apps\/web\/server\.js/);
  assert.match(config, /workers:\s*process\.env\.E2E_OLLAMA \? 1 : undefined/);
  assert.match(prepareScript, /fileURLToPath\(import\.meta\.url\)/);
  assert.match(prepareScript, /path\.resolve\(scriptRoot, "\.\."\)/);
  assert.match(prepareScript, /\.next", "static"/);
  assert.match(prepareScript, /standalone", "apps", "web"/);
  assert.match(prepareScript, /public/);
});

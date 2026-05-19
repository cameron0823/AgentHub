import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));

test("electron-builder config packages desktop dist and web resources", async () => {
  const config = await readText("apps/desktop/electron-builder.yml");
  assert.match(config, /appId: com\.agenthub\.desktop/);
  assert.match(config, /productName: AgentHub/);
  assert.match(config, /dist\/\*\*/);
  assert.match(config, /resources\/web\/\*\*/);
  assert.match(config, /target: nsis/);
});

test("packaging config excludes secrets and local service data", async () => {
  const config = await readText("apps/desktop/electron-builder.yml");
  for (const excluded of [".env.local", "data/postgres", "data/redis", "data/minio"]) {
    assert.match(config, new RegExp(excluded.replace(/[./]/g, "\\$&")));
  }
});

test("desktop package prepares web bundle before package commands", async () => {
  const pkg = await readJson("apps/desktop/package.json");
  assert.match(pkg.scripts["prepare:web"], /prepare-web-bundle/);
  assert.match(pkg.scripts.package, /prepare:web/);
  assert.match(pkg.scripts.dist, /prepare:web/);
});

test("web bundle preparation copies standalone output and writes a manifest", async () => {
  const script = await readText("apps/desktop/scripts/prepare-web-bundle.ts");
  assert.match(script, /\.next\/standalone/);
  assert.match(script, /dereference: false/);
  assert.match(script, /materializeStandaloneHoistLinks/);
  assert.match(script, /await rm\(appNodeModules, \{ recursive: true, force: true \}\)/);
  assert.match(script, /optional native package hoist links/);
  assert.match(script, /await stat\(source\)/);
  assert.match(script, /\.next\/static/);
  assert.match(script, /"apps\/web\/.next\/static"/);
  assert.match(script, /public/);
  assert.match(script, /"apps\/web\/public"/);
  assert.match(script, /bundle-manifest\.json/);
  assert.match(script, /removeBundledEnvFiles/);
  assert.doesNotMatch(script, /\.env\.local/);
});

test("production desktop server path matches Next standalone layout", async () => {
  const manager = await readText("apps/desktop/src/main/services/web-server.ts");
  assert.match(manager, /process\.resourcesPath/);
  assert.match(manager, /"web", "apps", "web", "server\.js"/);
});

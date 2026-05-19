import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

test("web database client supports explicit Postgres and PGlite drivers", async () => {
  const [pkg, dbIndex, healthRoute, envExample, readme] = await Promise.all([
    readJson("apps/web/package.json"),
    readText("apps/web/src/server/db/index.ts"),
    readText("apps/web/src/app/api/health/dependencies/route.ts"),
    readText(".env.example"),
    readText("README.md"),
  ]);

  assert.ok(pkg.dependencies["@electric-sql/pglite"], "web app must depend on PGlite for local-first DB mode");
  assert.match(dbIndex, /resolveDatabaseDriver/);
  assert.match(dbIndex, /AGENTHUB_DB_DRIVER/);
  assert.match(dbIndex, /drizzle-orm\/postgres-js/);
  assert.match(dbIndex, /drizzle-orm\/pglite/);
  assert.match(dbIndex, /@electric-sql\/pglite\/vector/);
  assert.match(dbIndex, /@electric-sql\/pglite\/contrib\/pg_trgm/);
  assert.match(dbIndex, /new PGlite/);
  assert.match(dbIndex, /extensions: \{ vector, pg_trgm \}/);
  assert.match(dbIndex, /dbDriver/);
  assert.match(healthRoute, /dbDriver === "pglite"/);
  assert.match(envExample, /^AGENTHUB_DB_DRIVER=postgres$/m);
  assert.match(envExample, /^AGENTHUB_PGLITE_DATA_DIR=\.\/data\/pglite$/m);
  assert.match(readme, /AGENTHUB_DB_DRIVER=pglite/);
});

test("PGlite has a real migration and runtime smoke command", async () => {
  const [pkg, smoke, readme, releaseChecklist, todo] = await Promise.all([
    readJson("apps/web/package.json"),
    readText("apps/web/scripts/pglite-smoke.ts"),
    readText("README.md"),
    readText("docs/deployment/release-checklist.md"),
    readText("TODO.md"),
  ]);

  assert.equal(pkg.scripts["db:pglite:smoke"], "tsx scripts/pglite-smoke.ts");
  assert.match(smoke, /"drizzle", "meta", "_journal\.json"/);
  assert.match(smoke, /CREATE EXTENSION IF NOT EXISTS vector/);
  assert.match(smoke, /CREATE EXTENSION IF NOT EXISTS pg_trgm/);
  assert.match(smoke, /__drizzle_migrations/);
  assert.match(smoke, /client\.exec\(sql\)/);
  assert.match(smoke, /AGENTHUB_DB_DRIVER = "pglite"/);
  assert.match(smoke, /await import\("\.\.\/src\/server\/db\/index"\)/);
  assert.match(smoke, /\[1,2,3\]'::vector <=> '\[1,2,4\]'::vector/);
  assert.match(readme, /pnpm -C apps\/web db:pglite:smoke/);
  assert.match(releaseChecklist, /pnpm -C apps\/web db:pglite:smoke/);
  assert.match(todo, /pnpm -C apps\/web db:pglite:smoke/);
});

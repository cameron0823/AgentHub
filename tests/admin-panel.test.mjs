import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function readText(rel) {
  return readFile(join(root, rel), "utf8");
}

describe("Admin panel", () => {
  it("admin router has users.list procedure", async () => {
    const src = await readText("apps/web/src/server/routers/admin.ts");
    assert.match(src, /adminProcedure/, "must use adminProcedure");
    assert.match(src, /usersRouter/, "must have usersRouter");
    assert.match(src, /list:/, "must have list query key");
  });

  it("admin router has users.setRole mutation with role enum", async () => {
    const src = await readText("apps/web/src/server/routers/admin.ts");
    assert.match(src, /setRole/, "must have setRole mutation");
    assert.match(src, /z\.enum/, "must validate role with z.enum");
  });

  it("admin router has stats.overview with all counts", async () => {
    const src = await readText("apps/web/src/server/routers/admin.ts");
    assert.match(src, /overview/, "must have stats.overview query");
    assert.match(src, /from\(users\)/, "must count users");
    assert.match(src, /from\(agents\)/, "must count agents");
    assert.match(src, /from\(messages\)/, "must count messages");
  });

  it("adminRouter registered in _app.ts", async () => {
    const src = await readText("apps/web/src/server/routers/_app.ts");
    assert.match(src, /adminRouter/, "adminRouter must be imported");
    assert.match(src, /admin.*adminRouter/, "admin key must be wired up");
  });

  it("AdminPanel component has Users and Stats tabs", async () => {
    const src = await readText("apps/web/src/components/AdminPanel.tsx");
    assert.match(src, /AdminPanel/, "must export AdminPanel");
    assert.match(src, /UsersTab/, "must have UsersTab");
    assert.match(src, /StatsTab/, "must have StatsTab");
  });

  it("AdminPanel users tab has setRole mutation call", async () => {
    const src = await readText("apps/web/src/components/AdminPanel.tsx");
    assert.match(src, /setRole\.mutate/, "must call setRole mutation");
    assert.match(src, /Make admin/, "must have Make admin label");
    assert.match(src, /Revoke admin/, "must have Revoke admin label");
  });

  it("AdminPanel stats tab uses overview query", async () => {
    const src = await readText("apps/web/src/components/AdminPanel.tsx");
    assert.match(src, /stats\.overview\.useQuery/, "must query stats overview");
    assert.match(src, /StatCard/, "must render StatCard for each metric");
  });

  it("page.tsx renders AdminPanel for admin mainView", async () => {
    const src = await readText("apps/web/src/app/page.tsx");
    assert.match(src, /AdminPanel/, "must import AdminPanel");
    assert.match(src, /mainView.*admin.*AdminPanel/, "must render AdminPanel for admin view");
  });

  it("Sidebar shows admin link only for admin users", async () => {
    const src = await readText("apps/web/src/components/Sidebar.tsx");
    assert.match(src, /isAdmin/, "must check isAdmin");
    assert.match(src, /role.*admin/, "must check role === admin");
    assert.match(src, /ShieldCheck/, "must use ShieldCheck icon for admin link");
  });

  it("MainView type includes admin", async () => {
    const src = await readText("apps/web/src/stores/chatStore.ts");
    assert.match(src, /MainView.*admin/, "MainView union must include admin");
  });
});

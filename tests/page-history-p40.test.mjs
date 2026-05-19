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

describe("P40.3 page edit history", () => {
  it("schema and migration store page versions with retention and attribution", async () => {
    const schema = await readText("apps/web/src/server/db/schema.ts");
    assert.match(schema, /currentVersion: integer\(\s*\"current_version\"\)/, "pages must track current version");
    assert.match(schema, /export const pageVersions = pgTable\(\s*\"page_versions\"/, "page versions table must exist");
    assert.match(schema, /versionNumber: integer\(\s*\"version_number\"\)/, "versions must store version numbers");
    assert.match(schema, /diffSummary: jsonb\(\s*\"diff_summary\"\)/, "versions must store diff metadata");
    assert.match(
      schema,
      /retentionExpiresAt: timestamp\(\s*\"retention_expires_at\"/,
      "versions must store retention expiry",
    );
    assert.match(schema, /sourceType: text\(\s*\"source_type\"/, "versions must store source attribution");

    const migration = await readText("apps/web/drizzle/0019_page_edit_history.sql");
    assert.match(
      migration,
      /ALTER TABLE pages ADD COLUMN IF NOT EXISTS current_version/,
      "migration must add current version",
    );
    assert.match(migration, /CREATE TABLE IF NOT EXISTS page_versions/, "migration must create version table");
    assert.match(migration, /page_versions_page_version_idx/, "migration must index page/version lookup");
  });

  it("pages router creates versions, compares diffs, and restores snapshots", async () => {
    const router = await readText("apps/web/src/server/routers/pages.ts");
    assert.match(router, /VERSION_RETENTION_DAYS/, "router must define retention policy");
    assert.match(router, /buildMarkdownDiffSummary/, "router must compute diff summaries");
    assert.match(router, /createPageVersion/, "router must snapshot page edits");
    for (const proc of ["versions", "compareVersions", "restoreVersion"]) {
      assert.match(router, new RegExp(`${proc}: authedProcedure`), `router must expose ${proc}`);
    }
    assert.match(router, /sourceType: "restore"/, "restore must attribute the restore operation");
    assert.match(router, /currentVersion: nextVersion/, "restore/update must advance current version");
  });

  it("Pages UI exposes edit history browsing, compare, and restore controls", async () => {
    const manager = await readText("apps/web/src/components/PagesManager.tsx");
    assert.match(manager, /trpc\.pages\.versions\.useQuery/, "manager must load page versions");
    assert.match(manager, /trpc\.pages\.compareVersions\.useQuery/, "manager must compare versions");
    assert.match(manager, /trpc\.pages\.restoreVersion\.useMutation/, "manager must restore versions");
    assert.match(manager, /Edit history/, "UI must expose edit history");
    assert.match(manager, /Compare versions/, "UI must expose compare");
    assert.match(manager, /Restore version/, "UI must expose restore");
  });

  it("page history browser spec uses the running app instead of embedded HTML", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-h/page-history.spec.ts");
    assert.match(spec, /page\.goto\("\/pages"\)/, "browser coverage must navigate to the real pages route");
    assert.doesNotMatch(spec, /page\.setContent/, "browser coverage must not use synthetic HTML");
    assert.match(spec, /Compare versions/, "browser coverage must exercise compare controls");
    assert.match(spec, /Restore version/, "browser coverage must exercise restore controls");
  });
});

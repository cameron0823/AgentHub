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

describe("Workspace multi-tenancy", () => {
  it("adds workspace, membership, and invitation schema with scoped resource columns", async () => {
    const [schema, migration, journal] = await Promise.all([
      readText("apps/web/src/server/db/schema.ts"),
      readText("apps/web/drizzle/0024_workspace_multi_tenancy.sql"),
      readText("apps/web/drizzle/meta/_journal.json"),
    ]);

    assert.match(schema, /export const workspaces = pgTable\(\s*"workspaces"/);
    assert.match(schema, /export const workspaceMembers = pgTable\(\s*"workspace_members"/);
    assert.match(schema, /export const workspaceInvitations = pgTable\(\s*"workspace_invitations"/);
    assert.match(schema, /role: text\(\s*\"role\", \{ enum: \["owner", "admin", "member", "viewer"\]/);
    assert.match(schema, /brandColor: varchar\(\s*\"brand_color\"/);
    assert.match(schema, /deletedAt: timestamp\(\s*\"deleted_at\"/);

    for (const table of [
      "agents",
      "agent_groups",
      "chat_sessions",
      "knowledge_bases",
      "documents",
      "files",
      "provider_credentials",
      "mcp_servers",
      "projects",
      "agent_tasks",
    ]) {
      assert.match(
        migration,
        new RegExp(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS workspace_id`),
        `${table} must be workspace-scoped`,
      );
    }
    assert.match(journal, /0024_workspace_multi_tenancy/);
  });

  it("defines workspaceProcedure and Lobe-style role permission matrix", async () => {
    const trpc = await readText("apps/web/src/server/trpc.ts");

    assert.match(trpc, /workspaceProcedure/);
    assert.match(trpc, /WorkspacePermission/);
    assert.match(trpc, /rolePermissions/);
    assert.match(trpc, /owner: \["\*"\]/);
    assert.match(trpc, /viewer: \["agent:read", "document:read", "settings:read"\]/);
    assert.match(trpc, /Workspace ID is required/);
    assert.match(trpc, /Not a member of this workspace/);
    assert.match(trpc, /Missing permission/);
  });

  it("exposes workspace CRUD, invitations, member roles, and last-owner guardrails", async () => {
    const [router, appRouter] = await Promise.all([
      readText("apps/web/src/server/routers/workspaces.ts"),
      readText("apps/web/src/server/routers/_app.ts"),
    ]);

    for (const procedure of [
      "list",
      "get",
      "create",
      "update",
      "members",
      "invite",
      "acceptInvitation",
      "updateMemberRole",
      "removeMember",
      "softDelete",
    ]) {
      assert.match(router, new RegExp(`${procedure}:`), `workspace router must expose ${procedure}`);
    }
    assert.match(router, /Transfer ownership before removing or demoting the last owner/);
    assert.match(router, /Transfer ownership before deleting the workspace/);
    assert.match(router, /Invitation email does not match current user/);
    assert.match(appRouter, /workspaces: workspacesRouter/);
  });

  it("adds a persistent workspace switcher to route chrome", async () => {
    const [switcher, frame] = await Promise.all([
      readText("apps/web/src/components/WorkspaceSwitcher.tsx"),
      readText("apps/web/src/components/AppRouteFrame.tsx"),
    ]);

    assert.match(switcher, /trpc\.workspaces\.list\.useQuery/);
    assert.match(switcher, /trpc\.workspaces\.create\.useMutation/);
    assert.match(switcher, /data-testid="workspace-switcher"/);
    assert.match(switcher, /data-testid="workspace-menu"/);
    assert.match(frame, /WorkspaceSwitcher/);
  });
});

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

describe("P40.2 Projects and notebooks", () => {
  it("schema defines project containers, links, and notebook documents", async () => {
    const schema = await readText("apps/web/src/server/db/schema.ts");
    assert.match(schema, /export const projects = pgTable\(\s*\"projects\"/, "projects table must exist");
    for (const table of [
      "projectAgents",
      "projectChats",
      "projectPages",
      "projectKnowledgeBases",
      "projectTasks",
      "projectResources",
      "projectAutomations",
    ]) {
      assert.match(schema, new RegExp(`export const ${table} = pgTable`), `${table} link table must exist`);
    }
    assert.match(
      schema,
      /export const projectNotebookDocuments = pgTable\(\s*\"project_notebook_documents\"/,
      "notebook docs table must exist",
    );
    assert.match(schema, /content: text\(\s*\"content\"\)\.notNull/, "notebook docs must store agent-readable content");
    assert.match(schema, /sourceType: text\(\s*\"source_type\"/, "notebook docs must track source type");
  });

  it("migration creates projects, scoped links, and notebook indexes", async () => {
    const migration = await readText("apps/web/drizzle/0018_projects_notebooks.sql");
    assert.match(migration, /CREATE TABLE IF NOT EXISTS projects/, "migration must create projects");
    assert.match(migration, /CREATE TABLE IF NOT EXISTS project_agents/, "migration must create project agents");
    assert.match(
      migration,
      /CREATE TABLE IF NOT EXISTS project_notebook_documents/,
      "migration must create notebook docs",
    );
    assert.match(migration, /project_notebook_docs_project_idx/, "migration must index notebook docs by project");
    assert.match(migration, /project_chats_session_idx/, "migration must support chat-to-project lookup");
  });

  it("projects router exposes scope links and notebook document search", async () => {
    const router = await readText("apps/web/src/server/routers/projects.ts");
    for (const proc of [
      "list",
      "get",
      "create",
      "update",
      "delete",
      "scope",
      "linkResource",
      "unlinkResource",
      "notebookDocuments",
      "createNotebookDocument",
      "updateNotebookDocument",
      "deleteNotebookDocument",
      "searchNotebookDocuments",
    ]) {
      assert.match(router, new RegExp(`${proc}: authedProcedure`), `router must expose ${proc}`);
    }
    assert.match(router, /PROJECT_RESOURCE_TABLES/, "router must centralize project resource link targets");
    assert.match(router, /eq\(projects\.userId, ctx\.user\.id\)/, "project access must be user-scoped");
    assert.match(router, /ilike\(projectNotebookDocuments\.content/, "notebook search must query document content");

    const app = await readText("apps/web/src/server/routers/_app.ts");
    assert.match(app, /projects: projectsRouter/, "app router must mount projects router");
  });

  it("chat stream injects project notebook context when a session is linked to a project", async () => {
    const route = await readText("apps/web/src/app/api/chat/stream/route.ts");
    assert.match(route, /fetchProjectNotebookContext/, "chat stream must call notebook context helper");
    assert.match(route, /Project Notebook Context/, "prompt must label project notebook context");
    assert.match(route, /projectNotebookDocuments/, "stream route must query notebook docs");
    assert.match(route, /projectChats/, "stream route must resolve project from chat session");
  });

  it("Projects UI registers route, sidebar nav, scope filters, and notebook panel", async () => {
    const manager = await readText("apps/web/src/components/ProjectsManager.tsx");
    assert.match(manager, /trpc\.projects\.list\.useQuery/, "manager must list projects");
    assert.match(manager, /trpc\.projects\.scope\.useQuery/, "manager must load project scope");
    assert.match(manager, /trpc\.projects\.createNotebookDocument\.useMutation/, "manager must create notebook docs");
    assert.match(manager, /Project scope/, "UI must show project scope");
    assert.match(manager, /Notebook/, "UI must show notebook panel");
    assert.match(manager, /Link resource/, "UI must expose linking");

    const page = await readText("apps/web/src/app/projects/page.tsx");
    assert.match(page, /<ProjectsManager \/>/, "projects route must render manager");

    const sidebar = await readText("apps/web/src/components/Sidebar.tsx");
    assert.match(sidebar, /label="Projects"/, "sidebar must link to Projects");
  });
});

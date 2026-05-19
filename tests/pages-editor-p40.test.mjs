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

describe("P40.1 Pages and editor kernel", () => {
  it("schema defines pages, comments, and agent edit attribution", async () => {
    const schema = await readText("apps/web/src/server/db/schema.ts");
    assert.match(schema, /export const pages = pgTable\(\s*\"pages\"/, "pages table must exist");
    assert.match(schema, /lexicalState: jsonb\(\s*\"lexical_state\"\)/, "pages must store Lexical state");
    assert.match(schema, /markdown: text\(\s*\"markdown\"\)/, "pages must store markdown export text");
    assert.match(schema, /sourceSessionId: uuid\(\s*\"source_session_id\"\)/, "pages must link chat context");
    assert.match(schema, /export const pageComments = pgTable\(\s*\"page_comments\"/, "page comments table must exist");
    assert.match(schema, /selectionStart: integer\(\s*\"selection_start\"\)/, "comments must support selection ranges");
    assert.match(
      schema,
      /export const pageAgentEdits = pgTable\(\s*\"page_agent_edits\"/,
      "agent edit ledger must exist",
    );
    assert.match(
      schema,
      /lastEditedBy: text\(\s*\"last_edited_by\"/,
      "pages must track human/agent co-edit attribution",
    );
  });

  it("migration creates pages editor tables and indexes", async () => {
    const migration = await readText("apps/web/drizzle/0017_pages_editor.sql");
    assert.match(migration, /CREATE TABLE IF NOT EXISTS pages/, "migration must create pages");
    assert.match(migration, /CREATE TABLE IF NOT EXISTS page_comments/, "migration must create comments");
    assert.match(migration, /CREATE TABLE IF NOT EXISTS page_agent_edits/, "migration must create agent edit ledger");
    assert.match(migration, /pages_user_updated_idx/, "migration must index user updated ordering");
    assert.match(migration, /page_comments_page_idx/, "migration must index page comments");
  });

  it("pages router exposes CRUD, comments, markdown import/export, and copilot edits", async () => {
    const router = await readText("apps/web/src/server/routers/pages.ts");
    for (const proc of [
      "list",
      "get",
      "create",
      "update",
      "delete",
      "createFromChatMessage",
      "comments",
      "addComment",
      "applyCopilotEdit",
      "importMarkdown",
      "exportMarkdown",
    ]) {
      assert.match(router, new RegExp(`${proc}: authedProcedure`), `router must expose ${proc}`);
    }
    assert.match(router, /eq\(pages\.userId, ctx\.user\.id\)/, "page access must be user-scoped");
    assert.match(router, /pageAgentEdits/, "copilot edits must write an attribution ledger");
    assert.match(router, /sourceMessageId/, "chat-created pages must keep source message context");

    const app = await readText("apps/web/src/server/routers/_app.ts");
    assert.match(app, /pages: pagesRouter/, "app router must mount pages router");
  });

  it("Lexical editor kernel supports rich text, selection actions, and markdown import/export", async () => {
    const [editor, wrapper] = await Promise.all([
      readText("packages/editor-kernel/src/react/PageEditorKernel.tsx"),
      readText("apps/web/src/components/PageEditorKernel.tsx"),
    ]);
    assert.match(editor, /LexicalComposer/, "editor must use LexicalComposer");
    assert.match(editor, /RichTextPlugin/, "editor must use RichTextPlugin");
    assert.match(editor, /ContentEditable/, "editor must render ContentEditable");
    assert.match(editor, /HistoryPlugin/, "editor must include history");
    assert.match(editor, /MarkdownShortcutPlugin/, "editor must support markdown shortcuts");
    assert.match(editor, /exportEditorRootToMarkdown/, "editor must export markdown from Lexical");
    assert.match(editor, /importMarkdownToEditorRoot/, "editor must import markdown into Lexical");
    assert.match(editor, /onSelectionAction/, "editor must expose comments and selection actions");
    assert.match(editor, /data-testid="page-editor-kernel"/, "editor must have a stable test id");
    assert.match(wrapper, /@agenthub\/editor-kernel/, "legacy app editor path must re-export the shared package");
  });

  it("Pages UI registers route, sidebar nav, copilot, comments, and chat-to-page creation", async () => {
    const manager = await readText("apps/web/src/components/PagesManager.tsx");
    assert.match(manager, /trpc\.pages\.list\.useQuery/, "manager must load pages");
    assert.match(manager, /trpc\.pages\.applyCopilotEdit\.useMutation/, "manager must expose page-agent copilot");
    assert.match(manager, /Page Agent Copilot/, "UI must name the copilot panel");
    assert.match(manager, /Import Markdown/, "UI must expose markdown import");
    assert.match(manager, /Export Markdown/, "UI must expose markdown export");
    assert.match(manager, /Add comment/, "UI must expose selection comments");

    const page = await readText("apps/web/src/app/pages/page.tsx");
    assert.match(page, /<PagesManager \/>/, "pages route must render manager");

    const sidebar = await readText("apps/web/src/components/Sidebar.tsx");
    assert.match(sidebar, /label="Pages"/, "sidebar must link to Pages");

    const chat = await readText("apps/web/src/components/ChatMessage.tsx");
    assert.match(
      chat,
      /trpc\.pages\.createFromChatMessage\.useMutation/,
      "chat messages must create pages from chat context",
    );
    assert.match(chat, /title="Create page from message"/, "chat action must be discoverable");
  });
});

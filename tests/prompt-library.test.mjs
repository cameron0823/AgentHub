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

describe("Prompt Library", () => {
  it("promptLibrary schema has required columns", async () => {
    const src = await readText("apps/web/src/server/db/schema.ts");
    assert.match(src, /promptLibrary = pgTable\("prompt_library"/, "must define prompt_library table");
    assert.match(src, /title.*text|text.*title/, "must have title column");
    assert.match(src, /content.*text|text.*content/, "must have content column");
    assert.match(src, /isPinned.*boolean|boolean.*isPinned/, "must have isPinned boolean column");
    assert.match(src, /useCount.*integer|integer.*useCount/, "must have useCount integer column");
    assert.match(src, /tags/, "must have tags column");
  });

  it("promptLibraryRouter registers all required procedures", async () => {
    const src = await readText("apps/web/src/server/routers/promptLibrary.ts");
    assert.match(src, /list: authedProcedure/, "must have list procedure");
    assert.match(src, /create: authedProcedure/, "must have create procedure");
    assert.match(src, /update: authedProcedure/, "must have update procedure");
    assert.match(src, /delete: authedProcedure/, "must have delete procedure");
    assert.match(src, /incrementUse: authedProcedure/, "must have incrementUse procedure");
  });

  it("promptLibraryRouter enforces userId ownership on all mutations", async () => {
    const src = await readText("apps/web/src/server/routers/promptLibrary.ts");
    assert.match(src, /ctx\.user\.id/, "must reference authenticated user id");
    assert.match(src, /eq\(promptLibrary\.userId, ctx\.user\.id\)/, "must scope queries to user");
    assert.match(src, /and\(eq\(promptLibrary\.id, (?:input\.id|id)\), eq\(promptLibrary\.userId, ctx\.user\.id\)\)/, "must check both id and userId for mutations");
  });

  it("list query supports full-text search across title and content", async () => {
    const src = await readText("apps/web/src/server/routers/promptLibrary.ts");
    assert.match(src, /ilike\(promptLibrary\.title/, "must support title search with ilike");
    assert.match(src, /ilike\(promptLibrary\.content/, "must support content search with ilike");
    assert.match(src, /or\(ilike/, "must combine title and content with OR");
  });

  it("list query supports tag filtering and sorts pinned prompts first", async () => {
    const src = await readText("apps/web/src/server/routers/promptLibrary.ts");
    assert.match(src, /ANY\(/, "must support tag filtering with ANY operator");
    assert.match(src, /desc\(promptLibrary\.isPinned\)/, "must sort pinned prompts first");
    assert.match(src, /desc\(promptLibrary\.useCount\)/, "must sort by use count descending");
  });

  it("promptLibraryRouter is wired into the root tRPC router", async () => {
    const src = await readText("apps/web/src/server/routers/_app.ts");
    assert.match(src, /import.*promptLibraryRouter.*from.*promptLibrary/, "must import promptLibraryRouter");
    assert.match(src, /promptLibrary: promptLibraryRouter/, "must register under promptLibrary key");
  });

  it("PromptLibraryManager renders create, edit, and delete UI", async () => {
    const src = await readText("apps/web/src/components/PromptLibraryManager.tsx");
    assert.match(src, /Plus/, "must import Plus icon for new prompt button");
    assert.match(src, /Pencil/, "must import Pencil icon for edit button");
    assert.match(src, /Trash2/, "must import Trash2 icon for delete button");
    assert.match(src, /Pin/, "must import Pin icon for pin toggle");
    assert.match(src, /promptLibrary\.create\.useMutation|trpc\.promptLibrary\.create/, "must call create mutation");
    assert.match(src, /promptLibrary\.delete\.useMutation|trpc\.promptLibrary\.delete/, "must call delete mutation");
  });

  it("PromptLibraryManager is rendered in the settings page", async () => {
    const src = await readText("apps/web/src/app/settings/page.tsx");
    assert.match(src, /PromptLibraryManager/, "settings page must render PromptLibraryManager");
  });
});

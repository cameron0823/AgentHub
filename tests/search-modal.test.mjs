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

describe("Search modal and keyboard shortcuts", () => {
  it("SearchModal uses debounced query before triggering search", async () => {
    const src = await readText("apps/web/src/components/SearchModal.tsx");
    assert.match(src, /debouncedQuery/, "must debounce query to avoid search-on-every-keystroke");
    assert.match(src, /setTimeout/, "must use setTimeout for debounce");
    assert.match(src, /clearTimeout/, "must clear previous timeout on each keystroke");
  });

  it("SearchModal queries messages.search and groups results by session", async () => {
    const src = await readText("apps/web/src/components/SearchModal.tsx");
    assert.match(src, /messages\.search\.useQuery|trpc\.messages\.search/, "must call messages.search tRPC query");
    assert.match(src, /enabled: debouncedQuery\.length > 0/, "must only query when input is non-empty");
    assert.match(src, /sessionId/, "must group results by sessionId");
  });

  it("SearchModal highlights matching text in result excerpts", async () => {
    const src = await readText("apps/web/src/components/SearchModal.tsx");
    assert.match(src, /highlight\b/, "must have highlight function");
    assert.match(src, /<mark/, "must render <mark> element for matched text");
  });

  it("SearchModal navigates to the selected session and scrolls to the message", async () => {
    const src = await readText("apps/web/src/components/SearchModal.tsx");
    assert.match(src, /setActiveSession/, "must call setActiveSession on result click");
    assert.match(src, /scrollIntoView/, "must scroll the matched message into view");
    assert.match(src, /msg-\$\{messageId\}|`msg-\${/, "must target message element by id");
  });

  it("SearchModal closes on Escape key and backdrop click", async () => {
    const src = await readText("apps/web/src/components/SearchModal.tsx");
    assert.match(src, /Escape/, "must close on Escape key");
    assert.match(src, /onClose/, "must expose onClose prop for backdrop click");
  });

  it("page.tsx opens SearchModal with Cmd/Ctrl+K shortcut", async () => {
    const src = await readText("apps/web/src/app/page.tsx");
    assert.match(src, /metaKey.*ctrlKey|ctrlKey.*metaKey/, "must detect Cmd/Ctrl modifier");
    assert.match(src, /e\.key === "k"/, "must trigger on K key");
    assert.match(src, /setSearchOpen\(true\)/, "must open the search modal");
    assert.match(src, /SearchModal/, "must render SearchModal component");
  });

  it("KeyboardShortcuts registers Cmd+N for new conversation and Cmd+/ for help", async () => {
    const src = await readText("apps/web/src/components/KeyboardShortcuts.tsx");
    assert.match(src, /e\.key === "n"/, "must handle Cmd+N for new conversation");
    assert.match(src, /e\.key === "\/"/, "must handle Cmd+/ for shortcut help");
    assert.match(src, /createSession\.mutate/, "must create session via tRPC on Cmd+N");
    assert.match(src, /setHelpOpen/, "must toggle help panel on Cmd+/");
  });

  it("KeyboardShortcuts help panel lists all registered shortcuts", async () => {
    const src = await readText("apps/web/src/components/KeyboardShortcuts.tsx");
    assert.match(src, /SHORTCUTS/, "must define SHORTCUTS array");
    assert.match(src, /Cmd\/Ctrl \+ K/, "must list Cmd+K open search shortcut");
    assert.match(src, /Cmd\/Ctrl \+ N/, "must list Cmd+N new conversation shortcut");
    assert.match(src, /<kbd/, "must render keyboard key elements");
  });
});

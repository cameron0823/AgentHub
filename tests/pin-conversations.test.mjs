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

describe("Pin conversations", () => {
  it("chatSessions schema has isPinned boolean column", async () => {
    const src = await readText("apps/web/src/server/db/schema.ts");
    assert.match(src, /isPinned.*boolean|boolean.*isPinned/, "must have isPinned boolean column on chatSessions");
    assert.match(src, /is_pinned/, "must use is_pinned DB column name");
  });

  it("sessionsRouter has pin mutation", async () => {
    const src = await readText("apps/web/src/server/routers/sessions.ts");
    assert.match(src, /pin:/, "must have pin procedure key");
    assert.match(src, /isPinned/, "pin mutation must update isPinned");
  });

  it("pin mutation verifies user owns the session", async () => {
    const src = await readText("apps/web/src/server/routers/sessions.ts");
    assert.match(src, /ctx\.user\.id/, "must verify user owns the session");
  });

  it("ChatSession store type includes isPinned", async () => {
    const src = await readText("apps/web/src/stores/chatStore.ts");
    assert.match(src, /isPinned/, "ChatSession must have isPinned field");
  });

  it("chatStore has pinSession action", async () => {
    const src = await readText("apps/web/src/stores/chatStore.ts");
    assert.match(src, /pinSession/, "must have pinSession action");
  });

  it("Sidebar shows Pin icon button on each session", async () => {
    const src = await readText("apps/web/src/components/Sidebar.tsx");
    assert.match(src, /Pin\b/, "must import Pin icon from lucide-react");
    assert.match(src, /pin\.mutate|pinSession/, "must call pin mutation or pinSession");
  });

  it("Sidebar separates pinned sessions above regular sessions", async () => {
    const src = await readText("apps/web/src/components/Sidebar.tsx");
    assert.match(src, /isPinned/, "must filter/check isPinned");
    assert.match(src, /Pinned/, "must show Pinned label for pinned section");
  });

  it("toChatSession maps isPinned from server response", async () => {
    const src = await readText("apps/web/src/components/Sidebar.tsx");
    assert.match(src, /isPinned.*session\.isPinned|session\.isPinned.*isPinned/, "toChatSession must map isPinned");
  });
});

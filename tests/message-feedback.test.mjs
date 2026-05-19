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

describe("Message feedback (👍/👎)", () => {
  it("messages schema has feedback column with up/down enum", async () => {
    const src = await readText("apps/web/src/server/db/schema.ts");
    assert.match(src, /feedback/, "must have feedback column");
    assert.match(src, /up.*down|down.*up/, "must have up/down enum values");
  });

  it("messagesRouter has setFeedback mutation", async () => {
    const src = await readText("apps/web/src/server/routers/sessions.ts");
    assert.match(src, /setFeedback/, "must have setFeedback procedure");
    assert.match(src, /z\.enum\(\["up", "down"\]\)/, "must validate feedback with z.enum up/down");
  });

  it("setFeedback mutation accepts null to clear feedback", async () => {
    const src = await readText("apps/web/src/server/routers/sessions.ts");
    assert.match(src, /\.nullable\(\)/, "feedback input must be nullable to allow clearing");
  });

  it("setFeedback verifies session ownership before updating", async () => {
    const src = await readText("apps/web/src/server/routers/sessions.ts");
    assert.match(src, /ctx\.user\.id/, "must verify user owns the session");
  });

  it("ChatMessage interface includes feedback field", async () => {
    const src = await readText("apps/web/src/stores/chatStore.ts");
    assert.match(src, /feedback\?.*"up".*"down"/, "ChatMessage must have optional feedback field");
  });

  it("ChatMessage component renders thumbs buttons for assistant messages", async () => {
    const src = await readText("apps/web/src/components/ChatMessage.tsx");
    assert.match(src, /ThumbsUp/, "must import ThumbsUp icon");
    assert.match(src, /ThumbsDown/, "must import ThumbsDown icon");
    assert.match(src, /setFeedback/, "must call setFeedback mutation");
  });

  it("thumbs buttons toggle feedback on click and show filled state", async () => {
    const src = await readText("apps/web/src/components/ChatMessage.tsx");
    assert.match(src, /message\.feedback.*up|up.*message\.feedback/, "must check feedback === 'up' for active state");
    assert.match(
      src,
      /message\.feedback.*down|down.*message\.feedback/,
      "must check feedback === 'down' for active state",
    );
  });

  it("feedback buttons only shown on assistant messages", async () => {
    const src = await readText("apps/web/src/components/ChatMessage.tsx");
    assert.match(src, /isAssistant/, "must gate on isAssistant");
    assert.match(src, /handleFeedback\("up"\)/, "must call handleFeedback for up");
    assert.match(src, /handleFeedback\("down"\)/, "must call handleFeedback for down");
  });
});

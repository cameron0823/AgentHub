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

describe("Local file mention snapshots", () => {
  it("defines immutable file mention tokens and browser snapshot metadata", async () => {
    const snapshots = await readText("apps/web/src/lib/file-snapshots.ts");

    assert.match(snapshots, /FILE_MENTION_PATTERN/, "must define a markdown-compatible file mention parser");
    assert.match(snapshots, /formatFileMentionToken/, "must format inline file mention tokens");
    assert.match(snapshots, /extractFileMentions/, "must extract inline file mentions from chat text");
    assert.match(snapshots, /replaceFileMentionTokens/, "must hide raw file mention markdown in rendered text");
    assert.match(snapshots, /prepareBrowserFileSnapshot/, "must snapshot browser File objects at attach time");
    assert.match(snapshots, /crypto\.subtle\.digest\("SHA-256"/, "must hash the captured file bytes");
    assert.match(snapshots, /contentPreview/, "must preserve a bounded text preview for model context");
    assert.match(snapshots, /buildFileSnapshotSystemBlock/, "must build provider context from immutable snapshots");
  });

  it("chat input captures upload snapshots, supports drop, and inserts file mention chips", async () => {
    const input = await readText("apps/web/src/components/ChatInput.tsx");

    assert.match(input, /prepareBrowserFileSnapshot/, "input must capture snapshot metadata before upload completes");
    assert.match(input, /formatFileMentionToken/, "input must insert inline file mention tokens");
    assert.match(input, /fileId/, "input must attach the persisted file id to the snapshot");
    assert.match(input, /onDrop/, "input must support drag-and-drop file snapshots");
    assert.match(input, /data-testid="file-mention-chip"/, "input must render snapshot chips");
    assert.match(input, /contentPreview/, "input must keep the captured preview with the attachment");
  });

  it("chat messages persist snapshots and stream validates ownership before prompt injection", async () => {
    const iface = await readText("apps/web/src/components/ChatInterface.tsx");
    const sessions = await readText("apps/web/src/server/routers/sessions.ts");
    const route = await readText("apps/web/src/app/api/chat/stream/route.ts");

    assert.match(iface, /fileSnapshots/, "chat interface must keep snapshots in message metadata");
    assert.match(iface, /metadata: \{ fileSnapshots/, "user message create must persist snapshots as metadata");
    assert.match(iface, /buildFileSnapshotSystemBlock/, "chat interface must send snapshot context to stream route");
    assert.match(sessions, /metadata: z\.record/, "messages.create must accept metadata");
    assert.match(sessions, /metadata: input\.metadata/, "messages.create must persist metadata");
    assert.match(route, /fileSnapshots: requestedFileSnapshots/, "stream route must accept requested snapshots");
    assert.match(route, /filesTable/, "stream route must validate uploaded file ownership");
    assert.match(
      route,
      /eq\(filesTable\.userId, userId\)/,
      "stream route must scope file snapshots to the current user",
    );
    assert.match(route, /buildFileSnapshotSystemBlock/, "stream route must inject immutable snapshot context");
  });

  it("chat messages render clickable-looking file snapshot cards instead of raw tokens", async () => {
    const message = await readText("apps/web/src/components/ChatMessage.tsx");

    assert.match(message, /extractFileMentions/, "message rendering must parse file mention tokens");
    assert.match(message, /replaceFileMentionTokens/, "message rendering must hide raw file mention markdown");
    assert.match(message, /data-testid="file-mention-card"/, "message rendering must expose file mention cards");
    assert.match(message, /File snapshot/, "cards must label captured snapshots clearly");
  });

  it("browser spec covers file mention snapshot chips and rendered cards", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-h/file-mentions.spec.ts");

    assert.doesNotMatch(spec, /page\.setContent/, "browser coverage must run against the real app");
    assert.match(spec, /createE2ESessionWithAssistantMetadata/, "browser coverage must seed real chat metadata");
    assert.match(spec, /page\.goto\("\/"\)/, "browser coverage must navigate through the app shell");
    assert.match(spec, /setInputFiles/, "browser coverage must exercise the real composer file input");
    assert.match(spec, /api\/upload\/presigned/, "browser coverage must cover upload snapshot completion state");
    assert.match(spec, /fileSnapshots/, "browser coverage must render persisted file snapshot metadata");
    assert.match(spec, /file mention snapshots/i);
    assert.match(spec, /file-mention-chip/);
    assert.match(spec, /file-mention-card/);
  });
});

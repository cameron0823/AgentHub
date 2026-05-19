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

describe("Artifacts panel", () => {
  it("extracts fenced HTML, SVG, CSS, and React artifacts through a shared parser", async () => {
    const [serverArtifacts, sharedArtifacts] = await Promise.all([
      readText("apps/web/src/server/artifacts.ts"),
      readText("apps/web/src/lib/artifacts.ts"),
    ]);

    assert.match(serverArtifacts, /extractArtifactsFromContent/);
    assert.match(sharedArtifacts, /export function extractArtifactsFromContent/);
    for (const language of ["html", "svg", "css", "jsx", "tsx", "react"]) {
      assert.match(sharedArtifacts, new RegExp(language), `parser must recognize ${language}`);
    }
    assert.match(sharedArtifacts, /sanitizeArtifactHtml/, "preview HTML must be sanitized at extraction time");
    assert.match(sharedArtifacts, /previewHtml/, "artifacts must include safe preview metadata");
  });

  it("persists detected artifacts with assistant messages", async () => {
    const [schema, route, sessionsRouter] = await Promise.all([
      readText("apps/web/src/server/db/schema.ts"),
      readText("apps/web/src/app/api/chat/stream/route.ts"),
      readText("apps/web/src/server/routers/sessions.ts"),
    ]);

    assert.match(schema, /artifacts: jsonb\(\s*\"artifacts\"\)/, "messages table must retain artifact JSON");
    assert.match(route, /extractArtifactsFromContent/, "chat stream must detect artifacts from assistant content");
    assert.match(route, /contentArtifacts/, "chat stream must separate content artifacts from generated resources");
    assert.match(route, /artifacts: artifacts\.length > 0 \? artifacts : null/, "insert must persist all artifacts");
    assert.match(route, /metadata: savedMetadata/, "message metadata must include artifacts for reload");
    assert.match(sessionsRouter, /artifacts: msg\.artifacts/, "forked sessions must preserve artifact metadata");
    assert.match(sessionsRouter, /metadata: msg\.metadata/, "forked sessions must preserve reload metadata");
  });

  it("reloads artifacts into chat state and renders artifact launch controls", async () => {
    const [store, chatInterface, chatMessage, virtualized] = await Promise.all([
      readText("apps/web/src/stores/chatStore.ts"),
      readText("apps/web/src/components/ChatInterface.tsx"),
      readText("apps/web/src/components/ChatMessage.tsx"),
      readText("apps/web/src/components/VirtualizedMessageList.tsx"),
    ]);

    assert.match(store, /ChatArtifact/, "chat store must type durable artifacts");
    assert.match(store, /artifacts\?: ChatArtifact\[\]/, "messages must carry artifacts");
    assert.match(chatInterface, /parseMessageArtifacts/, "history reload must parse message artifacts");
    assert.match(
      chatInterface,
      /extractArtifactsFromContent/,
      "streaming completion must detect artifacts client-side",
    );
    assert.match(chatInterface, /ArtifactPanel/, "chat interface must render the right-side panel");
    assert.match(virtualized, /onOpenArtifact/, "message list must pass artifact open actions");
    assert.match(chatMessage, /Artifacts/, "assistant message must expose artifact controls");
  });

  it("artifact panel provides preview and code modes with sandboxed iframe rendering", async () => {
    const [panel, sharedPanel] = await Promise.all([
      readText("apps/web/src/components/ArtifactPanel.tsx"),
      readText("packages/ui/src/ArtifactPanel.tsx"),
    ]);

    assert.match(panel, /@agenthub\/ui/, "web artifact panel must use the shared UI package");
    assert.match(panel, /ARTIFACT_IFRAME_SANDBOX/, "web wrapper must inject the app sandbox policy");
    assert.match(panel, /sanitizeArtifactHtml/, "web wrapper must sanitize persisted preview HTML");
    assert.match(sharedPanel, /data-testid="artifact-panel"/);
    assert.match(sharedPanel, /Preview/);
    assert.match(sharedPanel, /Code/);
    assert.match(sharedPanel, /agenthub-artifact-preview/, "iframe preview must use a dedicated Trusted Types policy");
    assert.match(sharedPanel, /iframeRef\.current\.srcdoc/, "iframe srcdoc must be assigned through the TT policy");
    assert.match(sharedPanel, /sandbox=\{iframeSandbox\}/);
    assert.match(sharedPanel, /referrerPolicy="no-referrer"/);
  });

  it("browser spec covers the artifact preview panel", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-h/artifacts.spec.ts");

    assert.match(spec, /page\.goto\("\/"\)/, "browser coverage must navigate to the real app");
    assert.doesNotMatch(spec, /page\.setContent/, "browser coverage must not use synthetic HTML");
    assert.match(spec, /Artifacts/);
    assert.match(spec, /Preview/);
    assert.match(spec, /Code/);
    assert.match(spec, /artifact-panel/);
  });
});

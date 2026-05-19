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

describe("P38.4 in-chat file viewer", () => {
  it("RagSource carries document preview metadata from retrieval to chat", async () => {
    const store = await readText("apps/web/src/stores/chatStore.ts");
    assert.match(store, /sourceName\?: string/, "RagSource must include source display name");
    assert.match(store, /sourceType\?: string/, "RagSource must include parsed source type");
    assert.match(store, /mimeType\?: string/, "RagSource must include mime type for viewer routing");
    assert.match(store, /sourceUrl\?: string/, "RagSource must include document URL when available");
    assert.match(store, /citation\?: string/, "RagSource must preserve cited chunk label");
    assert.match(
      store,
      /metadata\?: Record<string, unknown>/,
      "RagSource must preserve chunk metadata for page/line jumps",
    );
  });

  it("chat stream emits enriched RAG source metadata", async () => {
    const route = await readText("apps/web/src/app/api/chat/stream/route.ts");
    assert.match(route, /sourceName: r\.sourceName/, "streamed sources must include document name");
    assert.match(route, /mimeType: r\.mimeType/, "streamed sources must include MIME type");
    assert.match(route, /sourceUrl: r\.sourceUrl/, "streamed sources must include preview URL");
    assert.match(route, /citation: r\.citation/, "streamed sources must include citation label");
    assert.match(route, /metadata: r\.metadata/, "streamed sources must include chunk metadata");
  });

  it("hybrid search joins source document fields needed by the viewer", async () => {
    const search = await readText("apps/web/src/server/kb-search.ts");
    assert.match(search, /mimeType\?: string/, "search result must expose MIME type");
    assert.match(search, /sourceUrl\?: string/, "search result must expose source URL");
    assert.match(search, /d\.mime_type AS mime_type/, "SQL search must select document MIME type");
    assert.match(search, /d\.s3_url AS source_url/, "SQL search must select document source URL");
  });

  it("citation links open the source viewer at the cited chunk", async () => {
    const message = await readText("apps/web/src/components/ChatMessage.tsx");
    assert.match(message, /KnowledgeSourceViewer/, "ChatMessage must render the source viewer");
    assert.match(message, /activeSourceIndex/, "ChatMessage must track the active cited source");
    assert.match(message, /handleOpenCitation/, "ChatMessage must handle citation clicks");
    assert.match(message, /data-testid="citation-jump-link"/, "citation click targets must be testable");
    assert.match(message, /data-testid="rag-source-open"/, "source cards must also open the viewer");
  });

  it("source viewer supports PDF, code, image, office, and extracted text previews", async () => {
    const viewer = await readText("apps/web/src/components/KnowledgeSourceViewer.tsx");
    assert.match(viewer, /data-testid="kb-file-viewer"/, "viewer must have stable test id");
    assert.match(viewer, /data-viewer-kind/, "viewer must expose selected preview kind");
    assert.match(viewer, /#page=\$\{pageNumber\}/, "PDF viewer must jump to cited page");
    assert.match(viewer, /SyntaxHighlighter/, "code viewer must use syntax highlighting");
    assert.match(viewer, /<img/, "image viewer must render image previews");
    assert.match(viewer, /office-preview/, "Office documents must use extracted-text previews");
    assert.match(viewer, /source\.content/, "viewer must show the cited chunk text");
  });

  it("KB file viewer browser spec uses persisted RAG metadata", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-h/kb-file-viewer.spec.ts");
    assert.match(spec, /createE2ESessionWithAssistantMetadata/, "browser coverage must seed real chat metadata");
    assert.match(spec, /page\.goto\("\/"\)/, "browser coverage must navigate to the real app");
    assert.doesNotMatch(spec, /page\.setContent/, "browser coverage must not use synthetic HTML");
    assert.match(spec, /citation-jump-link/, "browser coverage must exercise citation links");
    assert.match(spec, /rag-source-open/, "browser coverage must expose source cards");
  });
});

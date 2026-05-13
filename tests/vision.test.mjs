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

describe("Vision / image input", () => {
  it("ContentPart type defined in provider types", async () => {
    const types = await readText("packages/ai-providers/src/types.ts");
    assert.match(types, /ContentPart/, "ContentPart type must be exported");
    assert.match(types, /type.*text.*text.*string/, "text ContentPart must have text field");
    assert.match(types, /type.*image_url.*url.*string/, "image_url ContentPart must have url field");
  });

  it("Message.content accepts ContentPart array", async () => {
    const types = await readText("packages/ai-providers/src/types.ts");
    assert.match(types, /content.*string.*ContentPart\[\]/, "content must be string | ContentPart[]");
  });

  it("OpenAI provider maps image_url parts to OpenAI image_url format", async () => {
    const provider = await readText("packages/ai-providers/src/providers/openai.ts");
    assert.match(provider, /serializeContent/, "must have serializeContent helper");
    assert.match(provider, /image_url.*image_url.*url/, "must map image_url parts to OpenAI format");
  });

  it("Ollama provider extracts image URLs into images field for vision models", async () => {
    const provider = await readText("packages/ai-providers/src/providers/ollama.ts");
    assert.match(provider, /images.*imageParts/, "must set images field for Ollama");
    assert.match(provider, /type.*image_url/, "must filter image_url content parts");
  });

  it("Anthropic provider maps image_url parts to Anthropic source format", async () => {
    const provider = await readText("packages/ai-providers/src/providers/anthropic.ts");
    assert.match(provider, /type.*image.*source.*type.*url/, "must use Anthropic image source format");
  });

  it("ChatInterface builds ContentPart array for image attachments", async () => {
    const iface = await readText("apps/web/src/components/ChatInterface.tsx");
    assert.match(iface, /imageAttachments/, "must detect image attachments");
    assert.match(iface, /type.*image_url.*url.*a\.url/, "must build image_url parts from attachment URL");
  });

  it("ChatInterface sends text links for non-image file attachments", async () => {
    const iface = await readText("apps/web/src/components/ChatInterface.tsx");
    assert.match(iface, /fileOnlyAttachments/, "must separate non-image attachments");
    assert.match(iface, /Attached files/, "must format non-image files as text links");
  });

  it("ChatInterface passes content parts in session messages to stream API", async () => {
    const iface = await readText("apps/web/src/components/ChatInterface.tsx");
    assert.match(iface, /messageContent/, "messageContent must be built");
    assert.match(iface, /content.*m\.content/, "session messages must use m.content (passes array through)");
  });
});

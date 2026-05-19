import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("provider layer exposes image generation contracts and catalog capability", async () => {
  const types = await readText("packages/ai-providers/src/types.ts");
  const catalog = await readText("packages/ai-providers/src/catalog.ts");
  const index = await readText("packages/ai-providers/src/index.ts");

  assert.match(types, /export interface ImageGenerationOptions/);
  assert.match(types, /export interface ImageGenerationResponse/);
  assert.match(types, /createImage\?/);
  assert.match(catalog, /"imageGeneration"/);
  assert.match(index, /image-generation/);
});

test("OpenAI and OpenAI-compatible providers implement image generation endpoint normalization", async () => {
  const openai = await readText("packages/ai-providers/src/providers/openai.ts");
  const compatible = await readText("packages/ai-providers/src/providers/openai-compatible.ts");
  const helpers = await readText("packages/ai-providers/src/image-generation.ts");

  assert.match(openai, /createImage/);
  assert.match(openai, /\/v1\/images\/generations/);
  assert.match(openai, /normalizeImageGenerationResponse/);
  assert.match(compatible, /createImage/);
  assert.match(compatible, /\/images\/generations/);
  assert.match(helpers, /gpt-image-1/);
  assert.match(helpers, /b64_json/);
  assert.match(helpers, /revised_prompt/);
});

test("agent runtime exposes a generate_image tool backed by provider createImage", async () => {
  const tool = await readText("packages/agent-runtime/src/tools/builtin/image-generation.ts");
  const index = await readText("packages/agent-runtime/src/index.ts");

  assert.match(tool, /name: "generate_image"/);
  assert.match(tool, /providerRegistry/);
  assert.match(tool, /createImage/);
  assert.match(tool, /GeneratedImageToolResult/);
  assert.match(index, /image-generation/);
});

test("chat stream injects image generation tool and persists generated resources", async () => {
  const route = await readText("apps/web/src/app/api/chat/stream/route.ts");
  const schema = await readText("apps/web/src/server/db/schema.ts");
  const migration = await readText("apps/web/drizzle/0008_resources.sql");

  assert.match(route, /imageGenerationTool/);
  assert.match(route, /shouldInjectImageGenerationTool/);
  assert.match(route, /generatedResources/);
  assert.match(route, /resources/);
  assert.match(schema, /export const resources/);
  assert.match(schema, /source_message_id/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS resources/);
});

test("chat UI renders generated image resources from metadata and tool output", async () => {
  const store = await readText("apps/web/src/stores/chatStore.ts");
  const chatInterface = await readText("apps/web/src/components/ChatInterface.tsx");
  const chatMessage = await readText("apps/web/src/components/ChatMessage.tsx");
  const toolCallCard = await readText("packages/ui/src/ToolCallCard.tsx");

  assert.match(store, /GeneratedResource/);
  assert.match(store, /generatedResources/);
  assert.match(chatInterface, /generatedResources/);
  assert.match(chatMessage, /Generated Images/);
  assert.match(chatMessage, /generatedResources\.map/);
  assert.match(toolCallCard, /isGeneratedImageResult/);
});

test("image generation browser spec uses persisted chat metadata", async () => {
  const spec = await readText("apps/web/tests/e2e/specs/phase-h/image-generation.spec.ts");

  assert.match(spec, /createE2ESessionWithAssistantMetadata/, "browser coverage must seed real chat metadata");
  assert.match(spec, /page\.goto\("\/"\)/, "browser coverage must navigate to the real app");
  assert.doesNotMatch(spec, /page\.setContent/, "browser coverage must not use synthetic HTML");
  assert.match(spec, /Generated Images/);
  assert.match(spec, /A generated dashboard concept/);
});

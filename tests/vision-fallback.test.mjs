import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("media safety validates remote image URLs and blocks private network targets", async () => {
  const [safety, outbound] = await Promise.all([
    readText("apps/web/src/server/media-safety.ts"),
    readText("apps/web/src/server/security/outbound.ts"),
  ]);

  assert.match(safety, /export function validateMediaUrl/);
  assert.match(safety, /validateOutboundUrl/);
  assert.match(outbound, /new URL\(raw\)/);
  assert.match(outbound, /\["http:", "https:"\]\.includes\(parsed\.protocol\)/);
  assert.match(outbound, /isPrivateHostname/);
  assert.match(safety, /AGENTHUB_ALLOW_PRIVATE_MEDIA_URLS/);
  assert.match(safety, /trustedOrigins/);
  for (const blocked of ["localhost", "127.", "10.", "192.168", "169.254"]) {
    assert.match(outbound, new RegExp(blocked.replace(".", "\\.")), `must account for ${blocked}`);
  }
});

test("model capability helpers distinguish native vision from tool-capable fallback models", async () => {
  const capabilities = await readText("packages/ai-providers/src/capabilities.ts");

  assert.match(capabilities, /export function inferModelCapabilities/);
  assert.match(capabilities, /export function modelSupportsCapability/);
  assert.match(capabilities, /toolCalling/);
  assert.match(capabilities, /"vision"/);
  assert.match(capabilities, /gpt-4o/);
  assert.match(capabilities, /o3-mini/);
});

test("visual_understanding tool delegates to a configured vision-capable provider", async () => {
  const tool = await readText("packages/agent-runtime/src/tools/builtin/visual-understanding.ts");
  const index = await readText("packages/agent-runtime/src/index.ts");

  assert.match(tool, /name:\s*"visual_understanding"/);
  assert.match(tool, /AGENTHUB_VISUAL_UNDERSTANDING_MODEL/);
  assert.match(tool, /providerRegistry\.resolveModel/);
  assert.match(tool, /image_url/);
  assert.match(tool, /imageUrl/);
  assert.match(tool, /ocr/);
  assert.match(index, /visualUnderstandingTool/);
});

test("chat stream validates image media and injects vision fallback only when needed", async () => {
  const route = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(route, /validateMessageMedia/);
  assert.match(route, /modelSupportsCapability/);
  assert.match(route, /visualUnderstandingTool/);
  assert.match(route, /hasImageContent/);
  assert.match(route, /prepareVisionFallbackMessages/);
  assert.match(route, /!modelSupportsCapability\(routedModel, "vision"\)/);
  assert.match(route, /modelSupportsCapability\(routedModel, "tools"\)/);
  assert.match(route, /visual_understanding/);
});

test("chat input exposes image analysis mode and uses uploadUrl plus s3Url from presign API", async () => {
  const input = await readText("apps/web/src/components/ChatInput.tsx");
  const spec = await readText("apps/web/tests/e2e/specs/phase-h/vision-fallback.spec.ts");

  assert.match(input, /Image analysis/);
  assert.match(input, /uploadUrl/);
  assert.match(input, /s3Url/);
  assert.match(input, /size: attachment\.file\.size/);
  assert.match(spec, /vision fallback/i);
  assert.match(spec, /setInputFiles/);
});

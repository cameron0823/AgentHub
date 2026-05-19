import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("local media providers cover Piper TTS and faster-whisper STT", async () => {
  const [localMedia, registry, catalog, ttsRoute, sttRoute, agentBuilder, ttsButton, voiceInput] = await Promise.all([
    readText("packages/ai-providers/src/providers/local-media.ts"),
    readText("packages/ai-providers/src/registry.ts"),
    readText("packages/ai-providers/src/catalog.ts"),
    readText("apps/web/src/app/api/voice/tts/route.ts"),
    readText("apps/web/src/app/api/voice/stt/route.ts"),
    readText("apps/web/src/components/AgentBuilder.tsx"),
    readText("apps/web/src/components/TTSButton.tsx"),
    readText("apps/web/src/components/VoiceInput.tsx"),
  ]);

  assert.match(localMedia, /export class PiperProvider/);
  assert.match(localMedia, /\/api\/tts\/piper/);
  assert.match(localMedia, /export class FasterWhisperProvider/);
  assert.match(localMedia, /\/api\/stt\/transcribe/);
  assert.match(registry, /new PiperProvider\(\)/);
  assert.match(registry, /new FasterWhisperProvider\(\)/);
  assert.match(catalog, /id: "piper"/);
  assert.match(catalog, /id: "faster-whisper"/);
  assert.match(ttsRoute, /textToSpeech/);
  assert.match(sttRoute, /speechToText/);
  assert.match(agentBuilder, /Piper local TTS/);
  assert.match(agentBuilder, /faster-whisper local STT/);
  assert.match(ttsButton, /providerBacked/);
  assert.match(voiceInput, /providerId !== "browser"/);
});

test("local image providers cover ComfyUI and A1111 workflow integration", async () => {
  const [localMedia, registry, catalog, imageTool] = await Promise.all([
    readText("packages/ai-providers/src/providers/local-media.ts"),
    readText("packages/ai-providers/src/registry.ts"),
    readText("packages/ai-providers/src/catalog.ts"),
    readText("packages/agent-runtime/src/tools/builtin/image-generation.ts"),
  ]);

  assert.match(localMedia, /export const COMFYUI_TEXT_TO_IMAGE_TEMPLATE/);
  assert.match(localMedia, /_meta: \{ title: "positive_prompt" \}/);
  assert.match(localMedia, /injectComfyUIWorkflowInputs/);
  assert.match(localMedia, /POST/);
  assert.match(localMedia, /\/prompt/);
  assert.match(localMedia, /\/history\/\$\{encodeURIComponent\(promptId\)\}/);
  assert.match(localMedia, /export const A1111_TEXT_TO_IMAGE_TEMPLATE/);
  assert.match(localMedia, /buildA1111Txt2ImgPayload/);
  assert.match(localMedia, /\/sdapi\/v1\/txt2img/);
  assert.match(registry, /new ComfyUIProvider\(\)/);
  assert.match(registry, /new A1111Provider\(\)/);
  assert.match(catalog, /id: "comfyui"/);
  assert.match(catalog, /id: "a1111"/);
  assert.match(imageTool, /resolveImageProvider/);
  assert.match(imageTool, /createImage/);
});

test("generated-image queue status is visible in Settings", async () => {
  const [route, component, settings, phaseSpec] = await Promise.all([
    readText("apps/web/src/app/api/queues/image-generation/status/route.ts"),
    readText("apps/web/src/components/LocalMediaSettings.tsx"),
    readText("apps/web/src/app/settings/page.tsx"),
    readText("apps/web/tests/e2e/specs/phase-h/local-media-services.spec.ts"),
  ]);

  assert.match(route, /imageGenerationQueue\.getJobCounts/);
  assert.match(route, /queue: "image-generation"/);
  assert.match(component, /data-testid="local-media-settings"/);
  assert.match(component, /Generated-image queue/);
  assert.match(component, /new EventSource\("\/api\/queues\/progress"\)/);
  assert.match(component, /\/api\/queues\/image-generation\/status/);
  assert.match(settings, /LocalMediaSettings/);
  assert.match(phaseSpec, /local-media-settings/);
  assert.match(phaseSpec, /Generated-image queue/);
});

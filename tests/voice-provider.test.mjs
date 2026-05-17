import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("provider types expose TTS and STT operations", async () => {
  const types = await readText("packages/ai-providers/src/types.ts");
  const catalog = await readText("packages/ai-providers/src/catalog.ts");

  assert.match(types, /export interface TextToSpeechOptions/);
  assert.match(types, /export interface SpeechToTextOptions/);
  assert.match(types, /textToSpeech\?/);
  assert.match(types, /speechToText\?/);
  assert.match(catalog, /"tts"/);
  assert.match(catalog, /"stt"/);
});

test("OpenAI provider supports audio speech and transcription endpoints", async () => {
  const openai = await readText("packages/ai-providers/src/providers/openai.ts");

  assert.match(openai, /textToSpeech/);
  assert.match(openai, /speechToText/);
  assert.match(openai, /\/v1\/audio\/speech/);
  assert.match(openai, /\/v1\/audio\/transcriptions/);
  assert.match(openai, /tts-1/);
  assert.match(openai, /whisper-1/);
});

test("voice API routes authenticate, load credentials, and call provider audio methods", async () => {
  const ttsRoute = await readText("apps/web/src/app/api/voice/tts/route.ts");
  const sttRoute = await readText("apps/web/src/app/api/voice/stt/route.ts");

  assert.match(ttsRoute, /auth\(req\.headers\)/);
  assert.match(ttsRoute, /providerRegistry\.forUser/);
  assert.match(ttsRoute, /textToSpeech/);
  assert.match(ttsRoute, /audio\/mpeg/);
  assert.match(sttRoute, /auth\(req\.headers\)/);
  assert.match(sttRoute, /providerRegistry\.forUser/);
  assert.match(sttRoute, /speechToText/);
  assert.match(sttRoute, /formData/);
});

test("agents persist per-agent voice settings", async () => {
  const schema = await readText("apps/web/src/server/db/schema.ts");
  const router = await readText("apps/web/src/server/routers/agents.ts");
  const migration = await readText("apps/web/drizzle/0007_voice_settings.sql");

  for (const field of ["voiceProvider", "voiceId", "voiceSpeed", "sttProvider", "handsFreeVoice"]) {
    assert.match(schema, new RegExp(field));
    assert.match(router, new RegExp(field));
  }
  assert.match(migration, /voice_provider/);
  assert.match(migration, /voice_speed/);
});

test("voice UI uses provider routes with browser fallback and playback controls", async () => {
  const ttsButton = await readText("apps/web/src/components/TTSButton.tsx");
  const voiceControls = await readText("packages/ui/src/VoicePlaybackControls.tsx");
  const voiceInput = await readText("apps/web/src/components/VoiceInput.tsx");
  const builder = await readText("apps/web/src/components/AgentBuilder.tsx");

  assert.match(ttsButton, /\/api\/voice\/tts/);
  assert.match(ttsButton, /audioCache/);
  assert.match(ttsButton, /speechSynthesis/);
  assert.match(ttsButton, /getVoices/);
  assert.match(ttsButton, /VoicePlaybackControls/);
  assert.match(voiceControls, /download/);
  assert.match(voiceControls, /Playback speed/);
  assert.match(voiceControls, /audioRef/);
  assert.match(voiceInput, /MediaRecorder/);
  assert.match(voiceInput, /\/api\/voice\/stt/);
  assert.match(voiceInput, /SpeechRecognition/);
  assert.match(builder, /Voice conversations/);
  assert.match(builder, /Microsoft Edge Speech/);
  assert.match(builder, /Speech-to-text provider/);
});

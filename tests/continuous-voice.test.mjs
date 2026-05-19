import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("continuous voice input loops browser recognition and pauses around playback", async () => {
  const [voiceInput, ttsButton] = await Promise.all([
    readText("apps/web/src/components/VoiceInput.tsx"),
    readText("apps/web/src/components/TTSButton.tsx"),
  ]);

  assert.match(voiceInput, /continuous\?: boolean/);
  assert.match(voiceInput, /continuousActiveRef/);
  assert.match(voiceInput, /r\.continuous = continuousMode/);
  assert.match(voiceInput, /window\.setTimeout\(\(\) => startBrowserRecognition\(true\), 250\)/);
  assert.match(voiceInput, /agenthub:voice-playback/);
  assert.match(voiceInput, /pausedForPlaybackRef/);
  assert.match(ttsButton, /agenthub:voice-playback/);
  assert.match(ttsButton, /detail: \{ speaking \}/);
});

test("ChatInput auto-submits hands-free transcripts without attachments", async () => {
  const chatInput = await readText("apps/web/src/components/ChatInput.tsx");

  assert.match(chatInput, /activeAgent\?\.handsFreeVoice/);
  assert.match(chatInput, /handleVoiceTranscript/);
  assert.match(chatInput, /const canAutoSend = handsFreeVoice && !isGenerating && attachments\.length === 0/);
  assert.match(chatInput, /onSend\(transcript, \[\]\)/);
  assert.match(chatInput, /continuous=\{handsFreeVoice\}/);
  assert.match(chatInput, /disabled=\{isGenerating \|\| attachments\.some/);
});

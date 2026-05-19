import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

test("P43.2 reusable UI package exposes AIGC component exports", async () => {
  const [pkg, index, tsconfig] = await Promise.all([
    readJson("packages/ui/package.json"),
    readText("packages/ui/src/index.ts"),
    readText("packages/ui/tsconfig.json"),
  ]);

  assert.equal(pkg.name, "@agenthub/ui");
  assert.equal(pkg.main, "./src/index.ts");
  assert.match(pkg.scripts.typecheck, /tsc --noEmit/);
  assert.match(pkg.scripts.build, /tsc/);
  assert.match(tsconfig, /"jsx": "react-jsx"/);

  for (const exported of [
    "ArtifactPanel",
    "MarkdownCodeBlock",
    "ModelSelectorView",
    "ToolCallCard",
    "VoicePlaybackControls",
  ]) {
    assert.match(index, new RegExp(exported), `@agenthub/ui must export ${exported}`);
  }
});

test("P43.2 web app consumes reusable UI package from app-specific wrappers", async () => {
  const [chatMessage, modelSelector, toolCallCard, artifactPanel, ttsButton, webTsconfig, nextConfig] =
    await Promise.all([
      readText("apps/web/src/components/ChatMessage.tsx"),
      readText("apps/web/src/components/ModelSelector.tsx"),
      readText("apps/web/src/components/ToolCallCard.tsx"),
      readText("apps/web/src/components/ArtifactPanel.tsx"),
      readText("apps/web/src/components/TTSButton.tsx"),
      readText("apps/web/tsconfig.json"),
      readText("apps/web/next.config.js"),
    ]);

  assert.match(chatMessage, /MarkdownCodeBlock/, "chat messages must use shared markdown rendering");
  assert.match(modelSelector, /ModelSelectorView/, "model selector wrapper must use shared view");
  assert.match(toolCallCard, /@agenthub\/ui/, "tool call card must come from shared UI package");
  assert.match(artifactPanel, /@agenthub\/ui/, "artifact panel wrapper must use shared UI package");
  assert.match(ttsButton, /VoicePlaybackControls/, "voice UI wrapper must use shared controls");
  assert.match(webTsconfig, /"@agenthub\/ui"/, "web tsconfig must resolve @agenthub/ui");
  assert.match(
    nextConfig,
    /transpilePackages:\s*\[[^\]]*"@agenthub\/ui"/,
    "Next must transpile the workspace UI package",
  );
});

test("P43.2 shared UI package keeps app-specific integrations out", async () => {
  const uiFiles = await Promise.all([
    readText("packages/ui/src/ArtifactPanel.tsx"),
    readText("packages/ui/src/ModelSelectorView.tsx"),
    readText("packages/ui/src/ToolCallCard.tsx"),
    readText("packages/ui/src/VoicePlaybackControls.tsx"),
    readText("packages/ui/src/MarkdownCodeBlock.tsx"),
  ]);
  const combined = uiFiles.join("\n");

  assert.doesNotMatch(combined, /@\/lib\/trpc/, "shared UI must not import app tRPC");
  assert.doesNotMatch(combined, /@\/stores\/chatStore/, "shared UI must not import app store");
  assert.doesNotMatch(combined, /\/api\/voice\/tts/, "shared voice controls must not call app APIs directly");
  assert.doesNotMatch(
    combined,
    /ARTIFACT_IFRAME_SANDBOX/,
    "shared artifact panel must accept sandbox policy as a prop",
  );
});

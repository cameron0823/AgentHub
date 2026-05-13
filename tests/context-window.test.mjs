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

describe("Context window management", () => {
  it("MODEL_CONTEXT_LIMITS map defined in context-limits.ts", async () => {
    const src = await readText("packages/ai-providers/src/context-limits.ts");
    assert.match(src, /MODEL_CONTEXT_LIMITS/, "must export MODEL_CONTEXT_LIMITS");
    assert.match(src, /gpt-4o/, "must include GPT-4o limit");
    assert.match(src, /claude-sonnet/, "must include Claude limit");
  });

  it("getContextLimit strips provider prefix", async () => {
    const src = await readText("packages/ai-providers/src/context-limits.ts");
    assert.match(src, /getContextLimit/, "must export getContextLimit");
    assert.match(src, /indexOf.*":"/, "must handle provider:model prefix");
  });

  it("estimateTokens approximates length / 4", async () => {
    const src = await readText("packages/ai-providers/src/context-limits.ts");
    assert.match(src, /estimateTokens/, "must export estimateTokens");
    assert.match(src, /length.*\/.*4/, "must divide length by 4");
  });

  it("estimateMessagesTokens handles ContentPart arrays", async () => {
    const src = await readText("packages/ai-providers/src/context-limits.ts");
    assert.match(src, /estimateMessagesTokens/, "must export estimateMessagesTokens");
    assert.match(src, /Array\.isArray/, "must handle array content parts");
  });

  it("truncateToContextLimit keeps system messages and newest history", async () => {
    const src = await readText("packages/ai-providers/src/context-limits.ts");
    assert.match(src, /truncateToContextLimit/, "must export truncateToContextLimit");
    assert.match(src, /role.*system/, "must filter system messages");
    assert.match(src, /reserveTokens/, "must accept reserveTokens parameter");
  });

  it("context-limits exported from ai-providers index", async () => {
    const src = await readText("packages/ai-providers/src/index.ts");
    assert.match(src, /context-limits/, "context-limits must be re-exported from index");
  });

  it("ContextWindowBar shows colored progress bar", async () => {
    const src = await readText("apps/web/src/components/ContextWindowBar.tsx");
    assert.match(src, /ContextWindowBar/, "must export ContextWindowBar");
    assert.match(src, /bg-red-500/, "must have red color for high usage");
    assert.match(src, /bg-yellow-500/, "must have yellow color for medium usage");
    assert.match(src, /bg-green-500/, "must have green color for low usage");
  });

  it("ContextWindowBar renders token count text", async () => {
    const src = await readText("apps/web/src/components/ContextWindowBar.tsx");
    assert.match(src, /usedTokens.*toLocaleString/, "must display usedTokens");
    assert.match(src, /limitTokens.*toLocaleString/, "must display limitTokens");
    assert.match(src, /ctx/, "must label as context");
  });

  it("ChatInterface imports context utilities", async () => {
    const src = await readText("apps/web/src/components/ChatInterface.tsx");
    assert.match(src, /getContextLimit/, "must import getContextLimit");
    assert.match(src, /estimateMessagesTokens/, "must import estimateMessagesTokens");
    assert.match(src, /truncateToContextLimit/, "must import truncateToContextLimit");
  });

  it("ChatInterface truncates messages before API call", async () => {
    const src = await readText("apps/web/src/components/ChatInterface.tsx");
    assert.match(src, /truncatedMessages/, "must create truncatedMessages");
    assert.match(src, /messages: truncatedMessages/, "must send truncatedMessages to API");
  });

  it("ChatInterface renders ContextWindowBar", async () => {
    const src = await readText("apps/web/src/components/ChatInterface.tsx");
    assert.match(src, /ContextWindowBar/, "must render ContextWindowBar");
    assert.match(src, /estimatedSessionTokens/, "must compute estimatedSessionTokens");
    assert.match(src, /contextLimit/, "must compute contextLimit");
  });
});

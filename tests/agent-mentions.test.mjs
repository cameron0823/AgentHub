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

describe("Inline agent mentions", () => {
  it("defines a markdown-compatible agent mention parser and context block", async () => {
    const src = await readText("apps/web/src/lib/agent-mentions.ts");

    assert.match(src, /AGENT_MENTION_PATTERN/);
    assert.match(src, /@\\\[/, "mention syntax must use @[Name](agent:id)");
    assert.match(src, /agent:/);
    assert.match(src, /extractAgentMentions/);
    assert.match(src, /formatAgentMentionToken/);
    assert.match(src, /buildMentionedAgentSystemBlock/);
    assert.match(src, /mentioned-agent/);
  });

  it("chat input autocompletes local agents and inserts mention tokens", async () => {
    const src = await readText("apps/web/src/components/ChatInput.tsx");

    assert.match(src, /trpc\.agents\.list\.useQuery/);
    assert.match(src, /agentMentionQuery/);
    assert.match(src, /data-testid="agent-mention-menu"/);
    assert.match(src, /data-testid="agent-mention-option"/);
    assert.match(src, /formatAgentMentionToken/);
    assert.match(src, /@\s+for agents|@ for agents/);
  });

  it("chat messages render clickable profile cards for mentioned agents", async () => {
    const src = await readText("apps/web/src/components/ChatMessage.tsx");

    assert.match(src, /extractAgentMentions/);
    assert.match(src, /data-testid="agent-mention-card"/);
    assert.match(src, /Mentioned agent/);
    assert.match(src, /setActiveAgent/);
    assert.match(src, /setMainView\("agent-builder"\)/);
  });

  it("chat stream validates ownership and routes execution through the primary mentioned agent", async () => {
    const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

    assert.match(src, /extractAgentMentions/);
    assert.match(src, /buildMentionedAgentSystemBlock/);
    assert.match(src, /mentionedAgents/);
    assert.match(src, /runtimeAgent/);
    assert.match(src, /inArray\(agents\.id/);
    assert.match(src, /eq\(agents\.userId, session\.user\.id\)/);
    assert.match(src, /Mentioned agent not found/);
    assert.match(src, /agent_mentions/);
  });

  it("browser spec covers mention autocomplete, card rendering, and routed invocation", async () => {
    const src = await readText("apps/web/tests/e2e/specs/phase-h/agent-mentions.spec.ts");

    assert.match(src, /agent-mention-menu/);
    assert.match(src, /agent-mention-option/);
    assert.match(src, /agent-mention-card/);
    assert.match(src, /@\\\[Research Agent\\\]\(agent:/);
    assert.match(src, /mentioned-agent/);
  });
});

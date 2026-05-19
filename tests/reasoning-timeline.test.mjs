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

describe("Reasoning timeline", () => {
  it("defines structured reasoning timeline events without hidden reasoning content", async () => {
    const [providerTypes, runtimeTypes] = await Promise.all([
      readText("packages/ai-providers/src/types.ts"),
      readText("packages/agent-runtime/src/types.ts"),
    ]);

    assert.match(providerTypes, /export interface ReasoningTimelineEvent/);
    assert.match(providerTypes, /visibility: "provider-visible" \| "metadata-only" \| "redacted"/);
    assert.match(providerTypes, /type: "content" \| "reasoning" \| "reasoning_event" \| "tool_call" \| "done"/);
    assert.match(runtimeTypes, /ReasoningTimelineEvent/);
    assert.doesNotMatch(providerTypes, /hiddenChainOfThought|privateReasoning|chainOfThought/);
  });

  it("runtime emits duration-aware reasoning and tool timeline events", async () => {
    const runtime = await readText("packages/agent-runtime/src/runtime.ts");

    assert.match(runtime, /reasoning_event/);
    assert.match(runtime, /durationMs/);
    assert.match(runtime, /tool_decision/);
    assert.match(runtime, /tool_execution/);
    assert.match(runtime, /provider-visible/);
  });

  it("chat stream persists reasoning timeline metadata and forwards timeline SSE chunks", async () => {
    const route = await readText("apps/web/src/app/api/chat/stream/route.ts");

    assert.match(route, /reasoningTimeline/);
    assert.match(route, /chunk\.type === "reasoning_event"/);
    assert.match(route, /metadata: savedMetadata/);
    assert.match(route, /reasoningTimeline: reasoningTimeline/);
  });

  it("chat state hydrates and updates reasoning timeline events", async () => {
    const [store, chatInterface] = await Promise.all([
      readText("apps/web/src/stores/chatStore.ts"),
      readText("apps/web/src/components/ChatInterface.tsx"),
    ]);

    assert.match(store, /reasoningTimeline\?: ReasoningTimelineEvent\[\]/);
    assert.match(chatInterface, /parseReasoningTimeline/);
    assert.match(chatInterface, /mergeReasoningTimeline/);
    assert.match(chatInterface, /chunk\.type === "reasoning_event"/);
  });

  it("chat messages render a collapsible timeline instead of the raw Thinking block", async () => {
    const [timeline, chatMessage] = await Promise.all([
      readText("apps/web/src/components/ReasoningTimeline.tsx"),
      readText("apps/web/src/components/ChatMessage.tsx"),
    ]);

    assert.match(timeline, /data-testid="reasoning-timeline"/);
    assert.match(timeline, /durationMs/);
    assert.match(timeline, /Provider-visible/);
    assert.match(timeline, /details/);
    assert.match(chatMessage, /ReasoningTimeline/);
    assert.doesNotMatch(chatMessage, />Thinking\.\.\.</);
  });

  it("browser spec covers reasoning timeline collapse and duration display", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-h/reasoning-timeline.spec.ts");

    assert.match(spec, /page\.goto\("\/"\)/, "browser coverage must navigate to the real app");
    assert.doesNotMatch(spec, /page\.setContent/, "browser coverage must not use synthetic HTML");
    assert.match(spec, /reasoning-timeline/);
    assert.match(spec, /Provider-visible/);
    assert.match(spec, /23ms/);
    assert.match(spec, /toBeHidden/);
  });
});

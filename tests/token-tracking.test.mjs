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

describe("Token usage tracking", () => {
  it("ChatMessage type includes tokensUsed and latencyMs", async () => {
    const store = await readText("apps/web/src/stores/chatStore.ts");
    assert.match(store, /tokensUsed\?.*number.*null/, "tokensUsed must be optional number|null on ChatMessage");
    assert.match(store, /latencyMs\?.*number.*null/, "latencyMs must be optional number|null on ChatMessage");
  });

  it("stream route emits tokensUsed and latencyMs in done event", async () => {
    const route = await readText("apps/web/src/app/api/chat/stream/route.ts");
    assert.match(route, /type.*done.*tokensUsed/, "done event must include tokensUsed");
    assert.match(route, /type.*done.*latencyMs/, "done event must include latencyMs");
  });

  it("ChatInterface captures token stats from done event", async () => {
    const iface = await readText("apps/web/src/components/ChatInterface.tsx");
    assert.match(iface, /chunk.*tokensUsed/, "ChatInterface must read tokensUsed from done chunk");
    assert.match(iface, /chunk.*latencyMs/, "ChatInterface must read latencyMs from done chunk");
  });

  it("ChatMessage maps tokensUsed and latencyMs from DB messages", async () => {
    const iface = await readText("apps/web/src/components/ChatInterface.tsx");
    assert.match(iface, /tokensUsed.*message\.tokensUsed/, "DB messages must map tokensUsed into store");
    assert.match(iface, /latencyMs.*message\.latencyMs/, "DB messages must map latencyMs into store");
  });

  it("ChatMessage renders token stats badge on completed assistant messages", async () => {
    const component = await readText("apps/web/src/components/ChatMessage.tsx");
    assert.match(component, /tokensUsed.*tok/, "must display token count with 'tok' label");
    assert.match(component, /latencyMs.*1000.*toFixed/, "must display latency in seconds");
    assert.match(component, /isStreaming.*tokensUsed.*latencyMs/, "badge only shown when not streaming");
  });

  it("schema has tokens_used and latency_ms integer columns on messages", async () => {
    const schema = await readText("apps/web/src/server/db/schema.ts");
    assert.match(schema, /tokens_used/, "tokens_used column must exist");
    assert.match(schema, /latency_ms/, "latency_ms column must exist");
    assert.match(schema, /tokensUsed.*integer.*tokens_used/, "tokensUsed must be integer column");
    assert.match(schema, /latencyMs.*integer.*latency_ms/, "latencyMs must be integer column");
  });
});

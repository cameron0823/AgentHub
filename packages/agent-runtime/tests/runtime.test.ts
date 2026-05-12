import { test } from "node:test";
import assert from "node:assert";
import { AgentRuntime, ParallelOrchestrator, SequentialOrchestrator, type AgentRuntimeLike } from "../src";
import { providerRegistry, ModelProvider, ChatStreamChunk } from "@agenthub/ai-providers";

// Mock Provider
class MockProvider implements ModelProvider {
  id = "ollama";
  name = "Mock Ollama";
  type = "local" as const;

  async listModels() { return []; }
  async healthCheck() { return { id: this.id, name: this.name, status: "healthy" as const, latency: 0 }; }
  async chat() { return { content: "mock" }; }
  
  async *streamChat(options: any): AsyncIterable<ChatStreamChunk> {
    assert.equal(options.model, "test-model");
    if (options.messages.some((m: any) => m.role === "tool")) {
      yield { type: "content", content: "The result is 4." };
      yield { type: "done" };
      return;
    }

    yield { type: "content", content: "Let me calculate that." };
    yield { type: "reasoning", content: "Thinking..." };
    yield {
      type: "tool_call" as any,
      toolCall: {
        id: "call_1",
        type: "function",
        function: { name: "calculator", arguments: JSON.stringify({ expression: "2+2" }) }
      }
    };
    yield { type: "done" };
  }
}

class MultiToolProvider implements ModelProvider {
  id = "ollama";
  name = "Mock Ollama";
  type = "local" as const;

  async listModels() { return []; }
  async healthCheck() { return { id: this.id, name: this.name, status: "healthy" as const, latency: 0 }; }
  async chat() { return { content: "mock" }; }

  async *streamChat(options: any): AsyncIterable<ChatStreamChunk> {
    if (options.messages.filter((m: any) => m.role === "tool").length >= 2) {
      yield { type: "content", content: "Both tools completed." };
      yield { type: "done" };
      return;
    }

    yield {
      type: "tool_call" as any,
      toolCall: {
        id: "call_1",
        type: "function",
        function: { name: "calculator", arguments: JSON.stringify({ expression: "2+2" }) }
      }
    };
    yield {
      type: "tool_call" as any,
      toolCall: {
        id: "call_2",
        type: "function",
        function: { name: "calculator", arguments: JSON.stringify({ expression: "3*3" }) }
      }
    };
    yield { type: "done" };
  }
}

class LoopingToolProvider implements ModelProvider {
  id = "ollama";
  name = "Mock Ollama";
  type = "local" as const;

  async listModels() { return []; }
  async healthCheck() { return { id: this.id, name: this.name, status: "healthy" as const, latency: 0 }; }
  async chat() { return { content: "mock" }; }

  async *streamChat(): AsyncIterable<ChatStreamChunk> {
    yield {
      type: "tool_call" as any,
      toolCall: {
        id: crypto.randomUUID(),
        type: "function",
        function: { name: "calculator", arguments: JSON.stringify({ expression: "1+1" }) }
      }
    };
    yield { type: "done" };
  }
}

class SystemPromptProvider implements ModelProvider {
  id = "ollama";
  name = "Mock Ollama";
  type = "local" as const;

  async listModels() { return []; }
  async healthCheck() { return { id: this.id, name: this.name, status: "healthy" as const, latency: 0 }; }
  async chat() { return { content: "mock" }; }

  async *streamChat(options: any): AsyncIterable<ChatStreamChunk> {
    assert.deepEqual(options.messages[0], { role: "system", content: "Follow the agent persona." });
    assert.equal(options.temperature, 0.2);
    assert.equal(options.maxTokens, 1234);
    yield { type: "content", content: "persona ok" };
    yield { type: "done" };
  }
}

test("AgentRuntime handles reasoning and tool calls", async () => {
  // Setup
  const originalProvider = providerRegistry.get("ollama");
  providerRegistry.register(new MockProvider() as any);

  const agent = new AgentRuntime({ model: "ollama:test-model" });
  const chunks: any[] = [];

  for await (const chunk of agent.run({
    sessionId: "test-session",
    messages: [{ role: "user", content: "What is 2+2?" }],
    tools: ["calculator"]
  })) {
    chunks.push(chunk);
  }

  // Verify
  assert.ok(chunks.some(c => c.type === "reasoning" && c.content === "Thinking..."));
  assert.ok(chunks.some(c => c.type === "tool_call"));
  assert.ok(chunks.some(c => c.type === "tool_result" && c.result.result === 4));
  assert.ok(chunks.some(c => c.type === "content" && c.content === "The result is 4."));

  // Cleanup
  if (originalProvider) providerRegistry.register(originalProvider);
});

test("AgentRuntime executes multiple tool calls before continuing", async () => {
  const originalProvider = providerRegistry.get("ollama");
  providerRegistry.register(new MultiToolProvider() as any);

  const agent = new AgentRuntime({ model: "ollama:test-model" });
  const chunks: any[] = [];

  for await (const chunk of agent.run({
    sessionId: "test-session",
    messages: [{ role: "user", content: "Use two tools" }],
    tools: ["calculator"]
  })) {
    chunks.push(chunk);
  }

  const toolResults = chunks.filter(c => c.type === "tool_result");
  assert.equal(toolResults.length, 2);
  assert.deepEqual(toolResults.map(c => c.result.result), [4, 9]);
  assert.ok(chunks.some(c => c.type === "content" && c.content === "Both tools completed."));

  if (originalProvider) providerRegistry.register(originalProvider);
});

test("AgentRuntime stops at max tool iterations", async () => {
  const originalProvider = providerRegistry.get("ollama");
  providerRegistry.register(new LoopingToolProvider() as any);

  const agent = new AgentRuntime({ model: "ollama:test-model", maxToolIterations: 1 });
  const chunks: any[] = [];

  for await (const chunk of agent.run({
    sessionId: "test-session",
    messages: [{ role: "user", content: "Keep using tools" }],
    tools: ["calculator"]
  })) {
    chunks.push(chunk);
  }

  assert.ok(chunks.some(c => c.type === "tool_result" && c.result.error === "Maximum tool iterations (1) reached"));

  if (originalProvider) providerRegistry.register(originalProvider);
});

test("AgentRuntime resolves non-Ollama qualified provider IDs", async () => {
  class VLLMMockProvider extends MockProvider {
    id = "vllm";
    name = "Mock vLLM";
  }

  const originalProvider = providerRegistry.get("vllm");
  providerRegistry.register(new VLLMMockProvider() as any);

  const agent = new AgentRuntime({ model: "vllm:test-model" });
  const chunks: any[] = [];

  for await (const chunk of agent.run({
    sessionId: "test-session",
    messages: [{ role: "user", content: "What is 2+2?" }],
    tools: ["calculator"]
  })) {
    chunks.push(chunk);
  }

  assert.ok(chunks.some(c => c.type === "tool_result" && c.result.result === 4));

  if (originalProvider) providerRegistry.register(originalProvider);
});

test("AgentRuntime injects system prompt and generation options", async () => {
  const originalProvider = providerRegistry.get("ollama");
  providerRegistry.register(new SystemPromptProvider() as any);

  const agent = new AgentRuntime({
    model: "ollama:test-model",
    systemPrompt: "Follow the agent persona.",
    temperature: 0.2,
    maxTokens: 1234,
  });
  const chunks: any[] = [];

  for await (const chunk of agent.run({
    sessionId: "test-session",
    messages: [{ role: "user", content: "Use persona" }],
    tools: []
  })) {
    chunks.push(chunk);
  }

  assert.ok(chunks.some(c => c.type === "content" && c.content === "persona ok"));

  if (originalProvider) providerRegistry.register(originalProvider);
});

test("AgentRuntime keeps legacy colon model IDs on Ollama", async () => {
  class LegacyMockProvider extends MockProvider {
    async *streamChat(options: any): AsyncIterable<ChatStreamChunk> {
      assert.equal(options.model, "qwen2.5:7b");
      yield { type: "content", content: "legacy ok" };
      yield { type: "done" };
    }
  }

  const originalProvider = providerRegistry.get("ollama");
  providerRegistry.register(new LegacyMockProvider() as any);

  const agent = new AgentRuntime({ model: "qwen2.5:7b" });
  const chunks: any[] = [];

  for await (const chunk of agent.run({
    sessionId: "test-session",
    messages: [{ role: "user", content: "Use legacy model" }],
    tools: []
  })) {
    chunks.push(chunk);
  }

  assert.ok(chunks.some(c => c.type === "content" && c.content === "legacy ok"));

  if (originalProvider) providerRegistry.register(originalProvider);
});

test("SequentialOrchestrator emits deterministic agent events", async () => {
  const orchestrator = new SequentialOrchestrator((agent): AgentRuntimeLike => ({
    async *run() {
      yield { type: "content", content: `${agent.name} output` };
      yield { type: "done" };
    },
  }));
  const events: any[] = [];

  for await (const event of orchestrator.run({
    sessionId: "session-1",
    task: "Coordinate work",
    group: { id: "group-1", name: "Team", pattern: "sequential" },
    agents: [
      { id: "b", name: "Beta", sortOrder: 2, runtimeOptions: { model: "ollama:test-model" } },
      { id: "a", name: "Alpha", sortOrder: 1, runtimeOptions: { model: "ollama:test-model" } },
    ],
  })) {
    events.push(event);
  }

  assert.deepEqual(events.map((event) => event.type), [
    "group_start",
    "agent_start",
    "agent_output",
    "agent_output",
    "agent_complete",
    "agent_start",
    "agent_output",
    "agent_output",
    "agent_complete",
    "group_complete",
  ]);
  assert.equal(events[1].agentId, "a");
  assert.equal(events[5].agentId, "b");
  assert.match(events.at(-1).synthesis, /Alpha output/);
  assert.match(events.at(-1).synthesis, /Beta output/);
});

test("ParallelOrchestrator emits deterministic completed output order", async () => {
  const orchestrator = new ParallelOrchestrator((agent): AgentRuntimeLike => ({
    async *run() {
      yield { type: "content", content: `${agent.id}-1` };
      yield { type: "content", content: `${agent.id}-2` };
      yield { type: "done" };
    },
  }));
  const events: any[] = [];

  for await (const event of orchestrator.run({
    sessionId: "session-1",
    task: "Coordinate work",
    group: { id: "group-1", name: "Team", pattern: "parallel" },
    agents: [
      { id: "b", name: "Beta", sortOrder: 2, runtimeOptions: { model: "ollama:test-model" } },
      { id: "a", name: "Alpha", sortOrder: 1, runtimeOptions: { model: "ollama:test-model" } },
    ],
  })) {
    events.push(event);
  }

  assert.deepEqual(events.filter((event) => event.type === "agent_start").map((event) => event.agentId), ["a", "b"]);
  assert.deepEqual(events.filter((event) => event.type === "agent_complete").map((event) => event.agentId), ["a", "b"]);
  assert.equal(events.at(-1).type, "group_complete");
  assert.deepEqual(events.at(-1).outputs.map((output: any) => output.agentId), ["a", "b"]);
});

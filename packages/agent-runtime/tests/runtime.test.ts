import { test } from "node:test";
import assert from "node:assert";
import {
  AgentRuntime,
  MCPClient,
  IterativeOrchestrator,
  ParallelOrchestrator,
  SequentialOrchestrator,
  createToolSchemaFingerprint,
  diffToolSchemas,
  parseSseJsonRpcResponse,
  runHeterogeneousAgent,
  type AgentRuntimeLike,
  type HeterogeneousAgentProfile,
  type HeterogeneousRunEvent,
} from "../src";
import {
  LOCAL_PROVIDER_IDS,
  ProviderRegistry,
  providerRegistry,
  ModelProvider,
  ChatStreamChunk,
} from "@agenthub/ai-providers";
import { compileToolProfile } from "../../../apps/web/src/server/tool-profiles";

// Mock Provider
class MockProvider implements ModelProvider {
  id = "ollama";
  name = "Mock Ollama";
  type = "local" as const;

  async listModels() {
    return [];
  }
  async healthCheck() {
    return { id: this.id, name: this.name, status: "healthy" as const, latency: 0 };
  }
  async chat() {
    return { content: "mock" };
  }

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
        function: { name: "calculator", arguments: JSON.stringify({ expression: "2+2" }) },
      },
    };
    yield { type: "done" };
  }
}

class MultiToolProvider implements ModelProvider {
  id = "ollama";
  name = "Mock Ollama";
  type = "local" as const;

  async listModels() {
    return [];
  }
  async healthCheck() {
    return { id: this.id, name: this.name, status: "healthy" as const, latency: 0 };
  }
  async chat() {
    return { content: "mock" };
  }

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
        function: { name: "calculator", arguments: JSON.stringify({ expression: "2+2" }) },
      },
    };
    yield {
      type: "tool_call" as any,
      toolCall: {
        id: "call_2",
        type: "function",
        function: { name: "calculator", arguments: JSON.stringify({ expression: "3*3" }) },
      },
    };
    yield { type: "done" };
  }
}

class LoopingToolProvider implements ModelProvider {
  id = "ollama";
  name = "Mock Ollama";
  type = "local" as const;

  async listModels() {
    return [];
  }
  async healthCheck() {
    return { id: this.id, name: this.name, status: "healthy" as const, latency: 0 };
  }
  async chat() {
    return { content: "mock" };
  }

  async *streamChat(): AsyncIterable<ChatStreamChunk> {
    yield {
      type: "tool_call" as any,
      toolCall: {
        id: crypto.randomUUID(),
        type: "function",
        function: { name: "calculator", arguments: JSON.stringify({ expression: "1+1" }) },
      },
    };
    yield { type: "done" };
  }
}

class SystemPromptProvider implements ModelProvider {
  id = "ollama";
  name = "Mock Ollama";
  type = "local" as const;

  async listModels() {
    return [];
  }
  async healthCheck() {
    return { id: this.id, name: this.name, status: "healthy" as const, latency: 0 };
  }
  async chat() {
    return { content: "mock" };
  }

  async *streamChat(options: any): AsyncIterable<ChatStreamChunk> {
    assert.deepEqual(options.messages[0], { role: "system", content: "Follow the agent persona." });
    assert.equal(options.temperature, 0.2);
    assert.equal(options.maxTokens, 1234);
    yield { type: "content", content: "persona ok" };
    yield { type: "done" };
  }
}

class ExecuteCodeProvider implements ModelProvider {
  id = "ollama";
  name = "Mock Ollama";
  type = "local" as const;

  constructor(private readonly assertToolExposure?: (toolNames: string[]) => void) {}

  async listModels() {
    return [];
  }
  async healthCheck() {
    return { id: this.id, name: this.name, status: "healthy" as const, latency: 0 };
  }
  async chat() {
    return { content: "mock" };
  }

  async *streamChat(options: any): AsyncIterable<ChatStreamChunk> {
    const toolNames = (options.tools ?? []).map((tool: any) => tool.function.name);
    this.assertToolExposure?.(toolNames);

    if (options.messages.some((m: any) => m.role === "tool")) {
      yield { type: "content", content: "sandbox policy handled" };
      yield { type: "done" };
      return;
    }

    yield {
      type: "tool_call" as any,
      toolCall: {
        id: "sandbox_call_1",
        type: "function",
        function: { name: "execute_code", arguments: JSON.stringify({ language: "python", code: "print('ok')" }) },
      },
    };
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
    tools: ["calculator"],
  })) {
    chunks.push(chunk);
  }

  // Verify
  assert.ok(chunks.some((c) => c.type === "reasoning" && c.content === "Thinking..."));
  assert.ok(
    chunks.some(
      (c) =>
        c.type === "reasoning_event" &&
        c.event.kind === "provider_reasoning" &&
        c.event.visibility === "provider-visible" &&
        c.event.content === "Thinking...",
    ),
  );
  assert.ok(
    chunks.some(
      (c) => c.type === "reasoning_event" && c.event.kind === "tool_decision" && c.event.toolName === "calculator",
    ),
  );
  assert.ok(
    chunks.some(
      (c) =>
        c.type === "reasoning_event" &&
        c.event.kind === "tool_execution" &&
        c.event.toolName === "calculator" &&
        typeof c.event.durationMs === "number",
    ),
  );
  assert.ok(chunks.some((c) => c.type === "tool_call"));
  assert.ok(chunks.some((c) => c.type === "tool_result" && c.result.result === 4));
  assert.ok(chunks.some((c) => c.type === "content" && c.content === "The result is 4."));

  // Cleanup
  if (originalProvider) providerRegistry.register(originalProvider);
});

test("AgentRuntime emits approval request and blocks rejected sensitive tool calls", async () => {
  const originalProvider = providerRegistry.get("ollama");
  providerRegistry.register(new MockProvider() as any);

  const agent = new AgentRuntime({ model: "ollama:test-model" });
  const chunks: any[] = [];

  for await (const chunk of agent.run({
    sessionId: "approval-session",
    messages: [{ role: "user", content: "What is 2+2?" }],
    tools: ["calculator"],
    approvalPolicy: { sensitiveTools: ["calculator"] },
    approval: async () => ({ approved: false, reason: "manual rejection" }),
  })) {
    chunks.push(chunk);
  }

  assert.ok(chunks.some((c) => c.type === "approval_request" && c.request.toolName === "calculator"));
  assert.ok(chunks.some((c) => c.type === "approval_result" && c.decision.approved === false));
  assert.ok(chunks.some((c) => c.type === "tool_result" && /rejected by human approval/.test(c.result.error)));

  if (originalProvider) providerRegistry.register(originalProvider);
});

test("App tool profile policy allows execute_code sandbox output and blocks profile or deny-list bypasses", async () => {
  const originalProvider = providerRegistry.get("ollama");
  const fakeExecuteCodeTool = {
    name: "execute_code",
    description: "Fake app-backed sandbox execution",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string" },
        language: { type: "string" },
      },
      required: ["code"],
    },
    execute: async () => ({
      type: "sandbox_execution",
      sessionId: "00000000-0000-4000-8000-000000000001",
      provider: "local-docker",
      language: "python",
      stdout: "ok\n",
      stderr: "",
      exitCode: 0,
      outputs: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          type: "file",
          filename: "stdout.txt",
          url: "agenthub://sandbox/00000000-0000-4000-8000-000000000001/stdout.txt",
          mimeType: "text/plain",
          content: "ok\n",
          sizeBytes: 3,
          downloadable: true,
          source: "sandbox",
          createdAt: "2026-05-17T00:00:00.000Z",
        },
      ],
      charts: [],
    }),
  };

  try {
    const allowedAccess = compileToolProfile({
      selectedTools: ["execute_code"],
      profile: "coding",
      deniedTools: [],
    });
    assert.deepEqual(allowedAccess.allowedTools, ["execute_code"]);
    providerRegistry.register(
      new ExecuteCodeProvider((toolNames) => {
        assert.deepEqual(toolNames, ["execute_code"]);
      }) as any,
    );

    const allowedChunks: any[] = [];
    for await (const chunk of new AgentRuntime({ model: "ollama:test-model" }).run({
      sessionId: "sandbox-allowed",
      messages: [{ role: "user", content: "run sandbox" }],
      extraTools: [fakeExecuteCodeTool],
      deniedTools: allowedAccess.deniedTools,
    })) {
      allowedChunks.push(chunk);
    }

    assert.ok(
      allowedChunks.some(
        (chunk) =>
          chunk.type === "tool_result" &&
          chunk.toolName === "execute_code" &&
          chunk.result.type === "sandbox_execution" &&
          chunk.result.outputs?.[0]?.filename === "stdout.txt",
      ),
    );
    assert.ok(allowedChunks.some((chunk) => chunk.type === "content" && chunk.content === "sandbox policy handled"));

    const profileBlockedAccess = compileToolProfile({
      selectedTools: ["execute_code"],
      profile: "minimal",
      deniedTools: [],
    });
    assert.deepEqual(profileBlockedAccess.allowedTools, []);
    assert.deepEqual(profileBlockedAccess.removedTools, ["execute_code"]);
    providerRegistry.register(
      new ExecuteCodeProvider((toolNames) => {
        assert.deepEqual(toolNames, []);
      }) as any,
    );

    const profileBlockedChunks: any[] = [];
    for await (const chunk of new AgentRuntime({ model: "ollama:test-model" }).run({
      sessionId: "sandbox-profile-blocked",
      messages: [{ role: "user", content: "try sandbox" }],
      extraTools: [],
      deniedTools: profileBlockedAccess.deniedTools,
    })) {
      profileBlockedChunks.push(chunk);
    }

    assert.ok(
      profileBlockedChunks.some(
        (chunk) =>
          chunk.type === "tool_result" &&
          chunk.toolName === "execute_code" &&
          /not exposed by the active tool profile/.test(chunk.result.error),
      ),
    );
    assert.ok(
      profileBlockedChunks.some(
        (chunk) =>
          chunk.type === "reasoning_event" &&
          chunk.event.kind === "tool_execution" &&
          chunk.event.metadata?.status === "blocked",
      ),
    );

    const denyListAccess = compileToolProfile({
      selectedTools: ["execute_code"],
      profile: "coding",
      deniedTools: ["execute_code"],
    });
    assert.deepEqual(denyListAccess.allowedTools, []);
    assert.deepEqual(denyListAccess.deniedTools, ["execute_code"]);
    providerRegistry.register(
      new ExecuteCodeProvider((toolNames) => {
        assert.deepEqual(toolNames, []);
      }) as any,
    );

    const denyListChunks: any[] = [];
    for await (const chunk of new AgentRuntime({ model: "ollama:test-model" }).run({
      sessionId: "sandbox-denied",
      messages: [{ role: "user", content: "try denied sandbox" }],
      extraTools: [],
      deniedTools: denyListAccess.deniedTools,
    })) {
      denyListChunks.push(chunk);
    }

    assert.ok(
      denyListChunks.some(
        (chunk) =>
          chunk.type === "tool_result" &&
          chunk.toolName === "execute_code" &&
          /blocked by tool profile deny list/.test(chunk.result.error),
      ),
    );
  } finally {
    if (originalProvider) providerRegistry.register(originalProvider);
  }
});

test("MCPClient supports streamable HTTP JSON-RPC, SSE responses, health, and schema diffs", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { id: number; method: string; params?: unknown };
    if (body.method === "initialize") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { ok: true } }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (body.method === "tools/list") {
      return new Response(
        `data: ${JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [
              {
                name: "search",
                description: "Search",
                inputSchema: { type: "object", properties: { q: { type: "string" } } },
              },
            ],
          },
        })}\n\n`,
        { headers: { "content-type": "text/event-stream" } },
      );
    }
    if (body.method === "tools/call") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: "ok" } }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("unknown", { status: 400 });
  }) as typeof fetch;

  try {
    const client = new MCPClient({
      transport: "streamable-http",
      url: "https://mcp.example.test",
      headers: { Authorization: "Bearer test" },
    });
    await client.connect();
    assert.equal(client.getTools()[0]?.name, "search");
    assert.deepEqual(await client.callTool("search", { q: "agenthub" }), { content: "ok" });
    assert.equal((await client.healthCheck()).ok, true);

    const parsed = parseSseJsonRpcResponse('data: {"jsonrpc":"2.0","id":7,"result":{"ok":true}}\n\n', 7);
    assert.deepEqual(parsed.result, { ok: true });
    assert.equal(createToolSchemaFingerprint(client.getTools()).length, 64);
    assert.deepEqual(diffToolSchemas([], client.getTools()), { added: ["search"], removed: [], changed: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AgentRuntime executes multiple tool calls before continuing", async () => {
  const originalProvider = providerRegistry.get("ollama");
  providerRegistry.register(new MultiToolProvider() as any);

  const agent = new AgentRuntime({ model: "ollama:test-model" });
  const chunks: any[] = [];

  for await (const chunk of agent.run({
    sessionId: "test-session",
    messages: [{ role: "user", content: "Use two tools" }],
    tools: ["calculator"],
  })) {
    chunks.push(chunk);
  }

  const toolResults = chunks.filter((c) => c.type === "tool_result");
  assert.equal(toolResults.length, 2);
  assert.deepEqual(
    toolResults.map((c) => c.result.result),
    [4, 9],
  );
  assert.ok(chunks.some((c) => c.type === "content" && c.content === "Both tools completed."));

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
    tools: ["calculator"],
  })) {
    chunks.push(chunk);
  }

  assert.ok(chunks.some((c) => c.type === "tool_result" && c.result.error === "Maximum tool iterations (1) reached"));

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
    tools: ["calculator"],
  })) {
    chunks.push(chunk);
  }

  assert.ok(chunks.some((c) => c.type === "tool_result" && c.result.result === 4));

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
    tools: [],
  })) {
    chunks.push(chunk);
  }

  assert.ok(chunks.some((c) => c.type === "content" && c.content === "persona ok"));

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
    tools: [],
  })) {
    chunks.push(chunk);
  }

  assert.ok(chunks.some((c) => c.type === "content" && c.content === "legacy ok"));

  if (originalProvider) providerRegistry.register(originalProvider);
});

test("AgentRuntime routes unqualified model IDs through Ollama", async () => {
  class UnqualifiedMockProvider extends MockProvider {
    async *streamChat(options: any): AsyncIterable<ChatStreamChunk> {
      assert.equal(options.model, "llama3");
      yield { type: "content", content: "unqualified ok" };
      yield { type: "done" };
    }
  }

  const originalProvider = providerRegistry.get("ollama");
  providerRegistry.register(new UnqualifiedMockProvider() as any);

  const agent = new AgentRuntime({ model: "llama3" });
  const chunks: any[] = [];

  for await (const chunk of agent.run({
    sessionId: "test-session",
    messages: [{ role: "user", content: "Use unqualified model" }],
    tools: [],
  })) {
    chunks.push(chunk);
  }

  assert.ok(chunks.some((c) => c.type === "content" && c.content === "unqualified ok"));

  if (originalProvider) providerRegistry.register(originalProvider);
});

test("ProviderRegistry preserves local providers when cloud credentials are loaded", () => {
  const registry = new ProviderRegistry();
  assert.deepEqual(
    registry.listLocalProviders().map((provider) => provider.id),
    [...LOCAL_PROVIDER_IDS],
  );

  registry.loadUserCredentials([
    { providerId: "openai", providerName: "OpenAI", authType: "api_key", apiKey: "test-key" },
  ]);

  assert.deepEqual(
    registry.listLocalProviders().map((provider) => provider.id),
    [...LOCAL_PROVIDER_IDS],
  );
});

test("SequentialOrchestrator emits deterministic agent events", async () => {
  const orchestrator = new SequentialOrchestrator(
    (agent): AgentRuntimeLike => ({
      async *run() {
        yield { type: "content", content: `${agent.name} output` };
        yield { type: "done" };
      },
    }),
  );
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

  assert.deepEqual(
    events.map((event) => event.type),
    [
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
    ],
  );
  assert.equal(events[1].agentId, "a");
  assert.equal(events[5].agentId, "b");
  assert.match(events.at(-1).synthesis, /Alpha output/);
  assert.match(events.at(-1).synthesis, /Beta output/);
});

test("ParallelOrchestrator emits deterministic completed output order", async () => {
  const orchestrator = new ParallelOrchestrator(
    (agent): AgentRuntimeLike => ({
      async *run() {
        yield { type: "content", content: `${agent.id}-1` };
        yield { type: "content", content: `${agent.id}-2` };
        yield { type: "done" };
      },
    }),
  );
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

  assert.deepEqual(
    events.filter((event) => event.type === "agent_start").map((event) => event.agentId),
    ["a", "b"],
  );
  assert.deepEqual(
    events.filter((event) => event.type === "agent_complete").map((event) => event.agentId),
    ["a", "b"],
  );
  assert.equal(events.at(-1).type, "group_complete");
  assert.deepEqual(
    events.at(-1).outputs.map((output: any) => output.agentId),
    ["a", "b"],
  );
});

test("IterativeOrchestrator runs author editor reviser loop with checkpoint event", async () => {
  const orchestrator = new IterativeOrchestrator(
    (agent): AgentRuntimeLike => ({
      async *run() {
        yield { type: "content", content: `${agent.role ?? agent.name} output` };
        yield { type: "done" };
      },
    }),
  );
  const events: any[] = [];

  for await (const event of orchestrator.run({
    sessionId: "session-1",
    task: "Improve draft",
    group: { id: "group-1", name: "Review Team", pattern: "iterative", maxIterations: 1 },
    agents: [
      {
        id: "a",
        name: "Alice",
        role: "Author",
        sortOrder: 1,
        tools: [],
        runtimeOptions: { model: "ollama:test-model" },
      },
      { id: "e", name: "Eve", role: "Editor", sortOrder: 2, tools: [], runtimeOptions: { model: "ollama:test-model" } },
      {
        id: "r",
        name: "Rae",
        role: "Reviser",
        sortOrder: 3,
        tools: [],
        runtimeOptions: { model: "ollama:test-model" },
      },
    ],
  })) {
    events.push(event);
  }

  assert.deepEqual(
    events.filter((event) => event.type === "agent_complete").map((event) => event.agentId),
    ["a", "e", "r"],
  );
  assert.ok(events.some((event) => event.type === "iterative_start" && event.maxIterations === 1));
  assert.ok(events.some((event) => event.type === "hitl_checkpoint"));
  assert.equal(events.at(-1).type, "group_complete");
  assert.match(events.at(-1).synthesis, /Iterative Result/);
});

function createHeterogeneousProfile(overrides: Partial<HeterogeneousAgentProfile> = {}): HeterogeneousAgentProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    name: "Node test agent",
    description: null,
    kind: "generic",
    command: process.execPath,
    args: ["-e", "process.stdin.pipe(process.stdout)"],
    workingDirectory: null,
    env: {},
    isEnabled: true,
    ...overrides,
  };
}

const enabledHeterogeneousEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  PATH: process.env.PATH,
  AGENTHUB_HETEROGENEOUS_ENABLED: "true",
};

async function collectHeterogeneousEvents(
  profile: HeterogeneousAgentProfile,
  options: Parameters<typeof runHeterogeneousAgent>[2] = {},
) {
  const events: HeterogeneousRunEvent[] = [];
  for await (const event of runHeterogeneousAgent(profile, { prompt: "hello runtime" }, options)) {
    events.push(event);
  }
  return events;
}

test("Heterogeneous runner stays disabled until the feature flag is set", async () => {
  const events = await collectHeterogeneousEvents(createHeterogeneousProfile(), {
    allowedCommands: [process.execPath],
    env: { NODE_ENV: "test", PATH: process.env.PATH },
  });

  assert.equal(events[0]?.type, "status");
  assert.equal(events[0]?.type === "status" ? events[0].status : "", "feature_disabled");
});

test("Heterogeneous runner rejects unallowlisted commands, shell args, and outside cwd", async () => {
  await assert.rejects(
    () =>
      collectHeterogeneousEvents(createHeterogeneousProfile({ command: "node" }), {
        allowedCommands: [process.execPath],
        env: enabledHeterogeneousEnv,
      }),
    /allowlist/,
  );

  await assert.rejects(
    () =>
      collectHeterogeneousEvents(createHeterogeneousProfile({ args: ["bad;arg"] }), {
        allowedCommands: [process.execPath],
        env: enabledHeterogeneousEnv,
      }),
    /metacharacters/,
  );

  await assert.rejects(
    () =>
      collectHeterogeneousEvents(createHeterogeneousProfile({ workingDirectory: "/tmp" }), {
        allowedCommands: [process.execPath],
        env: enabledHeterogeneousEnv,
        workspaceRoot: process.cwd(),
      }),
    /outside the allowed workspace root/,
  );
});

test("Heterogeneous runner scopes cwd and environment while streaming output", async () => {
  const events = await collectHeterogeneousEvents(
    createHeterogeneousProfile({
      args: ["-e", "console.log([process.cwd(),process.env.AGENTHUB_VISIBLE,process.env.SECRET_TOKEN].join(','))"],
      env: { AGENTHUB_VISIBLE: "visible", SECRET_TOKEN: "hidden" },
      workingDirectory: ".",
    }),
    {
      allowedCommands: [process.execPath],
      allowedEnvKeys: ["AGENTHUB_VISIBLE"],
      env: enabledHeterogeneousEnv,
      workspaceRoot: process.cwd(),
    },
  );

  const stdout = events
    .filter((event) => event.type === "stdout")
    .map((event) => event.content)
    .join("");
  const exit = events.find((event) => event.type === "exit");

  assert.match(stdout, new RegExp(`${process.cwd()},visible,`));
  assert.doesNotMatch(stdout, /hidden/);
  assert.equal(exit?.type === "exit" ? exit.exitCode : null, 0);
});

test("Heterogeneous runner terminates spawned processes on abort", async () => {
  const controller = new AbortController();
  const events: HeterogeneousRunEvent[] = [];
  const run = collectHeterogeneousEvents(
    createHeterogeneousProfile({ args: ["-e", "setTimeout(function(){},10000)"] }),
    {
      allowedCommands: [process.execPath],
      env: enabledHeterogeneousEnv,
      signal: controller.signal,
    },
  );

  setTimeout(() => controller.abort(), 50);
  events.push(...(await run));
  const exit = events.find((event) => event.type === "exit");

  assert.equal(exit?.type === "exit" ? exit.signal : null, "SIGTERM");
});

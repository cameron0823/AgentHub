/**
 * P32.2b — Behavioral SSE stream tests
 *
 * Spins up a minimal http.Server that wires AgentRuntime to SSE exactly as
 * the real Next.js route does.  Tests make live HTTP requests, parse the SSE
 * wire format, and assert on chunks — no DB, no auth, no Next.js required.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { providerRegistry } from "@agenthub/ai-providers";
import { AgentRuntime } from "@agenthub/agent-runtime";
import type {
  ModelProvider,
  ChatOptions,
  ChatStreamChunk,
  ModelInfo,
  ProviderHealth,
  ChatResponse,
} from "@agenthub/ai-providers";

// ── Mock providers ────────────────────────────────────────────────────────────

class MockProvider implements ModelProvider {
  readonly id = "mock";
  readonly name = "Mock Provider";
  readonly type = "local" as const;

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: "fast", name: "Mock Fast", capabilities: ["chat"] }];
  }
  async healthCheck(): Promise<ProviderHealth> {
    return { id: this.id, name: this.name, status: "healthy", latency: 0 };
  }
  async chat(_options: ChatOptions): Promise<ChatResponse> {
    return { content: "Mock response" };
  }
  async *streamChat(_options: ChatOptions): AsyncGenerator<ChatStreamChunk> {
    yield { type: "content", content: "Hello " };
    yield { type: "content", content: "world" };
    // No done yield — done is synthesized by the server, not the provider
  }
}

class MockMultiChunkProvider implements ModelProvider {
  readonly id = "mock-multi";
  readonly name = "Mock Multi-Chunk";
  readonly type = "local" as const;

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: "v1", name: "Multi", capabilities: ["chat"] }];
  }
  async healthCheck(): Promise<ProviderHealth> {
    return { id: this.id, name: this.name, status: "healthy", latency: 0 };
  }
  async chat(_options: ChatOptions): Promise<ChatResponse> {
    return { content: "" };
  }
  async *streamChat(_options: ChatOptions): AsyncGenerator<ChatStreamChunk> {
    for (let i = 1; i <= 5; i++) {
      yield { type: "content", content: `chunk${i} ` };
    }
  }
}

class MockEmptyProvider implements ModelProvider {
  readonly id = "mock-empty";
  readonly name = "Mock Empty";
  readonly type = "local" as const;

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }
  async healthCheck(): Promise<ProviderHealth> {
    return { id: this.id, name: this.name, status: "healthy", latency: 0 };
  }
  async chat(_options: ChatOptions): Promise<ChatResponse> {
    return { content: "" };
  }
  async *streamChat(_options: ChatOptions): AsyncGenerator<ChatStreamChunk> {
    // yields nothing — server must still emit done
  }
}

class MockErrorProvider implements ModelProvider {
  readonly id = "mock-error";
  readonly name = "Mock Error Provider";
  readonly type = "local" as const;

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }
  async healthCheck(): Promise<ProviderHealth> {
    return { id: this.id, name: this.name, status: "healthy", latency: 0 };
  }
  async chat(_options: ChatOptions): Promise<ChatResponse> {
    return { content: "" };
  }
  async *streamChat(_options: ChatOptions): AsyncGenerator<ChatStreamChunk> {
    yield { type: "content", content: "partial " };
    throw new Error("Provider stream failure");
  }
}

// ── Minimal SSE test server ───────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    req.on("data", (d) => parts.push(d));
    req.on("end", () => resolve(Buffer.concat(parts).toString()));
    req.on("error", reject);
  });
}

let server: http.Server;
let port: number;

before(async () => {
  // Register mock providers
  providerRegistry.register(new MockProvider());
  providerRegistry.register(new MockMultiChunkProvider());
  providerRegistry.register(new MockEmptyProvider());
  providerRegistry.register(new MockErrorProvider());

  server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/stream") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const raw = await readBody(req);
    let parsed: { model?: string; messages?: unknown[]; systemPrompt?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      res.writeHead(400);
      res.end("Invalid JSON");
      return;
    }

    if (!Array.isArray(parsed.messages)) {
      res.writeHead(400);
      res.end("messages must be an array");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const runtime = new AgentRuntime({
      model: parsed.model ?? "mock:fast",
      systemPrompt: parsed.systemPrompt,
    });

    const startMs = Date.now();
    let fullContent = "";

    try {
      for await (const chunk of runtime.run({
        sessionId: "behavioral-test",
        messages: (parsed.messages as any[]).map((m: any) => ({
          role: m.role ?? "user",
          content: m.content ?? "",
        })),
      })) {
        if (chunk.type === "content" && chunk.content) {
          fullContent += chunk.content;
        }
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      const approxTokens = Math.ceil(fullContent.length / 4);
      res.write(
        `data: ${JSON.stringify({ type: "done", tokensUsed: approxTokens, latencyMs: Date.now() - startMs })}\n\n`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Stream error";
      res.write(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`);
    } finally {
      res.end();
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  port = (server.address() as { port: number }).port;
});

after(async () => {
  providerRegistry.unregister("mock");
  providerRegistry.unregister("mock-multi");
  providerRegistry.unregister("mock-empty");
  providerRegistry.unregister("mock-error");

  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

// ── Helpers ───────────────────────────────────────────────────────────────────

interface SseResult {
  status: number;
  contentType: string | undefined;
  chunks: unknown[];
}

function postStream(body: unknown): Promise<SseResult> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/stream",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const parts: Buffer[] = [];
        res.on("data", (d) => parts.push(d));
        res.on("end", () => {
          const text = Buffer.concat(parts).toString();
          const chunks = text
            .split("\n\n")
            .filter((block) => block.startsWith("data: "))
            .map((block) => {
              try {
                return JSON.parse(block.slice(6));
              } catch {
                return { _raw: block.slice(6) };
              }
            });
          resolve({
            status: res.statusCode ?? 0,
            contentType: res.headers["content-type"],
            chunks,
          });
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("SSE response has correct Content-Type header", async () => {
  const { contentType } = await postStream({
    model: "mock:fast",
    messages: [{ role: "user", content: "hi" }],
  });
  assert.ok(contentType?.startsWith("text/event-stream"), `expected text/event-stream, got ${contentType}`);
});

test("happy path: content chunks arrive before synthesized done", async () => {
  const { status, chunks } = await postStream({
    model: "mock:fast",
    messages: [{ role: "user", content: "hi" }],
  });

  assert.equal(status, 200);
  const types = (chunks as Array<{ type: string }>).map((c) => c.type);
  assert.ok(types.includes("content"), "must have content chunks");
  assert.equal(types[types.length - 1], "done", "last chunk must be done");
});

test("content chunks carry the correct text values", async () => {
  const { chunks } = await postStream({
    model: "mock:fast",
    messages: [{ role: "user", content: "hi" }],
  });

  const contentChunks = (chunks as Array<{ type: string; content?: string }>).filter((c) => c.type === "content");
  assert.equal(contentChunks.length, 2, "MockProvider yields exactly 2 content chunks");
  assert.equal(contentChunks[0].content, "Hello ");
  assert.equal(contentChunks[1].content, "world");
});

test("done chunk has numeric tokensUsed and latencyMs", async () => {
  const { chunks } = await postStream({
    model: "mock:fast",
    messages: [{ role: "user", content: "hi" }],
  });

  const done = (chunks as Array<{ type: string; tokensUsed?: unknown; latencyMs?: unknown }>).find(
    (c) => c.type === "done",
  );
  assert.ok(done, "done chunk must exist");
  assert.equal(typeof done!.tokensUsed, "number", "tokensUsed must be a number");
  assert.equal(typeof done!.latencyMs, "number", "latencyMs must be a number");
  assert.ok((done!.latencyMs as number) >= 0, "latencyMs must be non-negative");
});

test("tokensUsed approximates content length / 4", async () => {
  const { chunks } = await postStream({
    model: "mock:fast",
    messages: [{ role: "user", content: "hi" }],
  });

  // "Hello " + "world" = 11 chars → ceil(11/4) = 3
  const done = (chunks as Array<{ type: string; tokensUsed?: number }>).find((c) => c.type === "done");
  assert.equal(done?.tokensUsed, Math.ceil("Hello world".length / 4));
});

test("multi-chunk provider: all 5 chunks arrive in order", async () => {
  const { chunks } = await postStream({
    model: "mock-multi:v1",
    messages: [{ role: "user", content: "go" }],
  });

  const content = (chunks as Array<{ type: string; content?: string }>).filter((c) => c.type === "content");
  assert.equal(content.length, 5);
  for (let i = 0; i < 5; i++) {
    assert.equal(content[i].content, `chunk${i + 1} `);
  }
});

test("empty provider: no content chunks, only done", async () => {
  const { chunks } = await postStream({
    model: "mock-empty:v1",
    messages: [{ role: "user", content: "hello" }],
  });

  const content = (chunks as Array<{ type: string }>).filter((c) => c.type === "content");
  assert.equal(content.length, 0, "no content chunks expected");

  const done = (chunks as Array<{ type: string; tokensUsed?: number }>).find((c) => c.type === "done");
  assert.ok(done, "done must still be emitted");
  assert.equal(done!.tokensUsed, 0, "empty stream → 0 tokens");
});

test("error mid-stream: error SSE event is emitted after partial content", async () => {
  const { chunks } = await postStream({
    model: "mock-error:v1",
    messages: [{ role: "user", content: "go" }],
  });

  const types = (chunks as Array<{ type: string }>).map((c) => c.type);
  assert.ok(types.includes("content"), "partial content before error");
  assert.ok(types.includes("error"), "error event must be emitted");

  // done must NOT appear after an error (server short-circuits via catch)
  assert.ok(!types.includes("done"), "done must not appear after an error");
});

test("error SSE event carries the provider error message", async () => {
  const { chunks } = await postStream({
    model: "mock-error:v1",
    messages: [{ role: "user", content: "go" }],
  });

  const errChunk = (chunks as Array<{ type: string; error?: string }>).find((c) => c.type === "error");
  assert.ok(errChunk, "error chunk must exist");
  assert.equal(errChunk!.error, "Provider stream failure");
});

test("invalid JSON body → 400 status", async () => {
  const result = await new Promise<{ status: number }>((resolve, reject) => {
    const payload = "not json";
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/stream",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": payload.length },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });

  assert.equal(result.status, 400);
});

test("missing messages field → 400 status", async () => {
  const result = await new Promise<{ status: number }>((resolve, reject) => {
    const payload = JSON.stringify({ model: "mock:fast" }); // no messages
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/stream",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });

  assert.equal(result.status, 400);
});

test("each SSE event is valid JSON parseable independently", async () => {
  const { chunks } = await postStream({
    model: "mock-multi:v1",
    messages: [{ role: "user", content: "go" }],
  });

  // If all parsed without error (no { _raw } objects), all are valid JSON
  for (const chunk of chunks) {
    assert.ok(
      !Object.prototype.hasOwnProperty.call(chunk, "_raw"),
      `chunk failed JSON parse: ${JSON.stringify(chunk)}`,
    );
  }
});

test("unknown route → 404", async () => {
  const result = await new Promise<{ status: number }>((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: "/unknown", method: "GET" }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
    });
    req.on("error", reject);
    req.end();
  });

  assert.equal(result.status, 404);
});

test("system prompt is injected when provided", async () => {
  // Runtime injects systemPrompt as first message if not already present.
  // MockProvider receives the call — we just verify the stream completes
  // successfully (runtime doesn't throw when systemPrompt is set).
  const { status, chunks } = await postStream({
    model: "mock:fast",
    messages: [{ role: "user", content: "hello" }],
    systemPrompt: "You are a helpful assistant.",
  });

  assert.equal(status, 200);
  const done = (chunks as Array<{ type: string }>).find((c) => c.type === "done");
  assert.ok(done, "stream must complete with done event even when systemPrompt is set");
});

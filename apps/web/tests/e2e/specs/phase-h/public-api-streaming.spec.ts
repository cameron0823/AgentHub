import { test, expect } from "@playwright/test";
import { createE2EApiKey } from "../../fixtures";

test.describe("Public API streaming", () => {
  test("rejects missing API keys before provider execution", async ({ request }) => {
    const response = await request.post("/api/v1/chat/completions", {
      data: {
        model: "ollama:qwen2.5:7b",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      },
    });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        message: "Unauthorized",
        type: "invalid_request_error",
        code: "invalid_api_key",
      },
    });
  });

  test("streams OpenAI-compatible SSE chunks with Bearer API key auth @ollama", async ({ request }) => {
    test.skip(!process.env.E2E_OLLAMA, "Set E2E_OLLAMA=1 to run live local-model public API streaming tests.");
    test.setTimeout(120_000);

    const apiKey = await createE2EApiKey();
    const response = await request.post("/api/v1/chat/completions", {
      timeout: 90_000,
      headers: {
        Authorization: `Bearer ${apiKey.key}`,
      },
      data: {
        model: "ollama:qwen2.5:7b",
        stream: true,
        temperature: 0,
        max_tokens: 48,
        messages: [
          {
            role: "system",
            content: "Reply with one short sentence.",
          },
          {
            role: "user",
            content: "Say that AgentHub public API streaming works.",
          },
        ],
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/event-stream");

    const body = await response.text();
    expect(body).toContain("data: [DONE]");

    const chunks = body
      .split("\n\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
      .map(
        (line) =>
          JSON.parse(line.slice("data: ".length)) as {
            object?: string;
            choices?: Array<{ delta?: { content?: string } }>;
          },
      );

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((chunk) => chunk.choices?.some((choice) => choice.delta?.content))).toBe(true);
    expect(chunks.every((chunk) => chunk.object === "chat.completion.chunk")).toBe(true);
  });
});

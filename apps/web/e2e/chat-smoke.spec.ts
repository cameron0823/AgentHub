import { expect, test, type Page, type Route } from "@playwright/test";

type Session = {
  id: string;
  agentId?: string | null;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  reasoning?: string | null;
  model?: string | null;
  toolCalls?: string | null;
  createdAt: string;
};

const now = "2026-05-11T00:00:00.000Z";
const fallbackSession: Session = {
  id: "session-fallback",
  title: "New Chat",
  model: "ollama:qwen2.5:7b",
  createdAt: now,
  updatedAt: now,
};

function trpcEnvelope(json: unknown) {
  return [{ result: { data: { json } } }];
}

function parseBatchInput(url: string): Record<string, { json: any }> | undefined {
  const input = new URL(url).searchParams.get("input");
  if (!input) return undefined;
  return JSON.parse(input) as Record<string, { json: any }>;
}

async function fulfillJson(route: Route, json: unknown) {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(json),
  });
}

async function installTrpcMocks(page: Page, options: { sessions?: Session[]; messages?: Message[] } = {}) {
  const sessions = [...(options.sessions || [fallbackSession])];
  const messagesBySession = new Map<string, Message[]>();
  for (const message of options.messages || []) {
    const list = messagesBySession.get(message.sessionId) || [];
    list.push(message);
    messagesBySession.set(message.sessionId, list);
  }

  await page.route("**/api/trpc/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const path = decodeURIComponent(new URL(url).pathname);
    const body = request.postDataJSON?.() as Record<string, { json: any }> | undefined;
    const queryInput = parseBatchInput(url) as Record<string, { json: any }> | undefined;
    const procedures = path.split("/api/trpc/")[1]?.split(",") || [];

    const dispatch = (procedure: string, input: any) => {
      if (procedure === "sessions.list") return sessions;
      if (procedure === "agents.list") return [];
      if (procedure === "providers.catalog")
        return {
          providers: [{ id: "ollama", name: "Ollama", status: "unhealthy", latency: -1 }],
          models: [
            {
              id: "ollama:qwen2.5:7b",
              name: "qwen2.5:7b",
              providerId: "ollama",
              providerName: "Ollama",
              providerStatus: "unhealthy",
              providerLatency: -1,
              capabilities: ["chat"],
            },
          ],
        };
      if (procedure === "messages.list") return messagesBySession.get(input?.sessionId || "") || [];
      if (procedure === "sessions.create") {
        const session: Session = {
          id: `session-${sessions.length + 1}`,
          agentId: input.agentId || null,
          title: input.title || "New Chat",
          model: input.model || "ollama:qwen2.5:7b",
          createdAt: now,
          updatedAt: now,
        };
        sessions.unshift(session);
        return session;
      }
      if (procedure === "sessions.update") {
        const session = sessions.find((item) => item.id === input.id);
        if (session) {
          session.title = input.title || session.title;
          session.model = input.model || session.model;
          session.updatedAt = now;
        }
        return { success: true };
      }
      if (procedure === "sessions.delete") {
        const index = sessions.findIndex((item) => item.id === input.id);
        if (index >= 0) sessions.splice(index, 1);
        return { success: true };
      }
      if (procedure === "messages.create") {
        const message: Message = {
          id: input.id || `message-${Date.now()}`,
          sessionId: input.sessionId,
          role: input.role,
          content: input.content,
          reasoning: input.reasoning || null,
          model: input.model || null,
          toolCalls: input.toolCalls || null,
          createdAt: now,
        };
        const list = messagesBySession.get(message.sessionId) || [];
        list.push(message);
        messagesBySession.set(message.sessionId, list);
        return message;
      }
      return null;
    };

    await fulfillJson(
      route,
      procedures.map((procedure, index) => ({
        result: {
          data: { json: dispatch(procedure, body?.[String(index)]?.json ?? queryInput?.[String(index)]?.json) },
        },
      })),
    );
  });
}

async function installStreamMock(page: Page, options: { delayMs?: number; delayedFirstResponse?: boolean } = {}) {
  let requestCount = 0;
  await page.route("**/api/chat/stream", async (route) => {
    requestCount += 1;
    const delayMs = options.delayedFirstResponse && requestCount === 1 ? (options.delayMs ?? 500) : 25;
    const chunks = [
      { type: "content", content: "Deterministic answer with math $E=mc^2$." },
      {
        type: "tool_call",
        toolCall: {
          id: "tool-call-1",
          type: "function",
          function: { name: "calculator", arguments: JSON.stringify({ expression: "2+2" }) },
        },
      },
      { type: "tool_result", toolCallId: "tool-call-1", toolName: "calculator", result: { value: 4 } },
      { type: "done" },
      { type: "persisted", messageId: "assistant-persisted" },
    ];
    const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("");
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body,
    });
  });
}

test("provider fallback, first message title, stop, math, and tool cards", async ({ page }) => {
  await installTrpcMocks(page);
  await installStreamMock(page, { delayedFirstResponse: true, delayMs: 500 });

  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "Model" })).toHaveValue("ollama:qwen2.5:7b");
  await expect(page.getByText("Local Ollama is unavailable or has no chat models")).toBeVisible();

  await page.getByPlaceholder("Message your local AI...").fill("Explain mass energy equivalence for agents");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Explain mass energy equivalence")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop generation" })).toBeVisible();
  await page.getByRole("button", { name: "Stop generation" }).click();
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();

  await page.getByPlaceholder("Message your local AI...").fill("Render math and tool output");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText("Deterministic answer with math")).toBeVisible();
  await expect(page.locator(".katex").first()).toBeVisible();
  await expect(page.getByText("Tool call: calculator")).toBeVisible();
  await expect(page.getByText("Tool result: calculator")).toBeVisible();
});

test("long chat virtualizes and starts near the newest messages", async ({ page }) => {
  const longMessages: Message[] = Array.from({ length: 140 }, (_, index) => ({
    id: `message-${index}`,
    sessionId: fallbackSession.id,
    role: index % 2 === 0 ? "user" : "assistant",
    content: index === 139 ? "Newest bottom message" : `Historical message ${index}`,
    reasoning: null,
    model: index % 2 === 0 ? null : "ollama:qwen2.5:7b",
    toolCalls: null,
    createdAt: now,
  }));

  await installTrpcMocks(page, { messages: longMessages });
  await installStreamMock(page);

  await page.goto("/");
  await expect(page.getByTestId("message-list")).toBeVisible();
  await expect(page.getByText("Newest bottom message")).toBeVisible();
  await expect(page.getByText("Historical message 0")).toHaveCount(0);
});

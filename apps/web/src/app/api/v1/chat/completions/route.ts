import { NextRequest, NextResponse } from "next/server";
import { AgentRuntime } from "@agenthub/agent-runtime";
import { db } from "@/server/db";
import { agents, providerCredentials } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { checkProviderPlanAccess, providerRegistry, type ProviderRegistry } from "@agenthub/ai-providers";
import { validateApiKey } from "@/server/routers/apiKeys";
import { decryptProviderCredentials } from "@/server/provider-credentials";
import { fetchAcceptedMemoriesForAgent, formatMemoryBlock, appendMemoryBlockToSystemPrompt } from "@/server/memory";
import { ensureUserQuota } from "@/server/quotas";

export const runtime = "nodejs";

const MAX_MESSAGES = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OAIMessage = { role: "system" | "user" | "assistant"; content: string };

interface CompletionsRequest {
  model: string;
  messages: OAIMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

function makeId() {
  return `chatcmpl-${Math.random().toString(36).slice(2, 12)}`;
}

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return validateApiKey(auth.slice(7).trim());
}

interface ResolvedRuntime {
  runtime: AgentRuntime;
  modelLabel: string;
}

async function resolveRuntime(
  model: string,
  userId: string,
  temperature: number,
  maxTokens: number,
  registry: ProviderRegistry,
  systemOverride?: string,
): Promise<ResolvedRuntime | null> {
  if (UUID_RE.test(model)) {
    // model is an agent ID
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, model), eq(agents.userId, userId)))
      .limit(1);
    if (!agent) return null;

    let systemPrompt = systemOverride ?? agent.systemPrompt;
    if (!systemOverride && agent.memoryEnabled) {
      const memories = await fetchAcceptedMemoriesForAgent(agent.id, userId);
      const block = formatMemoryBlock(memories);
      systemPrompt = appendMemoryBlockToSystemPrompt(systemPrompt, block) ?? systemPrompt;
    }

    return {
      runtime: new AgentRuntime({
        model: agent.model ?? "ollama:qwen2.5:7b",
        systemPrompt,
        temperature,
        maxTokens,
        registry,
      }),
      modelLabel: model,
    };
  }

  // Direct provider:model string (e.g. "ollama:qwen2.5:7b", "openai:gpt-4o")
  return {
    runtime: new AgentRuntime({ model, systemPrompt: systemOverride, temperature, maxTokens, registry }),
    modelLabel: model,
  };
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: { message: "Unauthorized", type: "invalid_request_error", code: "invalid_api_key" } },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON", type: "invalid_request_error" } }, { status: 400 });
  }

  const { model, messages, stream = false, temperature, max_tokens } = body as CompletionsRequest;

  if (!model || typeof model !== "string") {
    return NextResponse.json(
      { error: { message: "model is required", type: "invalid_request_error" } },
      { status: 400 },
    );
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: { message: "messages must be a non-empty array", type: "invalid_request_error" } },
      { status: 400 },
    );
  }
  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json(
      { error: { message: `messages exceeds limit of ${MAX_MESSAGES}`, type: "invalid_request_error" } },
      { status: 400 },
    );
  }

  const quota = await ensureUserQuota(userId);
  const encryptedUserCreds = await db
    .select()
    .from(providerCredentials)
    .where(and(eq(providerCredentials.userId, userId), eq(providerCredentials.isEnabled, true)));
  const userCreds = decryptProviderCredentials(encryptedUserCreds).filter(
    (credential) => checkProviderPlanAccess(credential.providerId, quota.plan).allowed,
  );
  const userRegistry: ProviderRegistry =
    userCreds.length > 0
      ? providerRegistry.forUser(
          userCreds.map((c) => ({
            providerId: c.providerId,
            authType: c.authType as "api_key" | "oauth",
            apiKey: c.apiKey || undefined,
            baseUrl: c.baseUrl || undefined,
            accessToken: c.accessToken || undefined,
            expiresAt: c.expiresAt,
          })),
        )
      : providerRegistry;

  const systemMsg = messages.find((m) => m.role === "system");
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const resolved = await resolveRuntime(
    model,
    userId,
    temperature ?? 0.7,
    max_tokens ?? 4096,
    userRegistry,
    systemMsg?.content,
  );
  if (!resolved) {
    return NextResponse.json(
      { error: { message: "Model or agent not found", type: "invalid_request_error" } },
      { status: 404 },
    );
  }

  const id = makeId();
  const created = Math.floor(Date.now() / 1000);
  const sessionId = `oai-${userId}-${Date.now()}`;

  if (stream) {
    const encoder = new TextEncoder();
    const responseBody = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of resolved.runtime.run({ sessionId, messages: chatMessages, tools: [] })) {
            if (chunk.type === "content" && chunk.content) {
              const delta = {
                id,
                object: "chat.completion.chunk",
                created,
                model: resolved.modelLabel,
                choices: [{ index: 0, delta: { content: chunk.content }, finish_reason: null }],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(delta)}\n\n`));
            }
          }
          const done = {
            id,
            object: "chat.completion.chunk",
            created,
            model: resolved.modelLabel,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(done)}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch {
          const errEvent = { error: { message: "Chat completion failed", type: "server_error" } };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errEvent)}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(responseBody, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // Non-streaming
  let output = "";
  try {
    for await (const chunk of resolved.runtime.run({ sessionId, messages: chatMessages, tools: [] })) {
      if (chunk.type === "content" && chunk.content) output += chunk.content;
    }
  } catch {
    return NextResponse.json({ error: { message: "Chat completion failed", type: "server_error" } }, { status: 500 });
  }

  const promptTokens = messages.reduce((a, m) => a + Math.ceil(m.content.length / 4), 0);
  const completionTokens = Math.ceil(output.length / 4);

  return NextResponse.json({
    id,
    object: "chat.completion",
    created,
    model: resolved.modelLabel,
    choices: [{ index: 0, message: { role: "assistant", content: output }, finish_reason: "stop" }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  });
}

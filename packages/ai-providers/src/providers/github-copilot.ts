import { OpenAICompatibleProvider } from "./openai-compatible";
import type { ChatOptions, ChatStreamChunk, ModelInfo, ProviderHealth } from "../types";

const COPILOT_BASE_URL = "https://api.githubcopilot.com";

interface CopilotApiModel {
  id?: string;
  name?: string;
  capabilities?: unknown;
}

type CopilotModelsPayload =
  | CopilotApiModel[]
  | {
      data?: CopilotApiModel[];
      models?: CopilotApiModel[];
    };

const COPILOT_FALLBACK_MODELS: ModelInfo[] = [
  { id: "gpt-4.1", name: "GPT-4.1", capabilities: ["chat", "tools"] },
  { id: "gpt-5-mini", name: "GPT-5 mini", capabilities: ["chat", "tools"] },
  { id: "gpt-5.2", name: "GPT-5.2", capabilities: ["chat", "tools", "reasoning"] },
  { id: "gpt-5.2-codex", name: "GPT-5.2-Codex", capabilities: ["chat", "tools", "reasoning"] },
  { id: "gpt-5.3-codex", name: "GPT-5.3-Codex", capabilities: ["chat", "tools", "reasoning"] },
  { id: "gpt-5.4", name: "GPT-5.4", capabilities: ["chat", "tools", "reasoning"] },
  { id: "gpt-5.4-mini", name: "GPT-5.4 mini", capabilities: ["chat", "tools"] },
  { id: "gpt-5.4-nano", name: "GPT-5.4 nano", capabilities: ["chat", "tools"] },
  { id: "gpt-5.5", name: "GPT-5.5", capabilities: ["chat", "tools", "reasoning"] },
  { id: "claude-haiku-4.5", name: "Claude Haiku 4.5", capabilities: ["chat", "tools"] },
  { id: "claude-opus-4.5", name: "Claude Opus 4.5", capabilities: ["chat", "tools", "reasoning"] },
  { id: "claude-opus-4.6", name: "Claude Opus 4.6", capabilities: ["chat", "tools", "reasoning"] },
  { id: "claude-opus-4.6-fast", name: "Claude Opus 4.6 (fast mode)", capabilities: ["chat", "tools", "reasoning"] },
  { id: "claude-opus-4.7", name: "Claude Opus 4.7", capabilities: ["chat", "tools", "reasoning"] },
  { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", capabilities: ["chat", "tools", "reasoning"] },
  { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6", capabilities: ["chat", "tools", "reasoning"] },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", capabilities: ["chat", "vision", "tools"] },
  { id: "gemini-3-flash", name: "Gemini 3 Flash", capabilities: ["chat", "vision", "tools"] },
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", capabilities: ["chat", "vision", "tools"] },
  { id: "grok-code-fast-1", name: "Grok Code Fast 1", capabilities: ["chat", "tools"] },
  { id: "raptor-mini", name: "Raptor mini", capabilities: ["chat", "tools"] },
  { id: "goldeneye", name: "Goldeneye", capabilities: ["chat", "tools", "reasoning"] },
];

function getCopilotModelRecords(payload: CopilotModelsPayload): CopilotApiModel[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.models)) return payload.models;
  return [];
}

function normalizeCapabilities(value: unknown): ModelInfo["capabilities"] {
  const capabilities = new Set<ModelInfo["capabilities"][number]>(["chat"]);
  const text = (typeof value === "string" ? value : JSON.stringify(value ?? "")).toLowerCase();
  if (text.includes("vision") || text.includes("image") || text.includes("multimodal")) capabilities.add("vision");
  if (text.includes("tool") || text.includes("function")) capabilities.add("tools");
  if (text.includes("reason") || text.includes("thinking")) capabilities.add("reasoning");
  return Array.from(capabilities);
}

function normalizeCopilotModel(model: CopilotApiModel): ModelInfo | null {
  const id = model.id || model.name;
  if (!id) return null;
  return {
    id,
    name: model.name || id,
    capabilities: normalizeCapabilities(model.capabilities),
  };
}

export class GitHubCopilotProvider extends OpenAICompatibleProvider {
  override readonly type = "cloud" as const;
  private accessToken: string;

  constructor(accessToken: string) {
    super({ id: "github-copilot", name: "GitHub Copilot", baseUrl: COPILOT_BASE_URL });
    this.accessToken = accessToken;
  }

  override async listModels() {
    try {
      const res = await fetch(`${COPILOT_BASE_URL}/models`, {
        headers: this.copilotHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return COPILOT_FALLBACK_MODELS;

      const payload = (await res.json()) as CopilotModelsPayload;
      const models = getCopilotModelRecords(payload)
        .map(normalizeCopilotModel)
        .filter((model): model is ModelInfo => Boolean(model));
      if (models.length === 0) return COPILOT_FALLBACK_MODELS;

      return Array.from(new Map(models.map((model) => [model.id, model])).values());
    } catch {
      return COPILOT_FALLBACK_MODELS;
    }
  }

  override async healthCheck(): Promise<ProviderHealth> {
    try {
      const start = Date.now();
      const res = await fetch(`${COPILOT_BASE_URL}/models`, {
        headers: this.copilotHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      return {
        id: "github-copilot",
        name: "GitHub Copilot",
        status: res.ok ? "healthy" : "unhealthy",
        latency: Date.now() - start,
      };
    } catch {
      return { id: "github-copilot", name: "GitHub Copilot", status: "unhealthy", latency: -1 };
    }
  }

  override async *streamChat(options: ChatOptions): AsyncIterable<ChatStreamChunk> {
    const patched: ChatOptions = {
      ...options,
      // Inject Copilot-specific headers via a custom fetch signal workaround is not ideal.
      // Instead we override the fetch call here.
    };
    // We need to patch the fetch with auth headers. The base class uses fetch directly,
    // so we shadow it within this method via monkey-patch on the Request prototype —
    // instead, we replicate the stream logic with our headers.
    yield* this.streamCopilotChat(patched);
  }

  private async *streamCopilotChat(options: ChatOptions): AsyncIterable<ChatStreamChunk> {
    const body = this.buildBody(options, true);
    const res = await fetch(`${COPILOT_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.copilotHeaders() },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GitHub Copilot error: ${err}`);
    }

    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") {
            yield { type: "done" };
            return;
          }

          let data: { choices?: Array<{ delta?: { content?: string | null } }> };
          try {
            data = JSON.parse(payload);
          } catch {
            continue;
          }

          for (const choice of data.choices || []) {
            if (choice.delta?.content) yield { type: "content", content: choice.delta.content };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private copilotHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Editor-Version": "AgentHub/1.0",
      "Copilot-Integration-Id": "vscode-chat",
    };
  }

  private buildBody(options: ChatOptions, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options.model,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}),
      })),
      stream,
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options.tools?.length) body.tools = options.tools;
    return body;
  }
}

import { OpenAICompatibleProvider } from "./openai-compatible";
import type { ChatOptions, ChatStreamChunk, ModelInfo, ProviderHealth } from "../types";

const COPILOT_BASE_URL = "https://api.githubcopilot.com";

const COPILOT_MODELS: ModelInfo[] = [
  { id: "gpt-4o",            name: "GPT-4o",            capabilities: ["chat", "tools"] },
  { id: "gpt-4o-mini",       name: "GPT-4o Mini",       capabilities: ["chat", "tools"] },
  { id: "claude-3.5-sonnet", name: "Claude 3.5 Sonnet", capabilities: ["chat", "tools"] },
  { id: "o1",                name: "o1",                capabilities: ["chat"] },
  { id: "o3-mini",           name: "o3-mini",           capabilities: ["chat"] },
];

export class GitHubCopilotProvider extends OpenAICompatibleProvider {
  private accessToken: string;

  constructor(accessToken: string) {
    super({ id: "github-copilot", name: "GitHub Copilot", baseUrl: COPILOT_BASE_URL });
    this.accessToken = accessToken;
  }

  override async listModels() {
    return COPILOT_MODELS;
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
          if (!payload || payload === "[DONE]") { yield { type: "done" }; return; }

          let data: { choices?: Array<{ delta?: { content?: string | null } }> };
          try { data = JSON.parse(payload); } catch { continue; }

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
      messages: options.messages.map(m => ({
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

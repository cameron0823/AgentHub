import type {
  ChatOptions,
  ChatResponse,
  ChatStreamChunk,
  ModelInfo,
  ModelProvider,
  ProviderHealth,
  ToolCall,
} from "../types";

export interface OpenAIProviderOptions {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
}

interface OpenAIModel {
  id: string;
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export class OpenAIProvider implements ModelProvider {
  readonly id = "openai";
  readonly name = "OpenAI";
  readonly type = "cloud" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly organization?: string;

  constructor(options: OpenAIProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://api.openai.com").replace(/\/$/, "");
    this.organization = options.organization;
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
      };
      if (this.organization) headers["OpenAI-Organization"] = this.organization;

      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return this.getDefaultModels();
      const data = (await res.json()) as { data?: OpenAIModel[] };
      return (data.data || [])
        .filter((m) => m.id.includes("gpt") || m.id.includes("o1") || m.id.includes("o3"))
        .map((m) => ({
          id: m.id,
          name: m.id,
          capabilities: ["chat", "tools"] as ("chat" | "vision" | "tools" | "embeddings")[],
        }));
    } catch {
      return this.getDefaultModels();
    }
  }

  private getDefaultModels(): ModelInfo[] {
    return [
      { id: "gpt-4o", name: "GPT-4o", capabilities: ["chat", "vision", "tools"] },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", capabilities: ["chat", "vision", "tools"] },
      { id: "o3-mini", name: "o3-mini", capabilities: ["chat", "tools", "reasoning"] },
      { id: "o1", name: "o1", capabilities: ["chat", "tools", "reasoning"] },
      { id: "o1-mini", name: "o1-mini", capabilities: ["chat", "tools", "reasoning"] },
    ];
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const start = Date.now();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
      };
      if (this.organization) headers["OpenAI-Organization"] = this.organization;

      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      return {
        id: this.id,
        name: this.name,
        status: res.ok ? "healthy" : "unhealthy",
        latency: Date.now() - start,
      };
    } catch {
      return { id: this.id, name: this.name, status: "unhealthy", latency: -1 };
    }
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(this.toChatBody(options, false)),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI error: ${err}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          reasoning_content?: string | null;
          tool_calls?: ToolCall[];
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const message = data.choices?.[0]?.message;
    return {
      content: message?.content || "",
      reasoning: message?.reasoning_content || undefined,
      toolCalls: message?.tool_calls?.length ? message.tool_calls : undefined,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          }
        : undefined,
    };
  }

  async *streamChat(options: ChatOptions): AsyncIterable<ChatStreamChunk> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(this.toChatBody(options, true)),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI error: ${err}`);
    }

    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const toolCallChunks = new Map<number, ToolCall>();
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
            if (payload === "[DONE]") {
              for (const tc of Array.from(toolCallChunks.values())) {
                if (tc.function.name) yield { type: "tool_call", toolCall: tc };
              }
              yield { type: "done" };
              return;
            }
            continue;
          }

          let data: OpenAIStreamChunk;
          try {
            data = JSON.parse(payload) as OpenAIStreamChunk;
          } catch {
            continue;
          }

          for (const choice of data.choices || []) {
            const delta = choice.delta;
            if (delta?.content) yield { type: "content", content: delta.content };
            if (delta?.reasoning_content) yield { type: "reasoning", content: delta.reasoning_content };
            for (const tc of delta?.tool_calls || []) {
              const index = tc.index ?? toolCallChunks.size;
              const existing = toolCallChunks.get(index) || {
                id: tc.id || `${this.id}_tool_${index}`,
                type: "function" as const,
                function: { name: "", arguments: "" },
              };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.function.name += tc.function.name;
              if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
              toolCallChunks.set(index, existing);
            }
          }

          if (data.usage) {
            yield {
              type: "done",
              usage: {
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
              },
            };
            return;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (this.organization) headers["OpenAI-Organization"] = this.organization;
    return headers;
  }

  private toChatBody(options: ChatOptions, stream: boolean) {
    const body: Record<string, unknown> = {
      model: options.model,
      messages: options.messages.map((message) => {
        const next: Record<string, unknown> = {
          role: message.role,
          content: message.content,
        };
        if (message.name) next.name = message.name;
        if (message.tool_call_id) next.tool_call_id = message.tool_call_id;
        if (message.tool_calls?.length) next.tool_calls = message.tool_calls;
        return next;
      }),
      stream,
    };

    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options.tools?.length) body.tools = options.tools;

    return body;
  }
}

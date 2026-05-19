import type {
  ChatOptions,
  ChatResponse,
  ChatStreamChunk,
  ModelInfo,
  ModelProvider,
  ProviderHealth,
  ToolCall,
} from "../types";

export interface AnthropicProviderOptions {
  apiKey: string;
  baseUrl?: string;
}

interface AnthropicContentBlock {
  type: "text" | "thinking" | "tool_use";
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicMessage {
  content: AnthropicContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface AnthropicStreamEvent {
  type: string;
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
  };
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
  message?: AnthropicMessage;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic (Claude)";
  readonly type = "cloud" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "claude-sonnet-4-20250514", name: "Claude 4 Sonnet", capabilities: ["chat", "vision", "tools"] },
      { id: "claude-opus-4-20250514", name: "Claude 4 Opus", capabilities: ["chat", "vision", "tools", "reasoning"] },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", capabilities: ["chat", "vision", "tools"] },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", capabilities: ["chat", "tools"] },
    ];
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const start = Date.now();
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
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
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(this.toChatBody(options, false)),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic error: ${err}`);
    }

    const data = (await res.json()) as AnthropicMessage;
    const textBlocks = data.content?.filter((b) => b.type === "text") || [];
    const thinkingBlocks = data.content?.filter((b) => b.type === "thinking") || [];
    const toolBlocks = data.content?.filter((b) => b.type === "tool_use") || [];

    return {
      content: textBlocks.map((b) => b.text).join(""),
      reasoning: thinkingBlocks.map((b) => b.thinking).join(""),
      toolCalls: toolBlocks.map((b) => ({
        id: b.id || `${this.id}_tool`,
        type: "function" as const,
        function: {
          name: b.name || "",
          arguments: JSON.stringify(b.input || {}),
        },
      })),
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens || 0,
            completionTokens: data.usage.output_tokens || 0,
            totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
          }
        : undefined,
    };
  }

  async *streamChat(options: ChatOptions): AsyncIterable<ChatStreamChunk> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(this.toChatBody(options, true)),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic error: ${err}`);
    }

    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const toolCalls = new Map<number, ToolCall>();
    let toolCallIndex = -1;

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
          if (!payload) continue;

          let event: AnthropicStreamEvent;
          try {
            event = JSON.parse(payload) as AnthropicStreamEvent;
          } catch {
            continue;
          }

          if (event.type === "content_block_delta") {
            if (event.delta?.type === "text_delta" && event.delta.text) {
              yield { type: "content", content: event.delta.text };
            }
            if (event.delta?.type === "thinking_delta" && event.delta.thinking) {
              yield { type: "reasoning", content: event.delta.thinking };
            }
            if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
              const tc = toolCalls.get(toolCallIndex);
              if (tc) {
                tc.function.arguments += event.delta.partial_json;
              }
            }
          }

          if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
            toolCallIndex++;
            toolCalls.set(toolCallIndex, {
              id: event.content_block.id || `${this.id}_tool_${toolCallIndex}`,
              type: "function",
              function: {
                name: event.content_block.name || "",
                arguments: JSON.stringify(event.content_block.input || {}),
              },
            });
          }

          if (event.type === "message_stop") {
            for (const tc of Array.from(toolCalls.values())) {
              if (tc.function.name) yield { type: "tool_call", toolCall: tc };
            }
            yield { type: "done" };
            return;
          }

          if (event.usage) {
            yield {
              type: "done",
              usage: {
                promptTokens: event.usage.input_tokens || 0,
                completionTokens: event.usage.output_tokens || 0,
                totalTokens: (event.usage.input_tokens || 0) + (event.usage.output_tokens || 0),
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

  private toChatBody(options: ChatOptions, stream: boolean) {
    const systemMessages = options.messages.filter((m) => m.role === "system");
    const nonSystem = options.messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model: options.model,
      max_tokens: options.maxTokens || 4096,
      messages: nonSystem.map((message) => {
        if (message.role === "tool") {
          return {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: message.tool_call_id,
                content: message.content,
              },
            ],
          };
        }
        if (message.tool_calls?.length) {
          return {
            role: "assistant",
            content: [
              ...(message.content ? [{ type: "text", text: message.content }] : []),
              ...message.tool_calls.map((tc) => ({
                type: "tool_use",
                id: tc.id,
                name: tc.function.name,
                input: JSON.parse(tc.function.arguments || "{}"),
              })),
            ],
          };
        }
        if (Array.isArray(message.content)) {
          return {
            role: message.role,
            content: message.content.map((part) =>
              part.type === "text"
                ? { type: "text", text: part.text }
                : { type: "image", source: { type: "url", url: part.url } },
            ),
          };
        }
        return { role: message.role, content: message.content };
      }),
      stream,
    };

    if (systemMessages.length > 0) {
      body.system = systemMessages.map((m) => m.content).join("\n");
    }
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.tools?.length) {
      body.tools = options.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    return body;
  }
}

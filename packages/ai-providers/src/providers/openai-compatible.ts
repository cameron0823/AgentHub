import type {
  ChatOptions,
  ChatResponse,
  ChatStreamChunk,
  ImageGenerationOptions,
  ImageGenerationResponse,
  ModelInfo,
  ModelProvider,
  ProviderHealth,
  ToolCall,
} from "../types";
import {
  DEFAULT_IMAGE_GENERATION_MODEL,
  imageGenerationRequestBody,
  normalizeImageGenerationResponse,
  type OpenAIImageGenerationPayload,
} from "../image-generation";

interface OpenAIModel {
  id: string;
  object?: string;
}

interface OpenAIToolCallChunk {
  id?: string;
  index?: number;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface OpenAIChoiceDelta {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: OpenAIToolCallChunk[];
}

interface OpenAIStreamChoice {
  delta?: OpenAIChoiceDelta;
  finish_reason?: string | null;
}

interface OpenAIStreamChunk {
  choices?: OpenAIStreamChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: ToolCall[];
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface OpenAICompatibleProviderOptions {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  apiPath?: string;
  type?: "local" | "cloud";
}

const DEFAULT_API_PATH = "/v1";
const DEFAULT_MODELS_ENDPOINT = "/v1/models";
const DEFAULT_CHAT_COMPLETIONS_ENDPOINT = "/v1/chat/completions";
const DEFAULT_IMAGE_GENERATIONS_ENDPOINT = "/v1/images/generations";

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: string;
  readonly name: string;
  readonly type: "local" | "cloud";
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly apiPath: string;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.id = options.id;
    this.name = options.name;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.apiPath = normalizeApiPath(options.apiPath);
    this.type = options.type || "local";
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(this.url(DEFAULT_MODELS_ENDPOINT, "/models"), {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: OpenAIModel[] };
      return (data.data || []).map((model) => ({
        id: model.id,
        name: model.id,
        capabilities: ["chat", "tools"],
      }));
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const start = Date.now();
      const res = await fetch(this.url(DEFAULT_MODELS_ENDPOINT, "/models"), {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      return {
        id: this.id,
        name: this.name,
        status: res.ok ? "healthy" : "unhealthy",
        latency: Date.now() - start,
      };
    } catch {
      return {
        id: this.id,
        name: this.name,
        status: "unhealthy",
        latency: -1,
      };
    }
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const res = await fetch(this.url(DEFAULT_CHAT_COMPLETIONS_ENDPOINT, "/chat/completions"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(this.toChatBody(options, false)),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${this.name} error: ${err}`);
    }

    const data = (await res.json()) as OpenAIChatResponse;
    const message = data.choices?.[0]?.message;
    return {
      content: message?.content || "",
      reasoning: message?.reasoning_content || undefined,
      toolCalls: message?.tool_calls?.length ? message.tool_calls : undefined,
      usage: this.normalizeUsage(data.usage),
    };
  }

  async *streamChat(options: ChatOptions): AsyncIterable<ChatStreamChunk> {
    const res = await fetch(this.url(DEFAULT_CHAT_COMPLETIONS_ENDPOINT, "/chat/completions"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(this.toChatBody(options, true)),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${this.name} error: ${err}`);
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
          if (!payload) continue;

          if (payload === "[DONE]") {
            for (const toolCall of Array.from(toolCallChunks.values())) {
              if (toolCall.function.name) yield { type: "tool_call", toolCall };
            }
            yield { type: "done" };
            return;
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
            for (const toolCallDelta of delta?.tool_calls || []) {
              this.mergeToolCallChunk(toolCallChunks, toolCallDelta);
            }
          }

          const usage = this.normalizeUsage(data.usage);
          if (usage) {
            yield { type: "done", usage };
            return;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async createImage(options: ImageGenerationOptions): Promise<ImageGenerationResponse> {
    const model = options.model || DEFAULT_IMAGE_GENERATION_MODEL;
    const res = await fetch(this.url(DEFAULT_IMAGE_GENERATIONS_ENDPOINT, "/images/generations"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(imageGenerationRequestBody({ ...options, model }, model)),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${this.name} image generation error: ${err}`);
    }

    const data = (await res.json()) as OpenAIImageGenerationPayload;
    return normalizeImageGenerationResponse(data, options, model, this.id);
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

  private authHeaders(): Record<string, string> {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
  }

  private url(defaultEndpoint: string, path: string) {
    const endpoint = this.apiPath === DEFAULT_API_PATH ? defaultEndpoint : `${this.apiPath}${path}`;
    return `${this.baseUrl}${endpoint}`;
  }

  private mergeToolCallChunk(toolCalls: Map<number, ToolCall>, chunk: OpenAIToolCallChunk) {
    const index = chunk.index ?? toolCalls.size;
    const existing = toolCalls.get(index) || {
      id: chunk.id || `${this.id}_tool_call_${index}`,
      type: "function" as const,
      function: { name: "", arguments: "" },
    };

    if (chunk.id) existing.id = chunk.id;
    if (chunk.type) existing.type = chunk.type;
    if (chunk.function?.name) existing.function.name += chunk.function.name;
    if (chunk.function?.arguments) existing.function.arguments += chunk.function.arguments;
    toolCalls.set(index, existing);
  }

  private normalizeUsage(usage?: OpenAIChatResponse["usage"]): ChatResponse["usage"] {
    if (!usage) return undefined;
    return {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    };
  }
}

function normalizeApiPath(apiPath = DEFAULT_API_PATH) {
  const trimmed = apiPath.trim();
  if (!trimmed) return DEFAULT_API_PATH;
  return trimmed.startsWith("/") ? trimmed.replace(/\/$/, "") : `/${trimmed.replace(/\/$/, "")}`;
}

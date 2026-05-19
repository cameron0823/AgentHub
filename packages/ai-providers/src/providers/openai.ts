import type {
  ChatOptions,
  ChatResponse,
  ChatStreamChunk,
  ContentPart,
  ImageGenerationOptions,
  ImageGenerationResponse,
  ModelInfo,
  ModelProvider,
  ProviderHealth,
  SpeechToTextOptions,
  SpeechToTextResponse,
  TextToSpeechOptions,
  TextToSpeechResponse,
  ToolCall,
} from "../types";
import {
  DEFAULT_IMAGE_GENERATION_MODEL,
  imageGenerationRequestBody,
  normalizeImageGenerationResponse,
  type OpenAIImageGenerationPayload,
} from "../image-generation";

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

const DEFAULT_TTS_MODEL = "tts-1";
const DEFAULT_STT_MODEL = "whisper-1";
const DEFAULT_TTS_VOICE = "alloy";

function audioMimeType(format: NonNullable<TextToSpeechOptions["format"]>): string {
  if (format === "mp3") return "audio/mpeg";
  if (format === "wav") return "audio/wav";
  return `audio/${format}`;
}

function toBlobPart(audio: ArrayBuffer | Uint8Array): BlobPart {
  if (audio instanceof ArrayBuffer) return audio;
  const buffer = new ArrayBuffer(audio.byteLength);
  new Uint8Array(buffer).set(audio);
  return buffer;
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

  async textToSpeech(options: TextToSpeechOptions): Promise<TextToSpeechResponse> {
    const format = options.format || "mp3";
    const model = options.model || DEFAULT_TTS_MODEL;
    const voice = options.voice || DEFAULT_TTS_VOICE;
    const res = await fetch(`${this.baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model,
        voice,
        input: options.text,
        response_format: format,
        ...(options.speed ? { speed: options.speed } : {}),
      }),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI TTS error: ${err}`);
    }

    return {
      audio: await res.arrayBuffer(),
      mimeType: res.headers.get("content-type") || audioMimeType(format),
      model,
      voice,
    };
  }

  async speechToText(options: SpeechToTextOptions): Promise<SpeechToTextResponse> {
    const model = options.model || DEFAULT_STT_MODEL;
    const mimeType = options.mimeType || "audio/webm";
    const fileName = options.fileName || "voice-input.webm";
    const form = new FormData();
    const audio =
      options.audio instanceof Blob ? options.audio : new Blob([toBlobPart(options.audio)], { type: mimeType });

    form.append("file", audio, fileName);
    form.append("model", model);
    if (options.language) form.append("language", options.language);
    if (options.prompt) form.append("prompt", options.prompt);

    const res = await fetch(`${this.baseUrl}/v1/audio/transcriptions`, {
      method: "POST",
      headers: this.authHeaders(),
      body: form,
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI STT error: ${err}`);
    }

    const data = (await res.json()) as { text?: string; language?: string; duration?: number };
    return {
      text: data.text || "",
      model,
      language: data.language,
      durationSeconds: data.duration,
    };
  }

  async createImage(options: ImageGenerationOptions): Promise<ImageGenerationResponse> {
    const model = options.model || DEFAULT_IMAGE_GENERATION_MODEL;
    const res = await fetch(`${this.baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(imageGenerationRequestBody({ ...options, model }, model)),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI image generation error: ${err}`);
    }

    const data = (await res.json()) as OpenAIImageGenerationPayload;
    return normalizeImageGenerationResponse(data, options, model, this.id);
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...this.authHeaders(),
    };
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (this.organization) headers["OpenAI-Organization"] = this.organization;
    return headers;
  }

  private serializeContent(content: string | ContentPart[]): unknown {
    if (typeof content === "string") return content;
    return content.map((part) =>
      part.type === "text" ? { type: "text", text: part.text } : { type: "image_url", image_url: { url: part.url } },
    );
  }

  private toChatBody(options: ChatOptions, stream: boolean) {
    const body: Record<string, unknown> = {
      model: options.model,
      messages: options.messages.map((message) => {
        const next: Record<string, unknown> = {
          role: message.role,
          content: this.serializeContent(message.content),
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

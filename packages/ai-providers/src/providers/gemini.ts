import type {
  ChatOptions,
  ChatResponse,
  ChatStreamChunk,
  ModelInfo,
  ModelProvider,
  ProviderHealth,
  ToolCall,
} from "../types";

export interface GeminiProviderOptions {
  apiKey: string;
  baseUrl?: string;
}

interface GeminiContent {
  role?: string;
  parts?: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } }>;
}

interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

interface GeminiStreamChunk {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export class GeminiProvider implements ModelProvider {
  readonly id = "gemini";
  readonly name = "Google Gemini";
  readonly type = "cloud" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: GeminiProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(
        `${this.baseUrl}/v1beta/models?key=${this.apiKey}&pageSize=100`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) return this.getDefaultModels();
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      return (data.models || [])
        .filter((m) => m.name.includes("gemini"))
        .map((m) => ({
          id: m.name.replace("models/", ""),
          name: m.name.replace("models/", ""),
          capabilities: ["chat", "vision", "tools"] as ("chat" | "vision" | "tools" | "embeddings")[],
        }));
    } catch {
      return this.getDefaultModels();
    }
  }

  private getDefaultModels(): ModelInfo[] {
    return [
      { id: "gemini-2.5-pro-preview-03-25", name: "Gemini 2.5 Pro", capabilities: ["chat", "vision", "tools", "reasoning"] },
      { id: "gemini-2.5-flash-preview-04-17", name: "Gemini 2.5 Flash", capabilities: ["chat", "vision", "tools"] },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", capabilities: ["chat", "vision", "tools"] },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", capabilities: ["chat", "vision", "tools"] },
    ];
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const start = Date.now();
      const res = await fetch(
        `${this.baseUrl}/v1beta/models?key=${this.apiKey}&pageSize=1`,
        { signal: AbortSignal.timeout(5000) }
      );
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
    const res = await fetch(
      `${this.baseUrl}/v1beta/models/${options.model}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.toChatBody(options)),
        signal: options.signal,
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini error: ${err}`);
    }

    const data = (await res.json()) as GeminiResponse;
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const textParts = parts.filter((p) => p.text);
    const toolParts = parts.filter((p) => p.functionCall);

    return {
      content: textParts.map((p) => p.text).join(""),
      toolCalls: toolParts.map((p) => ({
        id: `${this.id}_tool_${p.functionCall!.name}`,
        type: "function" as const,
        function: {
          name: p.functionCall!.name,
          arguments: JSON.stringify(p.functionCall!.args || {}),
        },
      })),
      usage: data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount || 0,
            completionTokens: data.usageMetadata.candidatesTokenCount || 0,
            totalTokens: data.usageMetadata.totalTokenCount || 0,
          }
        : undefined,
    };
  }

  async *streamChat(options: ChatOptions): AsyncIterable<ChatStreamChunk> {
    const res = await fetch(
      `${this.baseUrl}/v1beta/models/${options.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.toChatBody(options)),
        signal: options.signal,
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini error: ${err}`);
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
          if (!payload) continue;

          let data: GeminiStreamChunk;
          try {
            data = JSON.parse(payload) as GeminiStreamChunk;
          } catch {
            continue;
          }

          const candidate = data.candidates?.[0];
          const parts = candidate?.content?.parts || [];

          for (const part of parts) {
            if (part.text) yield { type: "content", content: part.text };
            if (part.functionCall) {
              yield {
                type: "tool_call",
                toolCall: {
                  id: `${this.id}_tool_${part.functionCall.name}`,
                  type: "function",
                  function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args || {}),
                  },
                },
              };
            }
          }

          if (candidate?.finishReason && candidate.finishReason !== "STOP") {
            yield { type: "done" };
            return;
          }

          if (data.usageMetadata) {
            yield {
              type: "done",
              usage: {
                promptTokens: data.usageMetadata.promptTokenCount || 0,
                completionTokens: data.usageMetadata.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata.totalTokenCount || 0,
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

  private toChatBody(options: ChatOptions) {
    const contents: GeminiContent[] = [];
    let systemInstruction: string | undefined;

    for (const message of options.messages) {
      if (message.role === "system") {
        systemInstruction = typeof message.content === "string" ? message.content : message.content.map((p) => p.type === "text" ? p.text : "").join("\n");
        continue;
      }

      const role = message.role === "assistant" ? "model" : "user";
      const parts: GeminiContent["parts"] = [];

      if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === "text") {
            parts.push({ text: part.text });
          } else if (part.type === "image_url") {
            parts.push({ inlineData: { mimeType: "image/jpeg", data: part.url } } as { text?: string });
          }
        }
      } else if (message.content) {
        parts.push({ text: message.content });
      }

      if (message.tool_calls?.length) {
        for (const tc of message.tool_calls) {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments || "{}"),
            },
          });
        }
      }

      if (message.role === "tool" && message.tool_call_id) {
        parts.push({
          functionResponse: {
            name: message.name || message.tool_call_id,
            response: { result: message.content },
          },
        });
      }

      contents.push({ role, parts });
    }

    const body: Record<string, unknown> = { contents };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (options.temperature !== undefined) {
      body.generationConfig = { ...(body.generationConfig as object), temperature: options.temperature };
    }
    if (options.maxTokens !== undefined) {
      body.generationConfig = { ...(body.generationConfig as object), maxOutputTokens: options.maxTokens };
    }

    if (options.tools?.length) {
      body.tools = [
        {
          functionDeclarations: options.tools.map((t) => ({
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
          })),
        },
      ];
    }

    return body;
  }
}

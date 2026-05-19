import type { ChatOptions, ChatResponse, ChatStreamChunk, ModelInfo, ModelProvider, ProviderHealth } from "../types";

interface OllamaModelTag {
  name: string;
  model: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

export class OllamaProvider implements ModelProvider {
  readonly id = "ollama";
  readonly name = "Ollama";
  readonly type = "local" as const;
  private baseUrl: string;

  constructor(baseUrl = process.env.OLLAMA_URL || "http://localhost:11434") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { models: OllamaModelTag[] };
      return (data.models || []).map((m) => ({
        id: m.name,
        name: m.name,
        size: m.size,
        parameters: m.details?.parameter_size,
        capabilities: this.inferCapabilities(m.name, m.details),
      }));
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const start = Date.now();
      await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return {
        id: this.id,
        name: this.name,
        status: "healthy",
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
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.toOllamaBody(options, false)),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error: ${err}`);
    }

    const data = await res.json();
    const content = data.message?.content || "";
    const reasoning = this.extractReasoning(content);
    const cleanContent = reasoning ? content.replace(/<think>[\s\S]*?<\/think>/g, "").trim() : content;
    const toolCalls = this.normalizeToolCalls(data.message?.tool_calls);

    return {
      content: cleanContent,
      reasoning: reasoning || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.eval_count
        ? {
            promptTokens: data.prompt_eval_count || 0,
            completionTokens: data.eval_count || 0,
            totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
          }
        : undefined,
    };
  }

  async *streamChat(options: ChatOptions): AsyncIterable<ChatStreamChunk> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.toOllamaBody(options, true)),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error: ${err}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let inReasoning = false;
    let reasoningBuffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            let content = data.message?.content || "";
            const toolCalls = this.normalizeToolCalls(data.message?.tool_calls);

            for (const toolCall of toolCalls) {
              yield { type: "tool_call", toolCall };
            }

            if (data.done) {
              if (inReasoning && reasoningBuffer) {
                yield { type: "reasoning", content: reasoningBuffer };
              }
              yield {
                type: "done",
                usage: data.eval_count
                  ? {
                      promptTokens: data.prompt_eval_count || 0,
                      completionTokens: data.eval_count || 0,
                      totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
                    }
                  : undefined,
              };
              continue;
            }

            if (!content) continue;

            if (!inReasoning && content.includes("<think>")) {
              const parts = content.split("<think>");
              if (parts[0]) yield { type: "content", content: parts[0] };
              inReasoning = true;
              content = parts[1] || "";
            }

            if (inReasoning) {
              if (content.includes("</think>")) {
                const parts = content.split("</think>");
                reasoningBuffer += parts[0];
                yield { type: "reasoning", content: reasoningBuffer };
                reasoningBuffer = "";
                inReasoning = false;
                if (parts[1]) yield { type: "content", content: parts[1] };
              } else {
                reasoningBuffer += content;
                // Don't yield yet, wait for end tag or more content to avoid tiny chunks
                if (reasoningBuffer.length > 50) {
                  yield { type: "reasoning", content: reasoningBuffer };
                  reasoningBuffer = "";
                }
              }
            } else {
              yield { type: "content", content };
            }
          } catch {
            // Ignore malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results = await Promise.all(
      texts.map(async (text) => {
        const res = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
        });
        const data = await res.json();
        return data.embedding as number[];
      }),
    );
    return results;
  }

  private toOllamaBody(options: ChatOptions, stream: boolean) {
    const messages = options.messages.map((m) => {
      const message: Record<string, unknown> = { role: m.role };

      if (Array.isArray(m.content)) {
        const textParts = m.content.filter((p) => p.type === "text");
        const imageParts = m.content.filter((p) => p.type === "image_url");
        message.content = textParts.map((p) => (p.type === "text" ? p.text : "")).join("\n");
        if (imageParts.length > 0) {
          message.images = imageParts.map((p) => (p.type === "image_url" ? p.url : ""));
        }
      } else {
        message.content = m.content;
      }

      if (m.name) message.name = m.name;
      if (m.tool_call_id) message.tool_call_id = m.tool_call_id;
      if (m.tool_calls && m.tool_calls.length > 0) message.tool_calls = m.tool_calls;

      return message;
    });

    const body: Record<string, unknown> = {
      model: options.model,
      messages,
      stream,
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => ({
        type: "function",
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      }));
    }

    if (options.temperature !== undefined || options.maxTokens !== undefined) {
      body.options = {};
      if (options.temperature !== undefined) {
        (body.options as Record<string, unknown>).temperature = options.temperature;
      }
      if (options.maxTokens !== undefined) {
        (body.options as Record<string, unknown>).num_predict = options.maxTokens;
      }
    }

    return body;
  }

  private normalizeToolCalls(toolCalls: unknown): NonNullable<ChatStreamChunk["toolCall"]>[] {
    if (!Array.isArray(toolCalls)) return [];

    return toolCalls
      .map((toolCall, index) => {
        const candidate = toolCall as {
          id?: string;
          type?: string;
          function?: { name?: string; arguments?: unknown };
        };
        const name = candidate.function?.name;
        if (!name) return null;

        const rawArguments = candidate.function?.arguments;
        const args = typeof rawArguments === "string" ? rawArguments : JSON.stringify(rawArguments || {});

        return {
          id: candidate.id || `ollama_tool_call_${index}`,
          type: "function" as const,
          function: {
            name,
            arguments: args,
          },
        };
      })
      .filter((toolCall): toolCall is NonNullable<ChatStreamChunk["toolCall"]> => Boolean(toolCall));
  }

  private extractReasoning(content: string): string | null {
    const match = content.match(/<think>([\s\S]*?)<\/think>/);
    return match ? match[1].trim() : null;
  }

  private inferCapabilities(name: string, details?: OllamaModelTag["details"]): ModelInfo["capabilities"] {
    const caps: ModelInfo["capabilities"] = ["chat"];
    const lower = name.toLowerCase();

    if (lower.includes("embed")) caps.push("embeddings");
    if (lower.includes("llava") || lower.includes("bakllava") || lower.includes("vision") || lower.includes("vl")) {
      caps.push("vision");
    }
    if (details?.parameter_size) {
      const sizeStr = details.parameter_size.toLowerCase();
      const sizeMatch = sizeStr.match(/(\d+)/);
      if (sizeMatch) {
        const size = parseInt(sizeMatch[1], 10);
        if (size >= 7) caps.push("tools");
      }
    } else {
      if (
        lower.includes("llama3") ||
        lower.includes("qwen2") ||
        lower.includes("mistral") ||
        lower.includes("mixtral") ||
        lower.includes("command") ||
        lower.includes("deepseek")
      ) {
        caps.push("tools");
      }
    }

    return caps;
  }
}

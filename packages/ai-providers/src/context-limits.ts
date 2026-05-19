export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // OpenAI
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4-turbo": 128000,
  "gpt-4": 8192,
  "gpt-3.5-turbo": 16385,
  // Anthropic
  "claude-opus-4-20250514": 200000,
  "claude-sonnet-4-20250514": 200000,
  "claude-3-5-sonnet-20241022": 200000,
  "claude-3-5-haiku-20241022": 200000,
  // Gemini
  "gemini-2.5-pro-preview-03-25": 1048576,
  "gemini-2.5-flash-preview-04-17": 1048576,
  "gemini-2.0-flash": 1048576,
  "gemini-1.5-pro": 2000000,
  // Common Ollama models
  "qwen2.5:7b": 32768,
  "qwen2.5:14b": 32768,
  "llama3:8b": 8192,
  "llama3.1:8b": 131072,
  "llama3.2:3b": 131072,
  "mistral:7b": 32768,
  "mixtral:8x7b": 32768,
  "deepseek-r1:7b": 65536,
  "deepseek-r1:14b": 65536,
  "phi3:mini": 128000,
  "phi4:14b": 16384,
  "gemma2:9b": 8192,
  "codellama:7b": 16384,
};

const DEFAULT_LIMIT = 8192;

export function getContextLimit(modelId: string): number {
  if (MODEL_CONTEXT_LIMITS[modelId]) return MODEL_CONTEXT_LIMITS[modelId]!;
  // Strip provider prefix: "ollama:qwen2.5:7b" → "qwen2.5:7b"
  const bare = modelId.includes(":") ? modelId.slice(modelId.indexOf(":") + 1) : modelId;
  return MODEL_CONTEXT_LIMITS[bare] ?? DEFAULT_LIMIT;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: Array<{ content: unknown }>): number {
  return messages.reduce((sum, m) => {
    const text =
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? (m.content as Array<{ type: string; text?: string }>)
              .filter((p) => p.type === "text")
              .map((p) => p.text ?? "")
              .join(" ")
          : "";
    return sum + estimateTokens(text) + 4;
  }, 0);
}

export function truncateToContextLimit<T extends { role: string; content: unknown }>(
  messages: T[],
  limitTokens: number,
  reserveTokens = 1024,
): T[] {
  const budget = limitTokens - reserveTokens;
  const system = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");

  let tokens = estimateMessagesTokens(system);
  const kept: T[] = [];

  for (let i = nonSystem.length - 1; i >= 0; i--) {
    const msg = nonSystem[i]!;
    const t = estimateTokens(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)) + 4;
    if (tokens + t > budget && kept.length > 0) break;
    tokens += t;
    kept.unshift(msg);
  }

  return [...system, ...kept];
}

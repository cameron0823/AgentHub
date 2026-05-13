const TOKEN_ESTIMATE_RATIO = 4; // chars per token approximation
const DEFAULT_MAX_CONTEXT_TOKENS = parseInt(process.env.MAX_CONTEXT_TOKENS || "8000", 10);
const SUMMARIZE_TARGET_RATIO = 0.6; // target 60% of max after summarization

function estimateTokens(text: string): number {
  return Math.ceil(text.length / TOKEN_ESTIMATE_RATIO);
}

function messageTokens(msg: { role: string; content?: string | null }): number {
  return estimateTokens((msg.content ?? "") + msg.role) + 4; // 4 overhead per message
}

function totalTokens(messages: { role: string; content?: string | null }[]): number {
  return messages.reduce((sum, m) => sum + messageTokens(m), 0);
}

async function summarizeOldest(
  messages: { role: string; content?: string | null }[],
  ollamaUrl: string,
  model: string
): Promise<string> {
  const transcript = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content ?? ""}`)
    .join("\n");

  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: `Summarize the following conversation excerpt concisely, preserving key facts, decisions, and context that would be needed to continue the conversation:\n\n${transcript}`,
        stream: false,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return String(data.response ?? "").trim() || "Earlier conversation context has been summarized.";
    }
  } catch {
    // fall through to placeholder
  }
  return "Earlier conversation context has been summarized.";
}

export async function truncateToContextWindow<T extends { role: string; content?: string | null }>(
  messages: T[],
  opts?: { maxTokens?: number; ollamaUrl?: string; model?: string }
): Promise<T[]> {
  const maxTokens = opts?.maxTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
  const ollamaUrl = opts?.ollamaUrl ?? process.env.OLLAMA_URL ?? "http://localhost:11434";
  const model = opts?.model ?? "ollama:qwen2.5:7b";
  const targetTokens = Math.floor(maxTokens * SUMMARIZE_TARGET_RATIO);

  if (totalTokens(messages) <= maxTokens) return messages;

  // Separate system message(s) from the conversation — they must always be kept
  const systemMessages = messages.filter((m) => m.role === "system");
  const conversationMessages = messages.filter((m) => m.role !== "system");

  const systemTokens = totalTokens(systemMessages);

  // Determine how many oldest conversation messages to summarize
  let cutIndex = 0;
  let runningTokens = systemTokens;
  for (let i = conversationMessages.length - 1; i >= 0; i--) {
    runningTokens += messageTokens(conversationMessages[i]!);
    if (runningTokens > targetTokens) {
      cutIndex = i + 1;
      break;
    }
  }

  if (cutIndex === 0) {
    // Even the newest messages exceed the target — keep last 6 messages minimum
    cutIndex = Math.max(0, conversationMessages.length - 6);
  }

  const toSummarize = conversationMessages.slice(0, cutIndex);
  const toKeep = conversationMessages.slice(cutIndex);

  if (toSummarize.length === 0) return messages;

  const summary = await summarizeOldest(toSummarize, ollamaUrl, model.replace(/^ollama:/, ""));

  // Replace summarized messages with a single system summary block
  const summaryMessage = {
    ...toSummarize[0]!,
    role: "system",
    content: `[Conversation summary — earlier turns condensed]\n${summary}`,
  } as T;

  return [...systemMessages, summaryMessage, ...toKeep];
}

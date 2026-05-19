import type { Message, ProviderRegistry } from "@agenthub/ai-providers";

export const DEFAULT_SESSION_TITLE = "New Chat";
export const MAX_SESSION_TITLE_LENGTH = 60;
const TITLE_GENERATION_TIMEOUT_MS = 8_000;
const DEFAULT_TITLE_MODEL = "ollama:qwen2.5:7b";

type TitleMessage = Pick<Message, "role" | "content">;

function textContent(content: Message["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => (part.type === "text" ? part.text : "[image]"))
    .join(" ")
    .trim();
}

function normalizeTitleText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isDefaultSessionTitle(title?: string | null): boolean {
  return !title || title.trim() === DEFAULT_SESSION_TITLE;
}

export function fallbackSessionTitleFromMessages(messages: TitleMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const normalized = normalizeTitleText(textContent(firstUserMessage?.content ?? ""));
  if (!normalized) return DEFAULT_SESSION_TITLE;

  const firstSentence = normalized.split(/[.!?]\s/)[0]?.trim() || normalized;
  if (firstSentence.length <= MAX_SESSION_TITLE_LENGTH) return firstSentence;

  const truncated = firstSentence.slice(0, MAX_SESSION_TITLE_LENGTH + 1);
  const lastSpace = truncated.lastIndexOf(" ");
  const title = (lastSpace > 24 ? truncated.slice(0, lastSpace) : firstSentence.slice(0, MAX_SESSION_TITLE_LENGTH))
    .replace(/[,:;|-]+$/g, "")
    .trim();
  return title || DEFAULT_SESSION_TITLE;
}

export function cleanGeneratedSessionTitle(rawTitle: string, fallbackTitle: string): string {
  const firstLine = rawTitle.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const cleaned = normalizeTitleText(firstLine)
    .replace(/^title\s*:\s*/i, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .trim();

  if (!/[a-z0-9]/i.test(cleaned)) return fallbackTitle;
  if (cleaned.length <= MAX_SESSION_TITLE_LENGTH) return cleaned;

  const truncated = cleaned.slice(0, MAX_SESSION_TITLE_LENGTH + 1);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 24 ? truncated.slice(0, lastSpace) : cleaned.slice(0, MAX_SESSION_TITLE_LENGTH)).trim();
}

export async function generateLlmSessionTitle({
  registry,
  modelId,
  messages,
}: {
  registry: ProviderRegistry;
  modelId?: string | null;
  messages: TitleMessage[];
}): Promise<{ title: string; source: "llm" | "fallback" }> {
  const fallbackTitle = fallbackSessionTitleFromMessages(messages);
  if (messages.length === 0) return { title: fallbackTitle, source: "fallback" };

  const transcript = messages
    .slice(0, 8)
    .map((message) => `${message.role}: ${textContent(message.content).slice(0, 1_200)}`)
    .join("\n\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TITLE_GENERATION_TIMEOUT_MS);

  try {
    const resolution = registry.resolveModel(modelId || DEFAULT_TITLE_MODEL);
    const response = await resolution.provider.chat({
      model: resolution.model,
      temperature: 0.2,
      maxTokens: 32,
      signal: controller.signal,
      messages: [
        {
          role: "system",
          content:
            "Create a short, specific conversation title. Return only the title. No quotes, no markdown, no punctuation at the end.",
        },
        {
          role: "user",
          content: `Conversation:\n${transcript}`,
        },
      ],
    });
    const title = cleanGeneratedSessionTitle(response.content, fallbackTitle);
    return { title, source: title === fallbackTitle ? "fallback" : "llm" };
  } catch {
    return { title: fallbackTitle, source: "fallback" };
  } finally {
    clearTimeout(timeout);
  }
}

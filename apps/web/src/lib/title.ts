const DEFAULT_TITLE = "New Chat";
const MAX_TITLE_LENGTH = 48;

export function generateSessionTitle(message: string): string {
  const normalized = message
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return DEFAULT_TITLE;

  const firstSentence = normalized.split(/[.!?]\s/)[0]?.trim() || normalized;
  if (firstSentence.length <= MAX_TITLE_LENGTH) return firstSentence;

  const truncated = firstSentence.slice(0, MAX_TITLE_LENGTH + 1);
  const lastSpace = truncated.lastIndexOf(" ");
  const title = (lastSpace > 20 ? truncated.slice(0, lastSpace) : firstSentence.slice(0, MAX_TITLE_LENGTH)).trim();
  return title || DEFAULT_TITLE;
}

export function shouldAutoTitle(title?: string | null): boolean {
  return !title || title.trim() === DEFAULT_TITLE;
}

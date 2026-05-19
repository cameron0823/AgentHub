export const ARTIFACT_IFRAME_SANDBOX = "";

const DANGEROUS_ELEMENT_RE =
  /<\/?(script|iframe|object|embed|link|meta|base|form|input|button|textarea|select|option|foreignObject)\b[^>]*>/gi;
const DANGEROUS_BLOCK_RE = /<(script|iframe|object|embed|style|foreignObject)\b[\s\S]*?<\/\1>/gi;
const EVENT_HANDLER_RE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const SRCDOC_RE = /\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
// Block data:text/html URLs in attributes and CSS url() values.
const UNSAFE_URL_ATTR_RE = /\s+(href|src|xlink:href)\s*=\s*(["']?)\s*(?:javascript:|data:text\/html)[^"'\s>]*/gi;
const STYLE_URL_RE = /url\s*\(\s*(["']?)\s*(?:javascript:|data:text\/html)[\s\S]*?\)/gi;

export function sanitizeArtifactHtml(html: string): string {
  return html
    .replace(DANGEROUS_BLOCK_RE, "")
    .replace(DANGEROUS_ELEMENT_RE, "")
    .replace(EVENT_HANDLER_RE, "")
    .replace(SRCDOC_RE, "")
    .replace(UNSAFE_URL_ATTR_RE, "")
    .replace(STYLE_URL_RE, "");
}

export function sanitizeMarkdownUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("#")) return trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;

  try {
    const parsed = new URL(trimmed);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function isSafeRenderableMimeType(mimeType: string | undefined | null): boolean {
  return mimeType === "text/html" || mimeType === "image/svg+xml";
}

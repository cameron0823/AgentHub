import { sanitizeArtifactHtml } from "./security/sanitize";

export type ArtifactKind = "html" | "svg" | "css" | "react";

export interface ChatArtifact {
  id: string;
  title: string;
  kind: ArtifactKind;
  language: string;
  content: string;
  previewHtml: string;
}

const ARTIFACT_LANGUAGES = new Set(["html", "svg", "css", "jsx", "tsx", "react"]);
const FENCED_ARTIFACT_RE = /```([A-Za-z0-9_-]+)([^\n]*)\n([\s\S]*?)```/g;

function stableId(index: number, language: string, content: string) {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash * 31 + content.charCodeAt(i)) >>> 0;
  }
  return `artifact-${index}-${language}-${hash.toString(36)}`;
}

function artifactKind(language: string): ArtifactKind {
  if (language === "svg") return "svg";
  if (language === "css") return "css";
  if (language === "jsx" || language === "tsx" || language === "react") return "react";
  return "html";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function titleFromMeta(meta: string, language: string, index: number) {
  const match = meta.match(/title=(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
  return (match?.[1] || match?.[2] || match?.[3] || `Artifact ${index + 1}.${language}`).trim();
}

function previewFor(kind: ArtifactKind, content: string) {
  if (kind === "html" || kind === "svg") return sanitizeArtifactHtml(content);
  if (kind === "css") {
    return sanitizeArtifactHtml(
      `<style>${content}</style><main class="agenthub-artifact-css-preview">CSS artifact loaded.</main>`,
    );
  }
  return sanitizeArtifactHtml(`<pre>${escapeHtml(content)}</pre>`);
}

export function isChatArtifact(value: unknown): value is ChatArtifact {
  if (!value || typeof value !== "object") return false;
  const artifact = value as Partial<ChatArtifact>;
  return (
    typeof artifact.id === "string" &&
    typeof artifact.title === "string" &&
    typeof artifact.language === "string" &&
    typeof artifact.content === "string" &&
    typeof artifact.previewHtml === "string" &&
    (artifact.kind === "html" || artifact.kind === "svg" || artifact.kind === "css" || artifact.kind === "react")
  );
}

export function extractArtifactsFromContent(content: string): ChatArtifact[] {
  const artifacts: ChatArtifact[] = [];
  for (const match of content.matchAll(FENCED_ARTIFACT_RE)) {
    const language = match[1].toLowerCase();
    if (!ARTIFACT_LANGUAGES.has(language)) continue;
    const source = match[3].trim();
    if (!source) continue;
    const kind = artifactKind(language);
    artifacts.push({
      id: stableId(artifacts.length, language, source),
      title: titleFromMeta(match[2] || "", language, artifacts.length),
      kind,
      language,
      content: source,
      previewHtml: previewFor(kind, source),
    });
  }
  return artifacts;
}

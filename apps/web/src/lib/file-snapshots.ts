export type FileSnapshotSource = "browser_upload" | "desktop_local";

export interface FileSnapshot {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  hash: string;
  binary: boolean;
  contentPreview: string | null;
  source: FileSnapshotSource;
  url?: string;
  s3Key?: string;
  originalPath?: string;
  lastModified?: number;
}

export interface FileMention {
  id: string;
  name: string;
}

export interface DesktopLocalSnapshotInput {
  basename: string;
  size: number;
  mime: string;
  hash: string;
  binary: boolean;
  contentPreview: string | null;
}

export const FILE_MENTION_PATTERN = /@\[([^\]\n]+)\]\(file:([^) \n]+)\)/g;

const PREVIEW_BYTES = 64 * 1024;
const MODEL_CONTEXT_PREVIEW_CHARS = 12000;
const FILE_ID_PATTERN = /^[0-9a-fA-F-]{36}$/;

function sanitizeMentionLabel(value: string) {
  return (
    value
      .replace(/[[\]\n\r]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "file"
  );
}

function sanitizeMentionId(value: string) {
  return value.replace(/[^A-Za-z0-9:._-]/g, "");
}

function guessMimeType(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "application/yaml";
  if (lower.endsWith(".txt") || lower.endsWith(".log")) return "text/plain";
  if (/\.(ts|tsx|js|jsx|css|html|xml|csv|sql|py|rs|go|java|c|cpp|h)$/.test(lower)) return "text/plain";
  return "application/octet-stream";
}

function isTextLike(mimeType: string, name: string) {
  return (
    mimeType.startsWith("text/") ||
    ["application/json", "application/yaml", "application/xml"].includes(mimeType) ||
    /\.(md|markdown|json|yaml|yml|txt|log|csv|sql|ts|tsx|js|jsx|css|html|xml|py|rs|go|java|c|cpp|h)$/i.test(name)
  );
}

function looksBinary(bytes: Uint8Array) {
  return bytes.subarray(0, Math.min(bytes.length, 4096)).includes(0);
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function formatFileMentionToken(file: Pick<FileSnapshot, "id" | "name">) {
  return `@[${sanitizeMentionLabel(file.name)}](file:${sanitizeMentionId(file.id)})`;
}

export function extractFileMentions(content: string): FileMention[] {
  const mentions: FileMention[] = [];
  for (const match of content.matchAll(FILE_MENTION_PATTERN)) {
    mentions.push({ name: match[1], id: match[2] });
  }
  return mentions;
}

export function replaceFileMentionTokens(content: string) {
  return content.replace(FILE_MENTION_PATTERN, (_match, name) => `@${name}`);
}

export function appendMissingFileMentionTokens(content: string, snapshots: FileSnapshot[]) {
  const existingIds = new Set(extractFileMentions(content).map((mention) => mention.id));
  const missingTokens = snapshots
    .filter((snapshot) => snapshot.id && !existingIds.has(snapshot.id))
    .map(formatFileMentionToken);
  if (missingTokens.length === 0) return content;
  return [content.trim(), missingTokens.join(" ")].filter(Boolean).join("\n\n");
}

export function normalizeFileSnapshots(value: unknown): FileSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => {
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "file";
      const mimeType =
        typeof item.mimeType === "string" && item.mimeType.trim() ? item.mimeType.trim() : guessMimeType(name);
      const id = typeof item.id === "string" ? sanitizeMentionId(item.id) : "";
      const size = typeof item.size === "number" && Number.isFinite(item.size) ? item.size : 0;
      const contentPreview =
        typeof item.contentPreview === "string" ? item.contentPreview.slice(0, PREVIEW_BYTES) : null;
      return {
        id,
        name,
        mimeType,
        size,
        hash: typeof item.hash === "string" ? item.hash : "",
        binary: Boolean(item.binary),
        contentPreview,
        source: item.source === "desktop_local" ? "desktop_local" : "browser_upload",
        url: typeof item.url === "string" ? item.url : undefined,
        s3Key: typeof item.s3Key === "string" ? item.s3Key : undefined,
        originalPath: typeof item.originalPath === "string" ? item.originalPath : undefined,
        lastModified: typeof item.lastModified === "number" ? item.lastModified : undefined,
      } satisfies FileSnapshot;
    })
    .filter((snapshot) => snapshot.id.length > 0);
}

export function mergeFileSnapshots(snapshots: FileSnapshot[]) {
  return Array.from(new Map(snapshots.map((snapshot) => [snapshot.id, snapshot])).values());
}

export function getUploadedFileSnapshotIds(snapshots: FileSnapshot[]) {
  return [
    ...new Set(
      snapshots
        .filter((snapshot) => snapshot.source !== "desktop_local" && FILE_ID_PATTERN.test(snapshot.id))
        .map((snapshot) => snapshot.id),
    ),
  ];
}

export function buildFileSnapshotSystemBlock(snapshots: FileSnapshot[]) {
  const normalized = mergeFileSnapshots(normalizeFileSnapshots(snapshots));
  if (normalized.length === 0) return "";

  return [
    "## Captured File Snapshots",
    "Use these immutable file snapshots for file mentions. Treat the hash, size, pointer, and preview as the captured version at attach time rather than reading a live local path.",
    ...normalized.map((snapshot, index) => {
      const pointer = snapshot.s3Key || snapshot.url || snapshot.originalPath || "captured-in-message-metadata";
      const preview = snapshot.contentPreview
        ? `\nPreview:\n\`\`\`\n${snapshot.contentPreview.slice(0, MODEL_CONTEXT_PREVIEW_CHARS)}\n\`\`\``
        : "\nPreview: unavailable for binary or oversized file.";
      return [
        `File ${index + 1}: ${snapshot.name}`,
        `Mention: ${formatFileMentionToken(snapshot)}`,
        `Snapshot id: ${snapshot.id}`,
        `MIME: ${snapshot.mimeType}`,
        `Size: ${snapshot.size} bytes`,
        `SHA-256: ${snapshot.hash || "unavailable"}`,
        `Pointer: ${pointer}`,
        preview,
      ].join("\n");
    }),
  ].join("\n\n");
}

export async function prepareBrowserFileSnapshot(file: File): Promise<FileSnapshot> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const hash = toHex(await crypto.subtle.digest("SHA-256", buffer));
  const mimeType = file.type || guessMimeType(file.name);
  const binary = looksBinary(bytes);
  const contentPreview =
    !binary && isTextLike(mimeType, file.name)
      ? new TextDecoder("utf-8").decode(buffer.slice(0, Math.min(buffer.byteLength, PREVIEW_BYTES)))
      : null;

  return {
    id: `snapshot:${hash.slice(0, 16)}`,
    name: file.name,
    mimeType,
    size: file.size,
    hash,
    binary,
    contentPreview,
    source: "browser_upload",
    lastModified: file.lastModified,
  };
}

export function prepareDesktopFileSnapshot(snapshot: DesktopLocalSnapshotInput): FileSnapshot {
  const name = sanitizeMentionLabel(snapshot.basename);
  const hash = snapshot.hash || `${name}:${snapshot.size}`;
  return {
    id: `desktop:${sanitizeMentionId(hash.slice(0, 24))}`,
    name,
    mimeType: snapshot.mime || guessMimeType(name),
    size: snapshot.size,
    hash: snapshot.hash,
    binary: snapshot.binary,
    contentPreview: snapshot.contentPreview,
    source: "desktop_local",
  };
}

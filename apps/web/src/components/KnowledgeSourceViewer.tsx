"use client";

/* eslint-disable @next/next/no-img-element -- Knowledge base previews render user-uploaded source URLs. */

import type { RagSource } from "@/stores/chatStore";
import { sanitizeMarkdownUrl } from "@/lib/security/sanitize";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Code, ExternalLink, FileText, Image as ImageIcon, Table, X } from "lucide-react";

type ViewerKind = "pdf" | "code" | "image" | "office-preview" | "text";

const CODE_EXTENSIONS = new Set([
  "css",
  "go",
  "java",
  "js",
  "jsx",
  "json",
  "md",
  "py",
  "rs",
  "sh",
  "sql",
  "ts",
  "tsx",
  "xml",
  "yaml",
  "yml",
]);

const OFFICE_EXTENSIONS = new Set(["doc", "docx", "ppt", "pptx", "xls", "xlsx"]);

function metadataNumber(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function extensionFor(source: RagSource) {
  const sourceName = source.sourceName ?? "";
  const match = /\.([a-z0-9]+)$/i.exec(sourceName);
  return match?.[1]?.toLowerCase();
}

function isCodeSource(source: RagSource, extension: string | undefined) {
  const mimeType = source.mimeType?.toLowerCase() ?? "";
  const sourceType = source.sourceType?.toLowerCase() ?? "";
  return (
    sourceType === "code" ||
    mimeType.includes("javascript") ||
    mimeType.includes("typescript") ||
    mimeType.startsWith("text/x-") ||
    Boolean(extension && CODE_EXTENSIONS.has(extension))
  );
}

export function getKnowledgeSourceViewerKind(source: RagSource): ViewerKind {
  const mimeType = source.mimeType?.toLowerCase() ?? "";
  const sourceType = source.sourceType?.toLowerCase() ?? "";
  const extension = extensionFor(source);

  if (sourceType === "pdf" || mimeType === "application/pdf" || extension === "pdf") return "pdf";
  if (sourceType === "image" || mimeType.startsWith("image/")) return "image";
  if (isCodeSource(source, extension)) return "code";
  if (sourceType === "docx" || sourceType === "xlsx" || Boolean(extension && OFFICE_EXTENSIONS.has(extension)))
    return "office-preview";
  return "text";
}

function languageFor(source: RagSource) {
  const extension = extensionFor(source);
  if (!extension) return "text";
  if (extension === "md") return "markdown";
  if (extension === "yml") return "yaml";
  return extension;
}

function ViewerIcon({ kind }: { kind: ViewerKind }) {
  if (kind === "code") return <Code className="h-4 w-4" />;
  if (kind === "image") return <ImageIcon className="h-4 w-4" />;
  if (kind === "office-preview") return <Table className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

export function KnowledgeSourceViewer({
  source,
  index,
  onClose,
}: {
  source: RagSource;
  index: number;
  onClose?: () => void;
}) {
  const kind = getKnowledgeSourceViewerKind(source);
  const pageNumber = Math.max(1, metadataNumber(source.metadata, "page") ?? 1);
  const lineNumber = metadataNumber(source.metadata, "lineStart");
  const rowNumber = metadataNumber(source.metadata, "rowStart");
  const timestamp = metadataString(source.metadata, "timestamp");
  const label = metadataString(source.metadata, "label");
  const sourceUrl = sanitizeMarkdownUrl(source.sourceUrl);
  const pdfSrc = sourceUrl ? `${sourceUrl}#page=${pageNumber}` : undefined;
  const citation = source.citation ?? `${source.sourceName ?? source.documentId} - chunk ${index}`;
  const jumpLabel = [
    kind === "pdf" ? `page ${pageNumber}` : undefined,
    lineNumber ? `line ${lineNumber}` : undefined,
    rowNumber ? `row ${rowNumber}` : undefined,
    timestamp,
    label,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <section
      data-testid="kb-file-viewer"
      data-viewer-kind={kind}
      className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-slate-950/60 text-sm"
    >
      <header className="flex items-start justify-between gap-3 border-b border-white/10 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ViewerIcon kind={kind} />
            <span>Source [{index}]</span>
            {jumpLabel && <span className="truncate">{jumpLabel}</span>}
          </div>
          <h3 className="mt-1 truncate text-sm font-medium text-foreground">
            {source.sourceName ?? source.documentId}
          </h3>
          <p className="truncate text-xs text-muted-foreground">{citation}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              title="Open original source"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              title="Close source viewer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div className="max-h-[34rem] overflow-auto">
        {kind === "pdf" && pdfSrc ? (
          <iframe
            title={`PDF preview for ${source.sourceName ?? source.documentId}`}
            src={pdfSrc}
            className="h-[30rem] w-full border-0 bg-white"
          />
        ) : kind === "image" && sourceUrl ? (
          <div className="bg-black/30 p-3">
            <img src={sourceUrl} alt={source.sourceName ?? citation} className="max-h-[30rem] w-full object-contain" />
          </div>
        ) : kind === "code" ? (
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={languageFor(source)}
            showLineNumbers={Boolean(lineNumber)}
            startingLineNumber={lineNumber ?? 1}
            PreTag="div"
          >
            {source.content}
          </SyntaxHighlighter>
        ) : (
          <div
            className="space-y-2 p-3"
            data-preview-mode={kind === "office-preview" ? "office-preview" : "extracted-text"}
          >
            {kind === "office-preview" && (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Office extracted-text preview
              </p>
            )}
            <pre className="whitespace-pre-wrap break-words rounded-md bg-black/20 p-3 font-mono text-xs leading-5 text-foreground">
              {source.content}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}

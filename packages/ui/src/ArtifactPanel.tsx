"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Code2, Copy, Download, Eye, Maximize2, Minimize2, X } from "lucide-react";
import type { ChatArtifact } from "./types";

interface ArtifactPanelProps {
  artifact: ChatArtifact;
  iframeSandbox: string;
  onClose: () => void;
}

type TrustedTypesPolicy = {
  createHTML(value: string): unknown;
};

type TrustedTypesGlobal = {
  createPolicy(name: string, rules: { createHTML(value: string): string }): TrustedTypesPolicy;
};

let artifactPreviewPolicy: TrustedTypesPolicy | null | undefined;

function trustedArtifactPreviewHtml(html: string) {
  if (typeof window === "undefined") return html;
  const trustedTypes = (window as Window & { trustedTypes?: TrustedTypesGlobal }).trustedTypes;
  if (!trustedTypes) return html;
  if (artifactPreviewPolicy === undefined) {
    try {
      artifactPreviewPolicy = trustedTypes.createPolicy("agenthub-artifact-preview", {
        createHTML: (value) => value,
      });
    } catch {
      artifactPreviewPolicy = null;
    }
  }
  return artifactPreviewPolicy ? artifactPreviewPolicy.createHTML(html) : html;
}

export function ArtifactPanel({ artifact, iframeSandbox, onClose }: ArtifactPanelProps) {
  const [mode, setMode] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (mode !== "preview" || !iframeRef.current) return;
    iframeRef.current.srcdoc = trustedArtifactPreviewHtml(artifact.previewHtml) as string;
  }, [artifact.previewHtml, mode]);

  function handleCopy() {
    void navigator.clipboard.writeText(artifact.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleDownload() {
    const blob = new Blob([artifact.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.title}.${artifact.language}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const panelClass = expanded
    ? "fixed inset-0 z-50 flex flex-col border-l border-white/10 bg-background/95"
    : "fixed inset-0 z-50 flex flex-col border-l border-white/10 bg-background/95 md:static md:inset-auto md:z-auto md:w-[min(34rem,42vw)] md:shrink-0";

  return (
    <aside data-testid="artifact-panel" className={panelClass}>
      <header className="flex items-start justify-between gap-3 border-b border-white/10 p-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{artifact.title}</h2>
          <p className="text-xs text-muted-foreground">{artifact.language} artifact</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-md p-1 text-muted-foreground hover:bg-white/10"
            title="Copy artifact content"
            data-testid="artifact-copy-btn"
          >
            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-md p-1 text-muted-foreground hover:bg-white/10"
            title="Download artifact"
            data-testid="artifact-download-btn"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md p-1 text-muted-foreground hover:bg-white/10"
            title={expanded ? "Collapse panel" : "Expand panel"}
            data-testid="artifact-expand-btn"
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-white/10"
            title="Close artifact panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex gap-2 border-b border-white/10 p-2">
        <button
          type="button"
          onClick={() => setMode("preview")}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${mode === "preview" ? "agenthub-primary-button" : "agenthub-secondary-button"}`}
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
        <button
          type="button"
          onClick={() => setMode("code")}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${mode === "code" ? "agenthub-primary-button" : "agenthub-secondary-button"}`}
        >
          <Code2 className="h-3.5 w-3.5" />
          Code
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {mode === "preview" ? (
          <iframe
            ref={iframeRef}
            title={artifact.title}
            sandbox={iframeSandbox}
            referrerPolicy="no-referrer"
            className="h-full min-h-[28rem] w-full rounded-md border border-white/10 bg-white"
          />
        ) : (
          <pre className="min-h-full overflow-auto rounded-md bg-black/30 p-3 text-xs text-slate-100">
            <code>{artifact.content}</code>
          </pre>
        )}
      </div>
    </aside>
  );
}

"use client";

import { Download, FileText, BarChart3 } from "lucide-react";
import type { GeneratedResource } from "@/stores/chatStore";
import { ARTIFACT_IFRAME_SANDBOX, isSafeRenderableMimeType, sanitizeArtifactHtml } from "@/lib/security/sanitize";

interface SandboxOutputProps {
  resources: GeneratedResource[];
}

function formatBytes(value?: number) {
  if (!value || value < 1) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadResource(resource: GeneratedResource) {
  if (resource.content !== undefined) {
    const blob = new Blob([resource.content], { type: resource.mimeType || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = resource.filename || `${resource.type}-${resource.id}`;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  if (resource.url) {
    window.open(resource.url, "_blank", "noopener,noreferrer");
  }
}

export function SandboxOutput({ resources }: SandboxOutputProps) {
  const sandboxResources = resources.filter(
    (resource) => resource.type === "file" || resource.type === "chart" || resource.type === "document",
  );
  if (sandboxResources.length === 0) return null;

  return (
    <section data-testid="sandbox-outputs" className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        <span>Sandbox Outputs</span>
      </div>
      <div className="space-y-2">
        {sandboxResources.map((resource) => {
          const isChart = resource.type === "chart";
          const canPreviewArtifact = resource.content !== undefined && isSafeRenderableMimeType(resource.mimeType);
          return (
            <article key={resource.id} className="rounded-md border border-white/10 bg-background/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {isChart ? (
                      <BarChart3 className="h-4 w-4 text-primary" />
                    ) : (
                      <FileText className="h-4 w-4 text-primary" />
                    )}
                    <span className="truncate">{resource.filename || (isChart ? "Chart" : "Sandbox output")}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{isChart ? "chart" : resource.type}</span>
                    {resource.mimeType && <span>{resource.mimeType}</span>}
                    {formatBytes(resource.sizeBytes) && <span>{formatBytes(resource.sizeBytes)}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => downloadResource(resource)}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-foreground transition-colors hover:bg-white/10"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              </div>
              {isChart && resource.chartSpec !== undefined && (
                <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-black/20 p-2 text-xs text-muted-foreground">
                  {typeof resource.chartSpec === "string"
                    ? resource.chartSpec
                    : JSON.stringify(resource.chartSpec, null, 2)}
                </pre>
              )}
              {canPreviewArtifact && (
                <iframe
                  title={resource.filename || "Artifact preview"}
                  srcDoc={sanitizeArtifactHtml(resource.content ?? "")}
                  sandbox={ARTIFACT_IFRAME_SANDBOX}
                  referrerPolicy="no-referrer"
                  className="mt-2 h-48 w-full rounded-md border border-white/10 bg-white"
                />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

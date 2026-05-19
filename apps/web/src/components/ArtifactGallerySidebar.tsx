"use client";

import { Code2, FileCode2, Image as ImageIcon, X } from "lucide-react";
import type { ChatArtifact } from "@/stores/chatStore";

interface ArtifactGallerySidebarProps {
  artifacts: ChatArtifact[];
  activeId: string | null;
  onSelect: (artifact: ChatArtifact) => void;
  onClose: () => void;
}

const KIND_ICON: Record<string, React.ReactNode> = {
  html: <FileCode2 className="h-3.5 w-3.5 shrink-0" />,
  svg: <ImageIcon className="h-3.5 w-3.5 shrink-0" />,
  css: <Code2 className="h-3.5 w-3.5 shrink-0" />,
  react: <Code2 className="h-3.5 w-3.5 shrink-0" />,
};

export function ArtifactGallerySidebar({ artifacts, activeId, onSelect, onClose }: ArtifactGallerySidebarProps) {
  return (
    <aside
      data-testid="artifact-gallery-sidebar"
      className="fixed inset-y-0 right-0 z-50 flex w-[min(20rem,100vw)] shrink-0 flex-col border-l border-white/10 bg-background/95 shadow-2xl md:static md:inset-auto md:z-auto md:w-56 md:shadow-none"
    >
      <header className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Artifacts ({artifacts.length})
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-white/10"
          title="Close artifact gallery"
          data-testid="artifact-gallery-close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <ul className="flex-1 overflow-y-auto py-1">
        {artifacts.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">No artifacts yet</li>
        ) : (
          artifacts.map((artifact) => (
            <li key={artifact.id}>
              <button
                type="button"
                onClick={() => onSelect(artifact)}
                data-testid={`artifact-gallery-item-${artifact.id}`}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/10 ${
                  activeId === artifact.id ? "bg-white/10 font-medium" : ""
                }`}
              >
                {KIND_ICON[artifact.kind] ?? <Code2 className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{artifact.title}</span>
                <span className="ml-auto shrink-0 rounded bg-white/10 px-1 text-[10px] uppercase text-muted-foreground">
                  {artifact.language}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}

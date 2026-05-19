"use client";

import { useMemo } from "react";
import { ArtifactPanel as SharedArtifactPanel } from "@agenthub/ui";
import type { ChatArtifact } from "@/stores/chatStore";
import { ARTIFACT_IFRAME_SANDBOX, sanitizeArtifactHtml } from "@/lib/security/sanitize";

interface ArtifactPanelProps {
  artifact: ChatArtifact;
  onClose: () => void;
}

export function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
  const sanitizedArtifact = useMemo(
    () => ({
      ...artifact,
      previewHtml: sanitizeArtifactHtml(artifact.previewHtml),
    }),
    [artifact],
  );

  return <SharedArtifactPanel artifact={sanitizedArtifact} iframeSandbox={ARTIFACT_IFRAME_SANDBOX} onClose={onClose} />;
}

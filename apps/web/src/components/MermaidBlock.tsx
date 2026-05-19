"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { sanitizeArtifactHtml } from "@/lib/security/sanitize";

let initialized = false;

type TrustedTypesLike = {
  createPolicy: (
    name: string,
    rules: {
      createHTML: (value: string) => string;
    },
  ) => {
    createHTML: (value: string) => unknown;
  };
};

let mermaidPolicy: ReturnType<TrustedTypesLike["createPolicy"]> | null = null;

function createTrustedMermaidHtml(svg: string) {
  const trustedTypes = (globalThis as typeof globalThis & { trustedTypes?: TrustedTypesLike }).trustedTypes;
  if (!trustedTypes) return sanitizeArtifactHtml(svg);

  mermaidPolicy ??= trustedTypes.createPolicy("agenthub-mermaid", {
    createHTML(value) {
      return sanitizeArtifactHtml(value);
    },
  });
  return mermaidPolicy.createHTML(svg);
}

function renderMermaidSvg(container: HTMLDivElement, svg: string) {
  const trustedSvg = createTrustedMermaidHtml(svg) as string;
  const parsed = new DOMParser().parseFromString(trustedSvg, "image/svg+xml");
  const parserError = parsed.querySelector("parsererror");
  if (parserError) throw new Error(parserError.textContent || "Invalid Mermaid SVG");
  const svgElement = parsed.documentElement;
  if (svgElement.nodeName.toLowerCase() !== "svg") throw new Error("Mermaid did not return an SVG document");
  container.replaceChildren(document.importNode(svgElement, true));
}

export function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialized) {
      mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "sandbox" });
      initialized = true;
    }

    if (!ref.current) return;

    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    setError(null);

    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (ref.current) renderMermaidSvg(ref.current, svg);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [code]);

  if (error) {
    return (
      <div className="my-4 rounded border border-destructive/30 p-3 text-sm text-destructive font-mono">
        Mermaid error: {error}
      </div>
    );
  }

  return <div ref={ref} className="my-4 flex justify-center overflow-x-auto" />;
}

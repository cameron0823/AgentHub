"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let initialized = false;

export function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialized) {
      mermaid.initialize({ startOnLoad: false, theme: "neutral" });
      initialized = true;
    }

    if (!ref.current) return;

    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    setError(null);

    mermaid.render(id, code).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg;
    }).catch((err: unknown) => {
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

"use client";

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownCodeBlockProps {
  code: string;
  language: string;
}

export function MarkdownCodeBlock({ code, language }: MarkdownCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="relative group/code">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded-lg bg-slate-950/80 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 group-hover/code:opacity-100"
        title="Copy code"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <SyntaxHighlighter style={vscDarkPlus} language={language} PreTag="div">
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

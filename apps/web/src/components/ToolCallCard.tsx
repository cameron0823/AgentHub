"use client";

/* eslint-disable @next/next/no-img-element -- Tool output images can be arbitrary base64 data from runtime execution. */

import { Wrench, ExternalLink } from "lucide-react";
import { ToolCall, ToolResult } from "@/stores/chatStore";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface ToolCallCardProps {
  toolCall?: ToolCall;
  toolResult?: ToolResult;
}

function formatArguments(args: string) {
  try {
    return JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    return args;
  }
}

function formatResult(result: unknown) {
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}

interface CodeResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function isSearchResults(result: unknown): result is SearchResult[] {
  return Array.isArray(result) && result.length > 0 && typeof (result[0] as any)?.url === "string";
}

function isCodeResult(result: unknown): result is CodeResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "exitCode" in result &&
    typeof (result as CodeResult).exitCode === "number"
  );
}

function CodeResultCard({ result, code }: { result: CodeResult; code?: string }) {
  const isBase64Png = (s: string) => s.startsWith("iVBORw0KGgo");
  const pngLines = result.stdout.split("\n").filter(isBase64Png);

  return (
    <div className="space-y-2">
      {code && (
        <pre className="overflow-x-auto rounded bg-background p-2 text-xs font-mono">{code}</pre>
      )}
      {result.stdout && !pngLines.length && (
        <div>
          <div className="mb-0.5 text-xs text-muted-foreground">stdout</div>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-background p-2 text-xs">{result.stdout}</pre>
        </div>
      )}
      {pngLines.map((png, i) => (
        <img
          key={i}
          src={`data:image/png;base64,${png}`}
          alt="code output"
          className="max-w-full rounded border"
        />
      ))}
      {result.stderr && (
        <div>
          <div className="mb-0.5 text-xs text-muted-foreground">stderr</div>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-red-50 dark:bg-red-950/30 p-2 text-xs text-red-700 dark:text-red-400">
            {result.stderr}
          </pre>
        </div>
      )}
      <div className="text-xs text-muted-foreground">exit code: {result.exitCode}</div>
    </div>
  );
}

function SearchResultsCard({ results }: { results: SearchResult[] }) {
  return (
    <div className="space-y-2">
      {results.map((r, i) => (
        <div key={i} className="rounded border bg-background p-2">
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-1 text-xs font-medium text-primary hover:underline"
          >
            <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-1">{r.title}</span>
          </a>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{r.snippet}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground truncate">{r.url}</p>
        </div>
      ))}
    </div>
  );
}

export function ToolCallCard({ toolCall, toolResult }: ToolCallCardProps) {
  const name = toolCall?.function.name || toolResult?.toolName || "tool";

  return (
    <details className="my-2 rounded-lg border bg-muted/30 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-medium text-muted-foreground hover:text-foreground">
        <Wrench className="h-4 w-4" />
        <span>{toolCall ? "Tool call" : "Tool result"}: {name}</span>
      </summary>
      <div className="border-t px-3 py-2">
        {toolCall && (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-background p-2 text-xs">
            {formatArguments(toolCall.function.arguments)}
          </pre>
        )}
        {toolResult && (() => {
          if (isSearchResults(toolResult.result)) {
            return <SearchResultsCard results={toolResult.result} />;
          }
          if (isCodeResult(toolResult.result)) {
            let code: string | undefined;
            try {
              const args = toolCall?.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
              code = typeof args?.code === "string" ? args.code : undefined;
            } catch { /* ignore */ }
            return <CodeResultCard result={toolResult.result} code={code} />;
          }
          return (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-background p-2 text-xs">
              {formatResult(toolResult.result)}
            </pre>
          );
        })()}
      </div>
    </details>
  );
}

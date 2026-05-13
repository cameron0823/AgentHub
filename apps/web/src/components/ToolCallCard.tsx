"use client";

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

function isSearchResults(result: unknown): result is SearchResult[] {
  return Array.isArray(result) && result.length > 0 && typeof (result[0] as any)?.url === "string";
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
        {toolResult && (
          isSearchResults(toolResult.result) ? (
            <SearchResultsCard results={toolResult.result} />
          ) : (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-background p-2 text-xs">
              {formatResult(toolResult.result)}
            </pre>
          )
        )}
      </div>
    </details>
  );
}

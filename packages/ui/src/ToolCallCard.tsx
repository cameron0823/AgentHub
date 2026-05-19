"use client";

/* eslint-disable @next/next/no-img-element -- Tool output images can be arbitrary data from runtime execution. */

import { ExternalLink, Wrench } from "lucide-react";
import type { ToolCall, ToolResult } from "./types";

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

interface GeneratedImageResult {
  type: "generated_image";
  prompt: string;
  providerId: string;
  model: string;
  images: Array<{
    id: string;
    url: string;
    prompt?: string;
    revisedPrompt?: string;
    providerId?: string;
    model?: string;
  }>;
}

function isSearchResults(result: unknown): result is SearchResult[] {
  return Array.isArray(result) && result.length > 0 && typeof (result[0] as SearchResult | undefined)?.url === "string";
}

function isGeneratedImageResult(result: unknown): result is GeneratedImageResult {
  return (
    Boolean(result) &&
    typeof result === "object" &&
    (result as { type?: unknown }).type === "generated_image" &&
    Array.isArray((result as { images?: unknown }).images)
  );
}

function isCodeResult(result: unknown): result is CodeResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "exitCode" in result &&
    typeof (result as CodeResult).exitCode === "number"
  );
}

function GeneratedImageResultCard({ result }: { result: GeneratedImageResult }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        {result.providerId} / {result.model}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {result.images.map((image) => (
          <a
            key={image.id}
            href={image.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-lg border border-white/10 bg-white/5"
          >
            <img
              src={image.url}
              alt={image.revisedPrompt || image.prompt || result.prompt}
              className="aspect-square w-full object-cover"
            />
            <div className="line-clamp-2 px-2 py-1.5 text-xs text-muted-foreground">
              {image.revisedPrompt || image.prompt || result.prompt}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function CodeResultCard({ result, code }: { result: CodeResult; code?: string }) {
  const isBase64Png = (value: string) => value.startsWith("iVBORw0KGgo");
  const pngLines = result.stdout.split("\n").filter(isBase64Png);

  return (
    <div className="space-y-2">
      {code && <pre className="overflow-x-auto rounded-xl bg-black/30 p-2 font-mono text-xs">{code}</pre>}
      {result.stdout && !pngLines.length && (
        <div>
          <div className="mb-0.5 text-xs text-muted-foreground">stdout</div>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-black/30 p-2 text-xs">{result.stdout}</pre>
        </div>
      )}
      {pngLines.map((png, index) => (
        <img key={index} src={`data:image/png;base64,${png}`} alt="code output" className="max-w-full rounded border" />
      ))}
      {result.stderr && (
        <div>
          <div className="mb-0.5 text-xs text-muted-foreground">stderr</div>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
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
      {results.map((result, index) => (
        <div key={index} className="rounded-xl border border-white/10 bg-white/5 p-2">
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-1 text-xs font-medium text-primary hover:underline"
          >
            <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-1">{result.title}</span>
          </a>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{result.snippet}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{result.url}</p>
        </div>
      ))}
    </div>
  );
}

export function ToolCallCard({ toolCall, toolResult }: ToolCallCardProps) {
  const name = toolCall?.function.name || toolResult?.toolName || "tool";

  return (
    <details className="my-2 rounded-xl border border-white/10 bg-white/5 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-medium text-muted-foreground hover:text-foreground">
        <Wrench className="h-4 w-4" />
        <span>
          {toolCall ? "Tool call" : "Tool result"}: {name}
        </span>
      </summary>
      <div className="border-t border-white/10 px-3 py-2">
        {toolCall && (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-black/30 p-2 text-xs">
            {formatArguments(toolCall.function.arguments)}
          </pre>
        )}
        {toolResult &&
          (() => {
            if (isSearchResults(toolResult.result)) {
              return <SearchResultsCard results={toolResult.result} />;
            }
            if (isCodeResult(toolResult.result)) {
              let code: string | undefined;
              try {
                const args = toolCall?.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
                code = typeof args?.code === "string" ? args.code : undefined;
              } catch {
                // Invalid tool-call JSON still renders the tool result.
              }
              return <CodeResultCard result={toolResult.result} code={code} />;
            }
            if (isGeneratedImageResult(toolResult.result)) {
              return <GeneratedImageResultCard result={toolResult.result} />;
            }
            return (
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-black/30 p-2 text-xs">
                {formatResult(toolResult.result)}
              </pre>
            );
          })()}
      </div>
    </details>
  );
}

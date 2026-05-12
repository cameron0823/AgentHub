"use client";

import { Wrench } from "lucide-react";
import { ToolCall, ToolResult } from "@/stores/chatStore";

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
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-background p-2 text-xs">
            {formatResult(toolResult.result)}
          </pre>
        )}
      </div>
    </details>
  );
}

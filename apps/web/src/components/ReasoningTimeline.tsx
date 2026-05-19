"use client";

import { BrainCircuit, ChevronRight, Wrench } from "lucide-react";
import type { ReasoningTimelineEvent } from "@/stores/chatStore";

interface ReasoningTimelineProps {
  events: ReasoningTimelineEvent[];
}

function visibilityLabel(visibility: ReasoningTimelineEvent["visibility"]) {
  if (visibility === "provider-visible") return "Provider-visible";
  if (visibility === "redacted") return "Redacted";
  return "Metadata-only";
}

function formatDuration(durationMs?: number) {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) return null;
  if (durationMs < 1000) return `${Math.max(0, Math.round(durationMs))}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function eventIcon(kind: ReasoningTimelineEvent["kind"]) {
  if (kind === "tool_decision" || kind === "tool_execution") return <Wrench className="h-3.5 w-3.5" />;
  return <BrainCircuit className="h-3.5 w-3.5" />;
}

export function ReasoningTimeline({ events }: ReasoningTimelineProps) {
  if (events.length === 0) return null;

  const totalDurationMs = events.reduce((total, event) => total + (event.durationMs ?? 0), 0);

  return (
    <details
      data-testid="reasoning-timeline"
      className="group/reasoning mb-3 rounded-lg border border-white/10 bg-white/5 text-sm"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open/reasoning:rotate-90" />
        <span className="font-medium text-foreground">Reasoning timeline</span>
        <span className="text-xs">
          {events.length} step{events.length === 1 ? "" : "s"}
        </span>
        {totalDurationMs > 0 ? <span className="ml-auto text-xs">{formatDuration(totalDurationMs)}</span> : null}
      </summary>
      <ol className="space-y-2 border-t border-white/10 px-3 py-3">
        {events.map((event) => {
          const duration = formatDuration(event.durationMs);
          return (
            <li key={event.id} className="rounded-md bg-black/15 p-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">{eventIcon(event.kind)}</span>
                <span className="font-medium text-foreground">{event.title}</span>
                <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {visibilityLabel(event.visibility)}
                </span>
                {duration ? <span className="ml-auto text-[10px] text-muted-foreground">{duration}</span> : null}
              </div>
              {event.visibility === "provider-visible" && event.content ? (
                <pre className="mt-2 whitespace-pre-wrap rounded bg-black/20 p-2 text-xs text-muted-foreground">
                  {event.content}
                </pre>
              ) : event.visibility === "redacted" ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Reasoning content is unavailable under the provider policy.
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

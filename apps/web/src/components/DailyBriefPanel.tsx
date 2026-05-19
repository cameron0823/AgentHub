"use client";

import { Activity, AlertTriangle, Brain, CalendarClock, ListChecks, RefreshCw, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";

type BriefSection = {
  key: string;
  title: string;
  items: string[];
};

type SourceCounts = {
  tasks?: number;
  automations?: number;
  memoryChanges?: number;
  alerts?: number;
  scheduledSummaries?: number;
  agentSignalFindings?: number;
};

function isBriefSection(value: unknown): value is BriefSection {
  if (!value || typeof value !== "object") return false;
  const section = value as Partial<BriefSection>;
  return (
    typeof section.key === "string" &&
    typeof section.title === "string" &&
    Array.isArray(section.items) &&
    section.items.every((item) => typeof item === "string")
  );
}

function parseSections(value: unknown): BriefSection[] {
  return Array.isArray(value) ? value.filter(isBriefSection) : [];
}

function parseHighlights(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseCounts(value: unknown): SourceCounts {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as SourceCounts) : {};
}

function countItems(counts: SourceCounts) {
  return [
    { key: "tasks", label: "Tasks", value: counts.tasks ?? 0, icon: ListChecks },
    { key: "automations", label: "Automations", value: counts.automations ?? 0, icon: Zap },
    { key: "memory", label: "Memory", value: counts.memoryChanges ?? 0, icon: Brain },
    { key: "signal", label: "Signal", value: counts.agentSignalFindings ?? 0, icon: Activity },
    { key: "alerts", label: "Alerts", value: counts.alerts ?? 0, icon: AlertTriangle },
  ];
}

function formatGeneratedAt(value: Date | string | null | undefined) {
  if (!value) return "Not generated yet";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not generated yet";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function DailyBriefPanel() {
  const utils = trpc.useUtils();
  const latest = trpc.dailyBriefs.latest.useQuery();
  const generate = trpc.dailyBriefs.generate.useMutation({
    onSuccess: () => {
      utils.dailyBriefs.latest.invalidate();
      utils.dailyBriefs.list.invalidate();
    },
  });

  const brief = latest.data;
  const counts = parseCounts(brief?.sourceCounts);
  const sections = parseSections(brief?.sections);
  const highlights = parseHighlights(brief?.highlights);

  return (
    <section
      data-testid="daily-brief-panel"
      className="flex-none border-b border-white/10 bg-slate-950/25 px-4 py-3 text-slate-100 backdrop-blur-xl md:px-5"
    >
      <div className="mx-auto grid max-w-6xl gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <CalendarClock className="h-4 w-4 flex-shrink-0 text-cyan-200" />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-white">Daily Brief</h2>
                <p className="truncate text-xs text-slate-300">
                  {latest.isLoading ? "Loading latest brief..." : formatGeneratedAt(brief?.generatedAt)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => generate.mutate({ windowHours: 24 })}
              disabled={generate.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${generate.isPending ? "animate-spin" : ""}`} />
              Refresh brief
            </button>
          </div>

          <p className="line-clamp-2 text-sm leading-6 text-slate-100">
            {brief?.summary ?? "No daily brief has been generated yet."}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {countItems(counts).map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-white">{item.value}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-300">Highlights</div>
            <ul className="space-y-1.5 text-xs leading-5 text-slate-100">
              {(highlights.length ? highlights : ["No high-priority changes detected."])
                .slice(0, 3)
                .map((item, index) => (
                  <li key={`${item}-${index}`} className="line-clamp-1">
                    {item}
                  </li>
                ))}
            </ul>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-300">Sources</div>
            <div className="grid gap-1.5 text-xs text-slate-100">
              {sections.slice(0, 3).map((section) => (
                <div key={section.key} className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate">{section.title}</span>
                  <span className="flex-shrink-0 text-slate-300">{section.items.length}</span>
                </div>
              ))}
              {!sections.length && <span className="text-slate-300">No source sections yet.</span>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

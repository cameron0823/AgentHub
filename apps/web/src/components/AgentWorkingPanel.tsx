"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Bot, FileText, History, ListChecks, Quote, ScrollText, TerminalSquare, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { ChatArtifact, ChatSession, GeneratedResource, RagSource } from "@/stores/chatStore";

type WorkingPanelTab = "documents" | "tasks" | "logs" | "citations" | "history";

interface AgentWorkingPanelProps {
  session: ChatSession;
  onClose: () => void;
}

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

const TABS: Array<{ id: WorkingPanelTab; label: string; icon: typeof FileText }> = [
  { id: "documents", label: "Active documents", icon: FileText },
  { id: "tasks", label: "Task progress", icon: ListChecks },
  { id: "logs", label: "Run logs", icon: TerminalSquare },
  { id: "citations", label: "Citations", icon: Quote },
  { id: "history", label: "Document history", icon: History },
];

function uniqueResources(resources: GeneratedResource[]) {
  return Array.from(new Map(resources.map((resource) => [resource.id, resource])).values());
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "No timestamp";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "No timestamp";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusTone(status: string) {
  if (status === "success") return "text-emerald-300";
  if (status === "running" || status === "queued") return "text-cyan-300";
  if (status === "error" || status === "cancelled") return "text-rose-300";
  return "text-slate-300";
}

function sourceTitle(source: RagSource, index: number) {
  return source.sourceName || source.citation || `Citation ${index + 1}`;
}

function artifactLabel(artifact: ChatArtifact) {
  return `${artifact.title} (${artifact.language})`;
}

function resourceLabel(resource: GeneratedResource) {
  return resource.filename || resource.prompt || resource.revisedPrompt || `${resource.type} resource`;
}

function toolCallName(call: unknown) {
  if (!call || typeof call !== "object") return "tool";
  const record = call as {
    function?: { name?: unknown };
    name?: unknown;
    toolName?: unknown;
    agentName?: unknown;
  };
  return (
    [record.function?.name, record.toolName, record.name, record.agentName].find(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    ) ?? "tool"
  );
}

export function AgentWorkingPanel({ session, onClose }: AgentWorkingPanelProps) {
  const [activeTab, setActiveTab] = useState<WorkingPanelTab>("documents");
  const tasksQuery = trpc.tasks.list.useQuery({ limit: 8 });
  const pagesQuery = trpc.pages.list.useQuery();
  const automationsQuery = trpc.automations.list.useQuery();
  const activePageId = pagesQuery.data?.[0]?.id ?? null;
  const versionsQuery = trpc.pages.versions.useQuery(
    { pageId: activePageId ?? EMPTY_UUID },
    { enabled: Boolean(activePageId) },
  );

  const generatedResources = useMemo(() => {
    return uniqueResources(
      session.messages.flatMap((message) => [
        ...(message.generatedResources ?? []),
        ...(message.sandboxResources ?? []),
      ]),
    );
  }, [session.messages]);

  const artifacts = useMemo(() => {
    return session.messages.flatMap((message) => message.artifacts ?? []);
  }, [session.messages]);

  const citations = useMemo(() => {
    return session.messages.flatMap((message) => message.ragSources ?? []);
  }, [session.messages]);

  const runLogs = useMemo(() => {
    const messageLogs = session.messages.flatMap((message) => {
      const logs: string[] = [];
      if (message.reasoningTimeline?.length) {
        logs.push(
          `${message.reasoningTimeline.length} reasoning event${message.reasoningTimeline.length === 1 ? "" : "s"}`,
        );
      }
      if (message.toolCalls?.length) {
        logs.push(`Tool calls: ${message.toolCalls.map(toolCallName).join(", ")}`);
      }
      if (message.toolResult) {
        logs.push(`Tool result: ${message.toolResult.toolName}`);
      }
      if (message.routeDecision) {
        logs.push(`Route decision: ${message.routeDecision.strategy}`);
      }
      return logs;
    });
    const automationLogs = (automationsQuery.data ?? []).slice(0, 6).map((automation) => {
      const status = automation.lastRunStatus ?? (automation.isActive ? "scheduled" : "paused");
      return `Automation ${status}: ${automation.name}`;
    });
    return [...messageLogs, ...automationLogs].slice(0, 12);
  }, [automationsQuery.data, session.messages]);

  const pages = pagesQuery.data ?? [];
  const tasks = tasksQuery.data?.items ?? [];
  const versions = versionsQuery.data ?? [];

  return (
    <aside
      data-testid="agent-working-panel"
      className="fixed inset-0 z-50 flex flex-col border-l border-white/10 bg-background/95 text-foreground md:static md:inset-auto md:z-auto md:w-[min(28rem,34vw)] md:shrink-0"
    >
      <header className="flex items-start justify-between gap-3 border-b border-white/10 p-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">Agent Working Panel</h2>
          <p className="truncate text-xs text-muted-foreground">{session.title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-white/10"
          title="Close working panel"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-white/10 p-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex flex-shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs ${
                activeTab === tab.id ? "agenthub-primary-button" : "agenthub-secondary-button"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {activeTab === "documents" && (
          <div className="space-y-3">
            <PanelSection title="Active documents" icon={<FileText className="h-4 w-4" />}>
              {pages.slice(0, 5).map((page) => (
                <PanelItem key={page.id} title={page.title} meta={`Page updated ${formatDate(page.updatedAt)}`} />
              ))}
              {generatedResources
                .filter(
                  (resource) => resource.type === "file" || resource.type === "document" || resource.type === "chart",
                )
                .slice(0, 5)
                .map((resource) => (
                  <PanelItem
                    key={resource.id}
                    title={resourceLabel(resource)}
                    meta={`${resource.type}${resource.mimeType ? ` / ${resource.mimeType}` : ""}`}
                  />
                ))}
              {artifacts.slice(0, 4).map((artifact) => (
                <PanelItem key={artifact.id} title={artifactLabel(artifact)} meta="Chat artifact" />
              ))}
              {!pages.length && !generatedResources.length && !artifacts.length && (
                <EmptyState>No active documents yet.</EmptyState>
              )}
            </PanelSection>
          </div>
        )}

        {activeTab === "tasks" && (
          <PanelSection title="Task progress" icon={<ListChecks className="h-4 w-4" />}>
            {tasks.map((task) => (
              <PanelItem
                key={task.id}
                title={task.title}
                meta={`${task.status} / priority ${task.priority ?? 0}`}
                tone={statusTone(task.status)}
              />
            ))}
            {!tasks.length && <EmptyState>No active task progress yet.</EmptyState>}
          </PanelSection>
        )}

        {activeTab === "logs" && (
          <PanelSection title="Run logs" icon={<TerminalSquare className="h-4 w-4" />}>
            {runLogs.map((log, index) => (
              <PanelItem key={`${log}-${index}`} title={log} meta="Current conversation context" />
            ))}
            {!runLogs.length && <EmptyState>No run logs captured for this session yet.</EmptyState>}
          </PanelSection>
        )}

        {activeTab === "citations" && (
          <PanelSection title="Citations" icon={<Quote className="h-4 w-4" />}>
            {citations.map((source, index) => (
              <PanelItem
                key={`${source.id}-${index}`}
                title={sourceTitle(source, index)}
                meta={`${(source.similarity * 100).toFixed(1)}% match${source.mimeType ? ` / ${source.mimeType}` : ""}`}
              >
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{source.content}</p>
              </PanelItem>
            ))}
            {!citations.length && <EmptyState>No citations in this session yet.</EmptyState>}
          </PanelSection>
        )}

        {activeTab === "history" && (
          <PanelSection title="Document history" icon={<History className="h-4 w-4" />}>
            {versions.slice(0, 8).map((version) => (
              <PanelItem
                key={version.id}
                title={`Version ${version.versionNumber}: ${version.title}`}
                meta={`${version.sourceType} / ${formatDate(version.createdAt)}`}
              />
            ))}
            {!versions.length && (
              <EmptyState>
                {activePageId
                  ? "No version history for the active page yet."
                  : "No page selected for document history."}
              </EmptyState>
            )}
          </PanelSection>
        )}
      </div>
    </aside>
  );
}

function PanelSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function PanelItem({
  title,
  meta,
  tone,
  children,
}: {
  title: string;
  meta?: string;
  tone?: string;
  children?: React.ReactNode;
}) {
  return (
    <article className="rounded-md border border-white/10 bg-black/10 p-2">
      <div className="flex min-w-0 items-start gap-2">
        <Bot className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-cyan-200" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xs font-medium">{title}</h3>
          {meta && <p className={`mt-0.5 truncate text-[11px] ${tone ?? "text-muted-foreground"}`}>{meta}</p>}
          {children}
        </div>
      </div>
    </article>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-white/10 p-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-3.5 w-3.5" />
        {children}
      </div>
    </div>
  );
}

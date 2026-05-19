"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import type { AgentTask } from "@/stores/chatStore";

type StatusAlias = "all" | "todo" | "in_progress" | "done" | "error" | "cancelled";
type SubtaskDraft = { title: string; prompt: string; agentId?: string | null; priority?: number; maxRetries?: number };
type AgentOption = { id: string; name: string };
type QueueProgressEvent = {
  queue: string;
  jobId: string;
  progress: number | { status?: string; retryCount?: number; nextDelayMs?: number };
  message?: string;
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  queued: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  running: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-white/10 text-muted-foreground",
};

function toStatusAlias(status: string) {
  if (status === "pending" || status === "queued") return "todo";
  if (status === "running") return "in progress";
  if (status === "success") return "done";
  return status;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status] ?? ""}`}>
      {toStatusAlias(status)}
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />;
  if (status === "success") return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === "error") return <AlertCircle className="h-4 w-4 text-red-500" />;
  if (status === "cancelled") return <XCircle className="h-4 w-4 text-muted-foreground" />;
  if (status === "queued") return <Play className="h-4 w-4 text-blue-500" />;
  return <Clock className="h-4 w-4 text-yellow-500" />;
}

function safeParseDeps(dependsOn: unknown) {
  if (Array.isArray(dependsOn)) return dependsOn.filter((item): item is string => typeof item === "string");
  if (typeof dependsOn !== "string" || !dependsOn) return [] as string[];
  try {
    const parsed = JSON.parse(dependsOn);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseSubtasks(text: string): SubtaskDraft[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, prompt] = line.split("::").map((part) => part.trim());
      return { title, prompt: prompt || `Complete subtask: ${title}` };
    });
}

function stringifyTemplateSubtasks(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const draft = item as Partial<SubtaskDraft>;
      if (!draft.title) return "";
      return draft.prompt ? `${draft.title} :: ${draft.prompt}` : draft.title;
    })
    .filter(Boolean)
    .join("\n");
}

function formatQueueProgress(progress: QueueProgressEvent["progress"]) {
  if (typeof progress === "number") return `${progress}%`;
  return (
    [progress.status, typeof progress.retryCount === "number" ? `retry ${progress.retryCount}` : null]
      .filter(Boolean)
      .join(" · ") || "update"
  );
}

type ManagerAction = "queue_ready" | "retry_failed" | "rebalance_unassigned" | "annotate_blocked";

const managerActions: Array<{ action: ManagerAction; label: string }> = [
  { action: "queue_ready", label: "Queue ready" },
  { action: "retry_failed", label: "Retry failed" },
  { action: "rebalance_unassigned", label: "Assign unassigned" },
  { action: "annotate_blocked", label: "Annotate blocked" },
];

function AutoManagerPanel({ onRefresh }: { onRefresh: () => void }) {
  const utils = trpc.useUtils();
  const manager = trpc.tasks.managerState.useQuery(undefined, { refetchInterval: 30_000 });
  const runManager = trpc.tasks.runManager.useMutation({
    onSuccess: () => {
      void utils.tasks.managerState.invalidate();
      onRefresh();
    },
  });
  const summary = manager.data?.summary;
  const recommendations = new Map((manager.data?.recommendations ?? []).map((item) => [item.action, item.count]));

  return (
    <section data-testid="auto-manager-panel" className="agenthub-glass-panel rounded-2xl p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Auto Manager</h3>
        </div>
        <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-white/10 px-2 py-0.5">Ready {summary?.ready ?? 0}</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5">Retry {summary?.retryable ?? 0}</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5">Blocked {summary?.blocked ?? 0}</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5">Unassigned {summary?.unassigned ?? 0}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {managerActions.map((item) => {
          const count = recommendations.get(item.action) ?? 0;
          return (
            <button
              key={item.action}
              type="button"
              onClick={() => runManager.mutate({ actions: [item.action], maxTasks: 25 })}
              disabled={count === 0 || runManager.isPending}
              className="agenthub-secondary-button px-2 py-1 text-xs disabled:opacity-40"
            >
              {item.label}
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{count}</span>
            </button>
          );
        })}
      </div>
      {runManager.data?.applied.length ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Applied {runManager.data.applied.map((item) => `${item.action}: ${item.count}`).join(", ")}
        </p>
      ) : null}
      {manager.isError && <p className="mt-2 text-xs text-destructive">Auto-manager state unavailable.</p>}
    </section>
  );
}

function TaskRow({ task, agents, onRefresh }: { task: AgentTask; agents: AgentOption[]; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState("");
  const [reassignAgentId, setReassignAgentId] = useState(task.agentId ?? "");

  const cancelMut = trpc.tasks.cancel.useMutation({ onSuccess: onRefresh });
  const retryMut = trpc.tasks.retry.useMutation({ onSuccess: onRefresh });
  const deleteMut = trpc.tasks.delete.useMutation({ onSuccess: onRefresh });
  const addCommentMut = trpc.tasks.addComment.useMutation({
    onSuccess: () => {
      setComment("");
      onRefresh();
    },
  });
  const reassignMut = trpc.tasks.reassign.useMutation({ onSuccess: onRefresh });
  const commentsQuery = trpc.tasks.comments.useQuery({ taskId: task.id }, { enabled: expanded });

  const deps = safeParseDeps(task.dependsOn);

  return (
    <div className="agenthub-glass-panel overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 p-3">
        <StatusIcon status={task.status} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-sm truncate">{task.title}</span>
            <StatusBadge status={task.status} />
            {task.parentTaskId && <span className="text-xs text-muted-foreground">Subtask</span>}
            {task.priority !== 0 && (
              <span className="text-xs text-muted-foreground">
                P{task.priority > 0 ? "+" : ""}
                {task.priority}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{task.prompt}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {["error", "cancelled"].includes(task.status) && (
            <button
              onClick={() => retryMut.mutate({ id: task.id })}
              disabled={retryMut.isPending}
              className="agenthub-icon-button"
              title="Retry"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          {["pending", "queued"].includes(task.status) && (
            <button
              onClick={() => cancelMut.mutate({ id: task.id })}
              disabled={cancelMut.isPending}
              className="agenthub-icon-button"
              title="Cancel"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          )}
          {task.status !== "running" && (
            <button
              onClick={() => deleteMut.mutate({ id: task.id })}
              disabled={deleteMut.isPending}
              className="agenthub-icon-button hover:text-destructive"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="agenthub-icon-button"
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-white/10 bg-white/5 px-3 py-3 text-sm">
          {deps.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Depends on:</span>
              <p className="text-xs font-mono mt-0.5">{deps.join(", ")}</p>
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <label className="text-xs font-medium text-muted-foreground">
              Reassign
              <select
                value={reassignAgentId}
                onChange={(e) => setReassignAgentId(e.target.value)}
                className="mt-1 w-full rounded-xl border px-2 py-1 text-xs"
              >
                <option value="">Unassigned</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => reassignMut.mutate({ id: task.id, agentId: reassignAgentId || null })}
              disabled={reassignMut.isPending}
              className="agenthub-primary-button mt-5 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              <Users className="h-3.5 w-3.5" />
              Reassign
            </button>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              Comments
            </div>
            <div className="space-y-1">
              {(commentsQuery.data ?? []).map((entry) => (
                <p key={entry.id} className="rounded-xl bg-white/10 px-2 py-1 text-xs">
                  <span className="font-medium">{entry.authorType}:</span> {entry.body}
                </p>
              ))}
              {commentsQuery.isLoading && <p className="text-xs text-muted-foreground">Loading comments...</p>}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add comment"
                className="min-w-0 flex-1 rounded-xl border px-3 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => addCommentMut.mutate({ taskId: task.id, body: comment.trim() })}
                disabled={!comment.trim() || addCommentMut.isPending}
                className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15 disabled:opacity-50"
              >
                Add comment
              </button>
            </div>
          </div>

          {task.retryCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Retries: {task.retryCount}/{task.maxRetries}
            </p>
          )}
          {task.output && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Output:</span>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-2 text-xs">
                {task.output}
              </pre>
            </div>
          )}
          {task.error && (
            <div>
              <span className="text-xs font-medium text-red-500">Error:</span>
              <pre className="text-xs mt-1 whitespace-pre-wrap bg-red-50 dark:bg-red-900/20 rounded p-2 text-red-700 dark:text-red-400">
                {task.error}
              </pre>
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>Created: {new Date(task.createdAt).toLocaleString()}</span>
            {task.startedAt && <span>Started: {new Date(task.startedAt).toLocaleString()}</span>}
            {task.completedAt && <span>Completed: {new Date(task.completedAt).toLocaleString()}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function TaskManager() {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusAlias>("all");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [priority, setPriority] = useState(0);
  const [agentId, setAgentId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [subtasksText, setSubtasksText] = useState("");
  const [extraTasks, setExtraTasks] = useState<AgentTask[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueEvents, setQueueEvents] = useState<QueueProgressEvent[]>([]);

  const listInput = {
    limit: 25,
    statusAlias: statusFilter === "all" ? undefined : statusFilter,
    q: search.trim() || undefined,
    includeChildren: true,
  } as const;

  const { data: taskPage, refetch, isLoading } = trpc.tasks.list.useQuery(listInput);
  const { data: templates = [], refetch: refetchTemplates } = trpc.tasks.templates.useQuery();
  const { data: agents = [] } = trpc.agents.list.useQuery();

  useEffect(() => {
    setExtraTasks([]);
    setNextCursor(taskPage?.nextCursor ?? null);
  }, [taskPage?.nextCursor, statusFilter, search]);

  const createMut = trpc.tasks.create.useMutation({
    onSuccess: () => {
      setTitle("");
      setPrompt("");
      setPriority(0);
      setAgentId("");
      setTemplateId("");
      setSubtasksText("");
      setShowForm(false);
      setError(null);
      void refetch();
    },
    onError: (e) => setError(e.message),
  });

  const createTemplateMut = trpc.tasks.createTemplate.useMutation({
    onSuccess: () => {
      setError(null);
      void refetchTemplates();
    },
    onError: (e) => setError(e.message),
  });

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const events = new EventSource("/api/queues/progress");
    const onProgress = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as QueueProgressEvent;
        if (payload.queue !== "agent-tasks") return;
        setQueueEvents((current) =>
          [payload, ...current.filter((item) => item.queue !== payload.queue || item.jobId !== payload.jobId)].slice(
            0,
            5,
          ),
        );
        void refetch();
      } catch {
        // Ignore malformed progress frames; the polling query remains the fallback.
      }
    };
    events.addEventListener("progress", onProgress as EventListener);
    return () => events.close();
  }, [refetch]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((entry) => entry.id === id);
    if (!template) return;
    setTitle(template.title);
    setPrompt(template.prompt);
    setPriority(template.defaultPriority);
    setAgentId(template.agentId ?? "");
    setSubtasksText(stringifyTemplateSubtasks(template.subtasks));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !prompt.trim()) return;
    createMut.mutate({
      title: title.trim(),
      prompt: prompt.trim(),
      priority,
      agentId: agentId || undefined,
      templateId: templateId || undefined,
      subtasks: parseSubtasks(subtasksText),
    });
  }

  function handleSaveTemplate() {
    if (!title.trim() || !prompt.trim()) return;
    createTemplateMut.mutate({
      name: title.trim(),
      title: title.trim(),
      prompt: prompt.trim(),
      agentId: agentId || undefined,
      defaultPriority: priority,
      subtasks: parseSubtasks(subtasksText),
    });
  }

  async function handleLoadMore() {
    if (!nextCursor) return;
    const result = await utils.tasks.list.fetch({ ...listInput, cursor: nextCursor });
    setExtraTasks((current) => [...current, ...((result.items ?? []) as AgentTask[])]);
    setNextCursor(result.nextCursor);
  }

  const pageItems = (taskPage?.items ?? []) as AgentTask[];
  const tasks = [...pageItems, ...extraTasks];
  const agentsList = agents as AgentOption[];

  const byStatus = (task: AgentTask) => {
    const order: Record<string, number> = { running: 0, queued: 1, pending: 2, error: 3, cancelled: 4, success: 5 };
    return order[task.status] ?? 6;
  };

  const sorted = [...tasks].sort((a, b) => byStatus(a) - byStatus(b) || b.priority - a.priority);

  return (
    <div data-testid="agent-task-management" className="flex h-full flex-col bg-transparent">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Agent Tasks</h2>
          <p className="text-xs text-muted-foreground">
            {tasks.length} task{tasks.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Status filter
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusAlias)}
              className="ml-2 rounded-xl border px-2 py-1 text-xs"
            >
              <option value="all">All</option>
              <option value="todo">todo</option>
              <option value="in_progress">in progress</option>
              <option value="done">done</option>
              <option value="error">error</option>
              <option value="cancelled">cancelled</option>
            </select>
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter tasks"
            className="rounded-xl border px-3 py-1.5 text-xs"
          />
          <button
            onClick={() => setShowForm((s) => !s)}
            className="agenthub-primary-button flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            New Task
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-3 border-b border-white/10 bg-white/5 px-6 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Summarize the quarterly report"
                className="mt-1 w-full rounded-xl border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Template</label>
              <select
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-1.5 text-sm"
              >
                <option value="">No template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Please summarize the following content..."
              className="mt-1 w-full resize-none rounded-xl border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Subtasks</label>
            <textarea
              value={subtasksText}
              onChange={(e) => setSubtasksText(e.target.value)}
              rows={3}
              placeholder="Draft outline :: Prepare a first outline"
              className="mt-1 w-full resize-none rounded-xl border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium text-muted-foreground">
              Assigned agent
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="ml-2 rounded-xl border px-2 py-1 text-xs"
              >
                <option value="">Unassigned</option>
                {agentsList.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value))}
                className="ml-2 rounded-xl border px-2 py-1 text-xs"
              >
                <option value={2}>High (+2)</option>
                <option value={1}>Above normal (+1)</option>
                <option value={0}>Normal (0)</option>
                <option value={-1}>Below normal (-1)</option>
                <option value={-2}>Low (-2)</option>
              </select>
            </label>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={createMut.isPending || !title.trim() || !prompt.trim()}
              className="agenthub-primary-button rounded-xl px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {createMut.isPending ? "Creating..." : "Create Task"}
            </button>
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={createTemplateMut.isPending || !title.trim() || !prompt.trim()}
              className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-50"
            >
              Save Template
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        <AutoManagerPanel onRefresh={() => void refetch()} />
        {queueEvents.length > 0 && (
          <div className="agenthub-glass-panel rounded-2xl px-3 py-2 text-xs">
            <div className="mb-1 font-medium text-muted-foreground">Live queue progress</div>
            <div className="space-y-1">
              {queueEvents.map((event) => (
                <div key={`${event.queue}:${event.jobId}`} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{event.message ?? event.jobId}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatQueueProgress(event.progress)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading tasks...
          </div>
        ) : sorted.length === 0 ? (
          <div className="agenthub-glass-panel flex h-48 flex-col items-center justify-center gap-2 rounded-2xl text-muted-foreground">
            <Clock className="h-8 w-8" />
            <p className="text-sm">No tasks yet. Create one to get started.</p>
          </div>
        ) : (
          sorted.map((task) => (
            <TaskRow key={task.id} task={task} agents={agentsList} onRefresh={() => void refetch()} />
          ))
        )}
        {nextCursor && (
          <button
            type="button"
            onClick={() => void handleLoadMore()}
            className="mx-auto block rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}

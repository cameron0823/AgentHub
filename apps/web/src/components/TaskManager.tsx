"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Plus, Trash2, RotateCcw, XCircle, ChevronDown, ChevronUp, Loader2, CheckCircle, AlertCircle, Clock, Play } from "lucide-react";
import type { AgentTask } from "@/stores/chatStore";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  queued: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  running: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-muted text-muted-foreground",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status] ?? ""}`}>
      {status}
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

function TaskRow({ task, onRefresh }: { task: AgentTask; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();

  const cancelMut = trpc.tasks.cancel.useMutation({ onSuccess: onRefresh });
  const retryMut = trpc.tasks.retry.useMutation({ onSuccess: onRefresh });
  const deleteMut = trpc.tasks.delete.useMutation({ onSuccess: onRefresh });

  const deps: string[] = task.dependsOn ? (JSON.parse(task.dependsOn) as string[]) : [];
  void utils;

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <StatusIcon status={task.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{task.title}</span>
            <StatusBadge status={task.status} />
            {task.priority !== 0 && (
              <span className="text-xs text-muted-foreground">
                P{task.priority > 0 ? "+" : ""}{task.priority}
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
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Retry"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          {["pending", "queued"].includes(task.status) && (
            <button
              onClick={() => cancelMut.mutate({ id: task.id })}
              disabled={cancelMut.isPending}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Cancel"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          )}
          {task.status !== "running" && (
            <button
              onClick={() => deleteMut.mutate({ id: task.id })}
              disabled={deleteMut.isPending}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-3 py-3 space-y-2 bg-muted/20 text-sm">
          {deps.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Depends on:</span>
              <p className="text-xs font-mono mt-0.5">{deps.join(", ")}</p>
            </div>
          )}
          {task.retryCount > 0 && (
            <p className="text-xs text-muted-foreground">Retries: {task.retryCount}/{task.maxRetries}</p>
          )}
          {task.output && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Output:</span>
              <pre className="text-xs mt-1 whitespace-pre-wrap bg-muted rounded p-2 max-h-48 overflow-auto">{task.output}</pre>
            </div>
          )}
          {task.error && (
            <div>
              <span className="text-xs font-medium text-red-500">Error:</span>
              <pre className="text-xs mt-1 whitespace-pre-wrap bg-red-50 dark:bg-red-900/20 rounded p-2 text-red-700 dark:text-red-400">{task.error}</pre>
            </div>
          )}
          <div className="flex gap-4 text-xs text-muted-foreground">
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
  const { data: tasks = [], refetch, isLoading } = trpc.tasks.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [priority, setPriority] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const createMut = trpc.tasks.create.useMutation({
    onSuccess: () => {
      setTitle("");
      setPrompt("");
      setPriority(0);
      setShowForm(false);
      setError(null);
      void refetch();
    },
    onError: (e) => setError(e.message),
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !prompt.trim()) return;
    createMut.mutate({ title: title.trim(), prompt: prompt.trim(), priority });
  }

  const byStatus = (t: AgentTask) => {
    const order: Record<string, number> = { running: 0, queued: 1, pending: 2, error: 3, cancelled: 4, success: 5 };
    return order[t.status] ?? 6;
  };

  const sorted = [...(tasks as AgentTask[])].sort((a, b) => byStatus(a) - byStatus(b) || b.priority - a.priority);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h2 className="font-semibold text-lg">Agent Tasks</h2>
          <p className="text-xs text-muted-foreground">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="border-b px-4 py-3 space-y-3 bg-muted/20">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summarize the quarterly report"
              className="w-full mt-1 px-3 py-1.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Please summarize the following content…"
              className="w-full mt-1 px-3 py-1.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value))}
                className="ml-2 px-2 py-1 rounded border bg-background text-xs"
              >
                <option value={2}>High (+2)</option>
                <option value={1}>Above normal (+1)</option>
                <option value={0}>Normal (0)</option>
                <option value={-1}>Below normal (-1)</option>
                <option value={-2}>Low (-2)</option>
              </select>
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMut.isPending || !title.trim() || !prompt.trim()}
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {createMut.isPending ? "Creating…" : "Create Task"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null); }}
              className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading tasks…
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
            <Clock className="h-8 w-8" />
            <p className="text-sm">No tasks yet. Create one to get started.</p>
          </div>
        ) : (
          sorted.map((task) => (
            <TaskRow key={task.id} task={task} onRefresh={() => void refetch()} />
          ))
        )}
      </div>
    </div>
  );
}

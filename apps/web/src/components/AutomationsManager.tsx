"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Plus, Play, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";

const CRON_EXAMPLES = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at 9am", value: "0 9 * * *" },
  { label: "Every Monday 8am", value: "0 8 * * 1" },
  { label: "Every 30 minutes", value: "*/30 * * * *" },
];

function cronDescription(expr: string): string {
  const parts = expr.split(" ");
  if (parts.length !== 5) return expr;
  const [min, hour, , , day] = parts;
  if (min === "*/30" && hour === "*") return "Every 30 minutes";
  if (min?.startsWith("*/")) return `Every ${min.slice(2)} minutes`;
  if (hour === "*") return `Every hour at :${min?.padStart(2, "0")}`;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayName = day !== "*" ? ` on ${days[parseInt(day ?? "0")] ?? day}` : "";
  return `Daily at ${hour?.padStart(2, "0")}:${min?.padStart(2, "0")}${dayName}`;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">Never run</span>;
  const styles: Record<string, string> = {
    success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    running: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] ?? ""}`}>
      {status}
    </span>
  );
}

function RunHistory({ automationId }: { automationId: string }) {
  const { data: runs = [], isLoading } = trpc.automations.runs.useQuery({ automationId });

  if (isLoading) return <div className="text-xs text-muted-foreground px-4 py-2">Loading…</div>;
  if (runs.length === 0) return <div className="text-xs text-muted-foreground px-4 py-2">No runs yet</div>;

  return (
    <div className="border-t">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/40">
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Started</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Duration</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Output / Error</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const duration =
              run.startedAt && run.completedAt
                ? `${Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 1000)}s`
                : "—";
            return (
              <tr key={run.id} className="border-t hover:bg-muted/20">
                <td className="px-3 py-1.5">
                  <StatusBadge status={run.status} />
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{duration}</td>
                <td className="px-3 py-1.5 max-w-[300px] truncate text-muted-foreground">
                  {run.error ?? run.output ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface CreateFormProps {
  agents: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}

function CreateForm({ agents, onClose, onCreated }: CreateFormProps) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cron, setCron] = useState("0 9 * * *");
  const [agentId, setAgentId] = useState("");

  const utils = trpc.useUtils();
  const create = trpc.automations.create.useMutation({
    onSuccess: () => {
      void utils.automations.list.invalidate();
      onCreated();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim() || !cron.trim()) return;
    create.mutate({ name, prompt, cronExpression: cron, agentId: agentId || undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg bg-card p-4 space-y-3 mb-4">
      <h3 className="font-semibold text-sm">New Automation</h3>

      <div>
        <label className="text-xs text-muted-foreground">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Daily digest"
          className="w-full mt-1 px-3 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
          required
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Summarize the latest news about AI…"
          rows={3}
          className="w-full mt-1 px-3 py-1.5 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          required
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Schedule (cron expression)</label>
        <input
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          className="w-full mt-1 px-3 py-1.5 text-sm border rounded-md bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          required
        />
        <div className="mt-1 text-xs text-muted-foreground">{cronDescription(cron)}</div>
        <div className="flex flex-wrap gap-1 mt-1">
          {CRON_EXAMPLES.map((ex) => (
            <button
              key={ex.value}
              type="button"
              onClick={() => setCron(ex.value)}
              className="px-2 py-0.5 text-xs border rounded hover:bg-muted transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {agents.length > 0 && (
        <div>
          <label className="text-xs text-muted-foreground">Agent (optional)</label>
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full mt-1 px-3 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Default model</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={create.isPending}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
        >
          {create.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
          Create
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AutomationsManager() {
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: automations = [], isLoading } = trpc.automations.list.useQuery();
  const { data: agentList = [] } = trpc.agents.list.useQuery();

  const utils = trpc.useUtils();

  const toggle = trpc.automations.toggle.useMutation({
    onSuccess: () => void utils.automations.list.invalidate(),
  });
  const remove = trpc.automations.delete.useMutation({
    onSuccess: () => void utils.automations.list.invalidate(),
  });
  const trigger = trpc.automations.triggerNow.useMutation({
    onSuccess: () => {
      void utils.automations.list.invalidate();
      void utils.automations.runs.invalidate();
    },
  });

  const agentOptions = (agentList as { id: string; name: string }[]).map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Automations</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New
        </button>
      </div>

      {showCreate && (
        <CreateForm
          agents={agentOptions}
          onClose={() => setShowCreate(false)}
          onCreated={() => setShowCreate(false)}
        />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading…
        </div>
      ) : automations.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No automations yet. Create one to schedule recurring agent tasks.
        </div>
      ) : (
        <div className="space-y-2">
          {automations.map((auto) => (
            <div key={auto.id} className="border rounded-lg bg-card overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{auto.name}</span>
                    <StatusBadge status={auto.lastRunStatus} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span className="font-mono">{auto.cronExpression}</span>
                    <span>— {cronDescription(auto.cronExpression)}</span>
                    {auto.agentName && <span>· {auto.agentName}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => trigger.mutate({ id: auto.id })}
                    disabled={trigger.isPending}
                    className="p-1.5 rounded hover:bg-muted transition-colors"
                    title="Run now"
                  >
                    {trigger.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => toggle.mutate({ id: auto.id, isActive: !auto.isActive })}
                    className="p-1.5 rounded hover:bg-muted transition-colors"
                    title={auto.isActive ? "Disable" : "Enable"}
                  >
                    {auto.isActive ? (
                      <ToggleRight className="w-4 h-4 text-green-600" />
                    ) : (
                      <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${auto.name}"?`)) remove.mutate({ id: auto.id });
                    }}
                    className="p-1.5 rounded hover:bg-muted transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </button>
                  <button
                    onClick={() => setExpanded(expanded === auto.id ? null : auto.id)}
                    className="p-1.5 rounded hover:bg-muted transition-colors"
                    title="Run history"
                  >
                    {expanded === auto.id ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {expanded === auto.id && <RunHistory automationId={auto.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

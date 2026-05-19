"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Plus,
  Play,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Pause,
  RotateCcw,
} from "lucide-react";
import { WorkflowDesigner } from "./WorkflowDesigner";

const CRON_EXAMPLES = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at 9am", value: "0 9 * * *" },
  { label: "Every Monday 8am", value: "0 8 * * 1" },
  { label: "Every 30 minutes", value: "*/30 * * * *" },
];

const TIMEZONE_OPTIONS = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"];

const darkReaderSafeIconProps = { suppressHydrationWarning: true };

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
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] ?? ""}`}>{status}</span>;
}

function RunHistory({ automationId }: { automationId: string }) {
  const { data: runs = [], isLoading } = trpc.automations.runs.useQuery({ automationId });

  if (isLoading) return <div className="text-xs text-muted-foreground px-4 py-2">Loading…</div>;
  if (runs.length === 0) return <div className="text-xs text-muted-foreground px-4 py-2">No runs yet</div>;

  return (
    <div className="border-t border-white/10">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-white/5">
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Started</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Duration</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Session</th>
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
              <tr key={run.id} className="border-t border-white/10 hover:bg-white/5">
                <td className="px-3 py-1.5">
                  <StatusBadge status={run.status} />
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{duration}</td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {run.sessionId ? (
                    <a href={`/?session=${run.sessionId}`} className="text-primary hover:underline">
                      Open session
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
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
  const [timezone, setTimezone] = useState("UTC");
  const [maxExecutions, setMaxExecutions] = useState("");
  const [notificationWebhookUrl, setNotificationWebhookUrl] = useState("");
  const [agentId, setAgentId] = useState("");
  const [error, setError] = useState("");

  const utils = trpc.useUtils();
  const create = trpc.automations.create.useMutation({
    onSuccess: () => {
      void utils.automations.list.invalidate();
      onCreated();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !prompt.trim() || !cron.trim()) return;
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) {
      setError("Invalid cron expression.");
      return;
    }
    create.mutate({
      name,
      prompt,
      cronExpression: cron,
      timezone,
      maxExecutions: maxExecutions ? Number(maxExecutions) : undefined,
      agentId: agentId || undefined,
      notificationWebhookUrl: notificationWebhookUrl || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="agenthub-glass-panel mb-4 space-y-3 rounded-2xl p-5">
      <h3 className="font-semibold text-sm">New Automation</h3>

      <div>
        <label htmlFor="automation-name" className="text-xs text-muted-foreground">
          Name
        </label>
        <input
          id="automation-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Daily digest"
          className="mt-1 w-full rounded-xl border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          required
        />
      </div>

      <div>
        <label htmlFor="automation-prompt" className="text-xs text-muted-foreground">
          Prompt
        </label>
        <textarea
          id="automation-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Summarize the latest news about AI…"
          rows={3}
          className="mt-1 w-full resize-none rounded-xl border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          required
        />
      </div>

      <div>
        <label htmlFor="automation-cron" className="text-xs text-muted-foreground">
          Schedule (cron expression)
        </label>
        <input
          id="automation-cron"
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          className="mt-1 w-full rounded-xl border px-3 py-1.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          required
        />
        <div className="mt-1 text-xs text-muted-foreground">{cronDescription(cron)}</div>
        <p className="mt-2 text-xs font-medium text-muted-foreground">Frequency presets</p>
        <div className="flex flex-wrap gap-1 mt-1">
          {CRON_EXAMPLES.map((ex) => (
            <button
              key={ex.value}
              type="button"
              onClick={() => setCron(ex.value)}
              className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-xs transition-colors hover:bg-white/15"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="automation-timezone" className="text-xs text-muted-foreground">
            Timezone
          </label>
          <select
            id="automation-timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="automation-max-executions" className="text-xs text-muted-foreground">
            Max executions
          </label>
          <input
            id="automation-max-executions"
            type="number"
            min={1}
            value={maxExecutions}
            onChange={(e) => setMaxExecutions(e.target.value)}
            placeholder="Unlimited"
            className="mt-1 w-full rounded-xl border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      <div>
        <label htmlFor="automation-webhook" className="text-xs text-muted-foreground">
          Notification webhook
        </label>
        <input
          id="automation-webhook"
          type="url"
          value={notificationWebhookUrl}
          onChange={(e) => setNotificationWebhookUrl(e.target.value)}
          placeholder="https://example.com/automation-webhook"
          className="mt-1 w-full rounded-xl border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {agents.length > 0 && (
        <div>
          <label htmlFor="automation-agent" className="text-xs text-muted-foreground">
            Agent (optional)
          </label>
          <select
            id="automation-agent"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
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

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={create.isPending}
          className="agenthub-primary-button flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {create.isPending && <Loader2 {...darkReaderSafeIconProps} className="w-3 h-3 animate-spin" />}
          Create
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/15"
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
  const pause = trpc.automations.pause.useMutation({
    onSuccess: () => void utils.automations.list.invalidate(),
  });
  const resume = trpc.automations.resume.useMutation({
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
    <div data-testid="automation-hardening" className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-semibold tracking-tight">Automations</h1>
        <button
          onClick={() => setShowCreate(true)}
          aria-label="New automation"
          className="agenthub-primary-button flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm transition-colors"
        >
          <Plus {...darkReaderSafeIconProps} className="w-4 h-4" />
          New
        </button>
      </div>

      {showCreate && (
        <CreateForm agents={agentOptions} onClose={() => setShowCreate(false)} onCreated={() => setShowCreate(false)} />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 {...darkReaderSafeIconProps} className="w-5 h-5 animate-spin mr-2" />
          Loading…
        </div>
      ) : automations.length === 0 ? (
        <div className="agenthub-glass-panel rounded-2xl py-12 text-center text-sm text-muted-foreground">
          No automations yet. Create one to schedule recurring agent tasks.
        </div>
      ) : (
        <div className="space-y-2">
          {automations.map((auto) => (
            <div
              key={auto.id}
              data-testid="automation-card"
              className="agenthub-glass-panel overflow-hidden rounded-2xl"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{auto.name}</span>
                    <StatusBadge status={auto.lastRunStatus} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <Clock {...darkReaderSafeIconProps} className="w-3 h-3" />
                    <span className="font-mono">{auto.cronExpression}</span>
                    <span>— {cronDescription(auto.cronExpression)}</span>
                    <span>· {auto.timezone}</span>
                    {auto.maxExecutions && (
                      <span>
                        · {auto.executionCount}/{auto.maxExecutions} runs
                      </span>
                    )}
                    {auto.agentName && <span>· {auto.agentName}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => trigger.mutate({ id: auto.id })}
                    disabled={trigger.isPending}
                    className="rounded p-1.5 transition-colors hover:bg-white/10"
                    aria-label={`Run ${auto.name} now`}
                    title="Run now"
                  >
                    {trigger.isPending ? (
                      <Loader2 {...darkReaderSafeIconProps} className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play {...darkReaderSafeIconProps} className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => toggle.mutate({ id: auto.id, isActive: !auto.isActive })}
                    className="rounded p-1.5 transition-colors hover:bg-white/10"
                    aria-label={auto.isActive ? `Disable ${auto.name}` : `Enable ${auto.name}`}
                    title={auto.isActive ? "Disable" : "Enable"}
                  >
                    {auto.isActive ? (
                      <ToggleRight {...darkReaderSafeIconProps} className="w-4 h-4 text-green-600" />
                    ) : (
                      <ToggleLeft {...darkReaderSafeIconProps} className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  {auto.isActive ? (
                    <button
                      onClick={() => pause.mutate({ id: auto.id, reason: "manual_pause" })}
                      className="rounded p-1.5 transition-colors hover:bg-white/10"
                      aria-label={`Pause ${auto.name}`}
                      title="Pause"
                    >
                      <Pause {...darkReaderSafeIconProps} className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => resume.mutate({ id: auto.id })}
                      className="rounded p-1.5 transition-colors hover:bg-white/10"
                      aria-label={`Resume ${auto.name}`}
                      title="Resume"
                    >
                      <RotateCcw {...darkReaderSafeIconProps} className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${auto.name}"?`)) remove.mutate({ id: auto.id });
                    }}
                    className="rounded p-1.5 transition-colors hover:bg-white/10"
                    aria-label={`Delete ${auto.name}`}
                    title="Delete"
                  >
                    <Trash2
                      {...darkReaderSafeIconProps}
                      className="w-4 h-4 text-muted-foreground hover:text-destructive"
                    />
                  </button>
                  <button
                    onClick={() => setExpanded(expanded === auto.id ? null : auto.id)}
                    className="rounded p-1.5 transition-colors hover:bg-white/10"
                    aria-label={
                      expanded === auto.id ? `Hide run history for ${auto.name}` : `Show run history for ${auto.name}`
                    }
                    title="Run history"
                  >
                    {expanded === auto.id ? (
                      <ChevronUp {...darkReaderSafeIconProps} className="w-4 h-4" />
                    ) : (
                      <ChevronDown {...darkReaderSafeIconProps} className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {expanded === auto.id && (
                <>
                  <WorkflowDesigner automation={auto} />
                  <RunHistory automationId={auto.id} />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

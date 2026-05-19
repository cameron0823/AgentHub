"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, BarChart3, ListChecks, ShieldCheck, ShieldOff, Users } from "lucide-react";

type AdminTab = "users" | "stats" | "queues";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="agenthub-glass-panel rounded-2xl p-5 flex flex-col gap-1">
      <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function formatReason(value: unknown) {
  if (!value) return "Manual pause";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "Paused";
  }
}

function UsersTab() {
  const utils = trpc.useUtils();
  const { data: userList = [], isLoading } = trpc.admin.users.list.useQuery();
  const setRole = trpc.admin.users.setRole.useMutation({
    onSuccess: () => utils.admin.users.list.invalidate(),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-left">
            <th className="pb-2 pr-4 font-medium">Name</th>
            <th className="pb-2 pr-4 font-medium">Email</th>
            <th className="pb-2 pr-4 font-medium">Role</th>
            <th className="pb-2 pr-4 font-medium">Joined</th>
            <th className="pb-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {userList.map((u) => (
            <tr key={u.id} className="group">
              <td className="py-2.5 pr-4">{u.name ?? "—"}</td>
              <td className="py-2.5 pr-4 text-muted-foreground">{u.email}</td>
              <td className="py-2.5 pr-4">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    u.role === "admin" ? "bg-primary/10 text-primary" : "bg-white/10 text-muted-foreground"
                  }`}
                >
                  {u.role === "admin" ? <ShieldCheck className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
                  {u.role}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-muted-foreground">
                {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
              </td>
              <td className="py-2.5">
                <button
                  onClick={() => setRole.mutate({ userId: u.id, role: u.role === "admin" ? "user" : "admin" })}
                  disabled={setRole.isPending}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  {u.role === "admin" ? "Revoke admin" : "Make admin"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {userList.length === 0 && <p className="py-8 text-center text-muted-foreground">No users found.</p>}
    </div>
  );
}

function StatsTab() {
  const { data: stats, isLoading } = trpc.admin.stats.overview.useQuery();

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <StatCard label="Total users" value={stats?.users ?? 0} />
      <StatCard label="Agents" value={stats?.agents ?? 0} />
      <StatCard label="Chat sessions" value={stats?.sessions ?? 0} />
      <StatCard label="Messages" value={stats?.messages ?? 0} />
      <StatCard label="Tasks" value={stats?.tasks ?? 0} />
    </div>
  );
}

function QueuesTab() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.stats.queues.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const { data: graphThreads = [], isLoading: graphLoading } = trpc.admin.stats.graphThreads.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const resumeGraphThread = trpc.admin.stats.resumeGraphThread.useMutation({
    onSuccess: () => {
      void utils.admin.stats.graphThreads.invalidate();
    },
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-5">
      {!data?.available && (
        <div className="flex items-center gap-2 rounded-xl border border-yellow-400/20 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
          <AlertTriangle className="h-4 w-4" />
          Queue metrics are unavailable.
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Queue</th>
              <th className="px-3 py-2 font-medium">Waiting</th>
              <th className="px-3 py-2 font-medium">Active</th>
              <th className="px-3 py-2 font-medium">Delayed</th>
              <th className="px-3 py-2 font-medium">Failed</th>
              <th className="px-3 py-2 font-medium">Completed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {(data?.queues ?? []).map((item) => (
              <tr key={item.queue}>
                <td className="px-3 py-2 font-medium">{item.queue}</td>
                <td className="px-3 py-2 tabular-nums">{item.counts.waiting ?? 0}</td>
                <td className="px-3 py-2 tabular-nums">{item.counts.active ?? 0}</td>
                <td className="px-3 py-2 tabular-nums">{item.counts.delayed ?? 0}</td>
                <td className="px-3 py-2 tabular-nums">{item.counts.failed ?? 0}</td>
                <td className="px-3 py-2 tabular-nums">{item.counts.completed ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(data?.queues ?? []).length === 0 && (
          <p className="py-8 text-center text-muted-foreground">No queue metrics available.</p>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Dead letters</h2>
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Queue</th>
                <th className="px-3 py-2 font-medium">Job</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {(data?.deadLetters ?? []).map((entry) => (
                <tr key={entry.id}>
                  <td className="px-3 py-2">{entry.queueName}</td>
                  <td className="px-3 py-2 font-mono text-xs">{entry.jobId}</td>
                  <td className="px-3 py-2">{entry.failureCategory}</td>
                  <td className="px-3 py-2 text-muted-foreground">{entry.errorMessage}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(data?.deadLetters ?? []).length === 0 && (
            <p className="py-8 text-center text-muted-foreground">No dead-lettered jobs.</p>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Paused graph threads</h2>
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Thread</th>
                <th className="px-3 py-2 font-medium">Graph</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Updated</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {graphThreads.map((thread) => (
                <tr key={thread.threadId}>
                  <td className="px-3 py-2 font-mono text-xs">{thread.threadId}</td>
                  <td className="px-3 py-2">{thread.graphId ?? "unknown"}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-muted-foreground">
                    {formatReason(thread.pauseReason)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {thread.updatedAt ? new Date(thread.updatedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => resumeGraphThread.mutate({ threadId: thread.threadId })}
                      disabled={resumeGraphThread.isPending}
                      className="rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs hover:bg-white/15 disabled:opacity-50"
                    >
                      Resume
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {graphLoading ? (
            <p className="py-8 text-center text-muted-foreground">Loading paused graph threads...</p>
          ) : (
            graphThreads.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">No paused graph threads.</p>
            )
          )}
        </div>
      </section>
    </div>
  );
}

export function AdminPanel() {
  const [tab, setTab] = useState<AdminTab>("users");

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 max-w-5xl mx-auto w-full">
      <h1 className="mb-5 text-4xl font-semibold tracking-tight">Admin Panel</h1>

      <div className="mb-6 flex gap-1 border-b border-white/15">
        {(["users", "stats", "queues"] as AdminTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "users" ? (
              <Users className="w-3.5 h-3.5" />
            ) : t === "stats" ? (
              <BarChart3 className="w-3.5 h-3.5" />
            ) : (
              <ListChecks className="w-3.5 h-3.5" />
            )}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "users" ? <UsersTab /> : tab === "stats" ? <StatsTab /> : <QueuesTab />}
    </div>
  );
}

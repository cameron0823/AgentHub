"use client";

import { trpc } from "@/lib/trpc";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  type PieLabelRenderProps,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

export function AnalyticsDashboard() {
  const { data: summary, isLoading: summaryLoading } = trpc.analytics.summary.useQuery();
  const { data: perDay = [] } = trpc.analytics.messagesPerDay.useQuery({ days: 30 });
  const { data: byAgent = [] } = trpc.analytics.tokensByAgent.useQuery();
  const { data: roles = [] } = trpc.analytics.roleDistribution.useQuery();
  const { data: tokensPerDay = [] } = trpc.analytics.tokensPerDay.useQuery({ days: 30 });
  const { data: latencyPerDay = [] } = trpc.analytics.latencyPerDay.useQuery({ days: 30 });

  if (summaryLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading analytics…</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Chats" value={summary?.totalSessions ?? 0} />
        <StatCard label="Total Messages" value={summary?.totalMessages ?? 0} />
        <StatCard label="Tokens This Week" value={(summary?.weekTokens ?? 0).toLocaleString()} />
        <StatCard label="Favorite Agent" value={summary?.favoriteAgent ?? "—"} />
      </div>

      {/* Messages per day */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium mb-4">Messages per Day (Last 30 Days)</h2>
        {perDay.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={perDay}>
              <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tokens per day */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium mb-4">Tokens per Day (Last 30 Days)</h2>
        {tokensPerDay.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={tokensPerDay}>
              <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => [Number(v).toLocaleString(), "Tokens"]} />
              <Bar dataKey="tokens" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Avg latency per day */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium mb-4">Avg Response Latency per Day (ms)</h2>
        {latencyPerDay.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={latencyPerDay}>
              <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => [`${Number(v)} ms`, "Avg Latency"]} />
              <Line type="monotone" dataKey="avgLatency" stroke="#f59e0b" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Tokens by agent */}
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium mb-4">Tokens by Agent</h2>
          {byAgent.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byAgent}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="tokens" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Role distribution */}
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium mb-4">Message Role Distribution</h2>
          {roles.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={roles} dataKey="count" nameKey="role" cx="50%" cy="50%" outerRadius={70} label={(props: PieLabelRenderProps) => `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`}>
                  {roles.map((_: unknown, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

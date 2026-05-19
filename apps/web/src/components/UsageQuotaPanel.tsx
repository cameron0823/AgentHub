"use client";

import type { ReactNode } from "react";
import { Activity, Database, MessageSquare, Server, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";

type UsageRowProps = {
  label: string;
  value: number;
  limit: number;
  percent: number;
  format?: (value: number) => string;
  icon: ReactNode;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${units[index]}`;
}

function UsageRow({ label, value, limit, percent, format = formatNumber, icon }: UsageRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <span className="truncate font-medium">{label}</span>
        </div>
        <span className="shrink-0 text-muted-foreground">
          {format(value)} / {format(limit)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function UsageQuotaPanel() {
  const quota = trpc.quotas.current.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  if (quota.isLoading) {
    return <div className="agenthub-glass-panel rounded-2xl p-4 text-sm text-muted-foreground">Loading usage...</div>;
  }

  if (!quota.data) {
    return (
      <div className="agenthub-glass-panel rounded-2xl p-4 text-sm text-muted-foreground">Usage is unavailable.</div>
    );
  }

  const data = quota.data;

  return (
    <div className="agenthub-glass-panel space-y-4 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Usage</h2>
        </div>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {data.plan}
        </span>
      </div>

      <div className="space-y-4">
        <UsageRow
          label="Messages"
          value={data.messagesSent}
          limit={data.maxMessages}
          percent={data.usage.messages}
          icon={<MessageSquare className="h-4 w-4" />}
        />
        <UsageRow
          label="Tokens"
          value={data.tokensUsed}
          limit={data.maxTokens}
          percent={data.usage.tokens}
          icon={<Zap className="h-4 w-4" />}
        />
        <UsageRow
          label="Storage"
          value={data.storageUsed}
          limit={data.maxStorage}
          percent={data.usage.storage}
          format={formatBytes}
          icon={<Database className="h-4 w-4" />}
        />
        <UsageRow
          label="API calls"
          value={data.apiCalls}
          limit={data.maxApiCalls}
          percent={data.usage.api}
          icon={<Server className="h-4 w-4" />}
        />
      </div>

      <p className="text-xs text-muted-foreground">Resets {new Date(data.resetAt).toLocaleDateString()}.</p>
    </div>
  );
}

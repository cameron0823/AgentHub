"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, ClipboardList } from "lucide-react";
import { trpc } from "@/lib/trpc";

function parseCsv(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function McpGovernancePanel() {
  const utils = trpc.useUtils();
  const servers = trpc.mcpServers.list.useQuery();
  const [serverId, setServerId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [rateLimit, setRateLimit] = useState("30");
  const [deniedTools, setDeniedTools] = useState("");
  const [blockedPatterns, setBlockedPatterns] = useState("");
  const [startHour, setStartHour] = useState("0");
  const [endHour, setEndHour] = useState("23");

  const selectedServerId = serverId || servers.data?.[0]?.id || "";
  const selectedServer = useMemo(
    () => servers.data?.find((server) => server.id === selectedServerId),
    [servers.data, selectedServerId],
  );

  const policy = trpc.mcpGovernance.getPolicy.useQuery(
    { serverId: selectedServerId },
    { enabled: Boolean(selectedServerId) },
  );
  const auditLog = trpc.mcpGovernance.auditLog.useQuery(
    { serverId: selectedServerId || undefined, limit: 20 },
    { enabled: Boolean(selectedServerId) },
  );
  const upsertPolicy = trpc.mcpGovernance.upsertPolicy.useMutation({
    onSuccess: () => {
      utils.mcpServers.list.invalidate();
      utils.mcpGovernance.getPolicy.invalidate();
      utils.mcpGovernance.auditLog.invalidate();
    },
  });

  const handleSave = () => {
    if (!selectedServerId) return;
    const rateLimitPerMinute = Number.parseInt(rateLimit, 10);
    upsertPolicy.mutate({
      serverId: selectedServerId,
      governanceEnabled: enabled,
      governancePolicy: {
        enabled,
        deniedTools: parseCsv(deniedTools),
        blockedPatterns: parseCsv(blockedPatterns),
        rateLimitPerMinute:
          Number.isFinite(rateLimitPerMinute) && rateLimitPerMinute > 0 ? rateLimitPerMinute : undefined,
        allowedHoursUtc: {
          start: Number.parseInt(startHour, 10),
          end: Number.parseInt(endHour, 10),
        },
      },
    });
  };

  return (
    <section data-testid="mcp-governance-bridge" className="agenthub-glass-panel space-y-4 rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-sm font-semibold">MCP Governance Bridge</h3>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">MCP server</span>
          <select
            className="agenthub-field w-full px-3 py-2 text-sm"
            value={selectedServerId}
            onChange={(event) => setServerId(event.target.value)}
          >
            {(servers.data ?? []).map((server) => (
              <option key={server.id} value={server.id}>
                {server.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Rate limit</span>
          <input
            className="agenthub-field w-full px-3 py-2 text-sm"
            type="number"
            min={1}
            value={rateLimit}
            onChange={(event) => setRateLimit(event.target.value)}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        <span>Enable governance for this server</span>
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Blocked patterns</span>
          <textarea
            className="agenthub-field min-h-20 w-full px-3 py-2 font-mono text-xs"
            placeholder="secret, private_key, rm -rf"
            value={blockedPatterns}
            onChange={(event) => setBlockedPatterns(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Denied tools</span>
          <textarea
            className="agenthub-field min-h-20 w-full px-3 py-2 font-mono text-xs"
            placeholder="dangerous_tool, write_file"
            value={deniedTools}
            onChange={(event) => setDeniedTools(event.target.value)}
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Allowed hours UTC start</span>
          <input
            className="agenthub-field w-full px-3 py-2 text-sm"
            type="number"
            min={0}
            max={23}
            value={startHour}
            onChange={(event) => setStartHour(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Allowed hours UTC end</span>
          <input
            className="agenthub-field w-full px-3 py-2 text-sm"
            type="number"
            min={0}
            max={23}
            value={endHour}
            onChange={(event) => setEndHour(event.target.value)}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={!selectedServerId || upsertPolicy.isPending}
        className="agenthub-primary-button rounded-xl px-3 py-2 text-sm disabled:opacity-50"
      >
        {upsertPolicy.isPending ? "Saving..." : "Save policy"}
      </button>

      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <ClipboardList className="h-4 w-4" />
          <span>Audit Log</span>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          {selectedServer ? selectedServer.name : "No MCP server selected"}
          {policy.data?.governanceEnabled === false ? " · governance disabled" : ""}
        </p>
        {auditLog.data && auditLog.data.length > 0 ? (
          <ul className="space-y-1 text-xs font-mono">
            {auditLog.data.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-2 text-muted-foreground">
                <span>{entry.outcome.toUpperCase()}</span>
                <span>{entry.tool}</span>
                <span>{new Date(entry.createdAt).toLocaleString()}</span>
                {entry.detail && <span>{entry.detail}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground italic">No MCP governance audit entries.</p>
        )}
      </div>
    </section>
  );
}

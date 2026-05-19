"use client";

import { useState } from "react";
import { Plus, Trash2, TestTube, Check, X, Server, Terminal, Globe, Download, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { hasDesktopRuntime } from "@/lib/desktop-runtime";
import { McpMarketplace } from "./McpMarketplace";
import { McpGovernancePanel } from "./McpGovernancePanel";

type Transport = "stdio" | "http" | "streamable-http" | "sse";
type TestResult = {
  ok: boolean;
  error?: string;
  schemaDiff?: { added: string[]; removed: string[]; changed: string[] };
};

export function McpSettings() {
  const [showAdd, setShowAdd] = useState(false);
  const [transport, setTransport] = useState<Transport>("stdio");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState("");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("");
  const [configText, setConfigText] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const utils = trpc.useUtils();
  const servers = trpc.mcpServers.list.useQuery();
  const createServer = trpc.mcpServers.create.useMutation({
    onSuccess: () => {
      utils.mcpServers.list.invalidate();
      setShowAdd(false);
      resetForm();
    },
  });
  const deleteServer = trpc.mcpServers.delete.useMutation({
    onSuccess: () => utils.mcpServers.list.invalidate(),
  });
  const toggleServer = trpc.mcpServers.update.useMutation({
    onSuccess: () => utils.mcpServers.list.invalidate(),
  });
  const testServer = trpc.mcpServers.test.useMutation();
  const exportConfig = trpc.mcpServers.exportConfig.useMutation({
    onSuccess: (data) => setConfigText(JSON.stringify(data, null, 2)),
  });
  const importConfig = trpc.mcpServers.importConfig.useMutation({
    onSuccess: () => {
      utils.mcpServers.list.invalidate();
      setConfigText("");
    },
  });
  const desktopRuntimeAvailable = hasDesktopRuntime();
  const stdioBlocked = transport === "stdio" && !desktopRuntimeAvailable;

  function resetForm() {
    setName("");
    setCommand("");
    setArgs("");
    setEnv("");
    setUrl("");
    setHeaders("");
    setTransport("stdio");
  }

  const handleAdd = () => {
    if (!name.trim()) return;
    if (stdioBlocked) return;
    createServer.mutate({
      name: name.trim(),
      transport,
      command: transport === "stdio" ? command.trim() || undefined : undefined,
      args: transport === "stdio" && args.trim() ? JSON.stringify(args.trim().split(/\s+/)) : undefined,
      env: env.trim() ? env.trim() : undefined,
      url: transport !== "stdio" ? url.trim() || undefined : undefined,
      headers: transport !== "stdio" && headers.trim() ? headers.trim() : undefined,
    });
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await testServer.mutateAsync({ id });
      setTestResults((prev) => ({ ...prev, [id]: result }));
      utils.mcpServers.list.invalidate();
    } finally {
      setTestingId(null);
    }
  };

  const handleImport = () => {
    if (!configText.trim()) return;
    importConfig.mutate({ config: JSON.parse(configText), replace: false });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Server className="w-5 h-5" />
          MCP Servers
        </h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="agenthub-primary-button flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Server
        </button>
      </div>

      <div className="agenthub-glass-panel space-y-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Config import/export</h3>
          <div className="flex gap-2">
            <button
              onClick={() => exportConfig.mutate({ includeSecrets: false })}
              className="agenthub-secondary-button flex items-center gap-2 px-3 py-1.5 text-sm"
            >
              <Download className="h-4 w-4" />
              Export config
            </button>
            <button
              onClick={handleImport}
              disabled={!configText.trim() || importConfig.isPending}
              className="agenthub-secondary-button flex items-center gap-2 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Import config
            </button>
          </div>
        </div>
        <textarea
          className="agenthub-field min-h-24 w-full px-3 py-2 font-mono text-xs"
          placeholder='{"version":1,"servers":[{"name":"Cloud MCP","transport":"streamable-http","url":"https://example.com/mcp"}]}'
          value={configText}
          onChange={(e) => setConfigText(e.target.value)}
        />
      </div>

      <McpMarketplace />

      <McpGovernancePanel />

      {showAdd && (
        <div className="agenthub-glass-panel space-y-3 rounded-2xl p-4">
          <h3 className="font-medium">New MCP Server</h3>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Name</label>
              <input
                className="agenthub-field w-full px-3 py-1.5 text-sm"
                placeholder="My MCP Server"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Transport</label>
              <select
                className="agenthub-field w-full px-3 py-1.5 text-sm"
                value={transport}
                onChange={(e) => setTransport(e.target.value as Transport)}
              >
                <option value="stdio">stdio</option>
                <option value="http">HTTP</option>
                <option value="streamable-http">Streamable HTTP</option>
                <option value="sse">SSE</option>
              </select>
            </div>
          </div>

          {transport === "stdio" ? (
            <>
              {stdioBlocked && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                  Desktop runtime required
                </p>
              )}
              <div>
                <label className="text-sm text-muted-foreground mb-1 block flex items-center gap-1">
                  <Terminal className="w-3 h-3" /> Command
                </label>
                <input
                  className="agenthub-field w-full px-3 py-1.5 font-mono text-sm"
                  placeholder="npx some-mcp-server"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Args (space-separated)</label>
                <input
                  className="agenthub-field w-full px-3 py-1.5 font-mono text-sm"
                  placeholder="--port 3001 --verbose"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block flex items-center gap-1">
                  <Globe className="w-3 h-3" /> URL
                </label>
                <input
                  className="agenthub-field w-full px-3 py-1.5 font-mono text-sm"
                  placeholder={transport === "http" ? "http://localhost:3001" : "https://example.com/mcp"}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Headers JSON</label>
                <input
                  className="agenthub-field w-full px-3 py-1.5 font-mono text-sm"
                  placeholder='{"Authorization":"Bearer ..."}'
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                />
              </div>
            </>
          )}

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Env vars (JSON, optional)</label>
            <input
              className="agenthub-field w-full px-3 py-1.5 font-mono text-sm"
              placeholder='{"API_KEY": "..."}'
              value={env}
              onChange={(e) => setEnv(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={createServer.isPending || !name.trim() || stdioBlocked}
              className="agenthub-primary-button rounded-xl px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {createServer.isPending ? "Adding..." : "Add"}
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                resetForm();
              }}
              className="agenthub-secondary-button px-3 py-1.5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {servers.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {servers.data?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No MCP servers configured. Add one to extend agent capabilities.
          </p>
        )}

        {servers.data?.map((srv) => {
          const result = testResults[srv.id];
          const schemaDiff = result?.schemaDiff;
          return (
            <div key={srv.id} className="agenthub-list-row flex items-center gap-3 p-3" data-testid="mcp-server-row">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{srv.name}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">
                    {srv.transport}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${srv.enabled ? "bg-green-500/15 text-green-300" : "bg-white/10 text-muted-foreground"}`}
                  >
                    {srv.enabled ? "enabled" : "disabled"}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">
                    {srv.lastHealthStatus ?? "unknown"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                  {srv.transport === "stdio" ? srv.command || "–" : srv.url || "–"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {srv.lastToolCount ?? 0} tools
                  {schemaDiff && (
                    <span className="ml-2">
                      Schema +{schemaDiff.added.length} -{schemaDiff.removed.length} ~{schemaDiff.changed.length}
                    </span>
                  )}
                  {result?.error && <span className="ml-2 text-destructive">{result.error}</span>}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleTest(srv.id)}
                  disabled={testingId === srv.id}
                  title="Test connection"
                  className="agenthub-icon-button"
                >
                  {testingId === srv.id ? (
                    <span className="text-xs">...</span>
                  ) : result?.ok === true ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <TestTube className="w-4 h-4" />
                  )}
                </button>

                <button
                  onClick={() => toggleServer.mutate({ id: srv.id, enabled: !srv.enabled })}
                  title={srv.enabled ? "Disable" : "Enable"}
                  className="agenthub-icon-button"
                >
                  {srv.enabled ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                </button>

                <button
                  onClick={() => deleteServer.mutate({ id: srv.id })}
                  title="Delete"
                  className="agenthub-icon-button text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

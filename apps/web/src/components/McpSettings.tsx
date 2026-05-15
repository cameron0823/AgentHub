"use client";

import { useState } from "react";
import { Plus, Trash2, TestTube, Check, X, Server, Terminal, Globe } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Transport = "stdio" | "http";

export function McpSettings() {
  const [showAdd, setShowAdd] = useState(false);
  const [transport, setTransport] = useState<Transport>("stdio");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState("");
  const [url, setUrl] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

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

  function resetForm() {
    setName(""); setCommand(""); setArgs(""); setEnv(""); setUrl("");
    setTransport("stdio");
  }

  const handleAdd = () => {
    if (!name.trim()) return;
    createServer.mutate({
      name: name.trim(),
      transport,
      command: transport === "stdio" ? command.trim() || undefined : undefined,
      args: transport === "stdio" && args.trim() ? JSON.stringify(args.trim().split(/\s+/)) : undefined,
      env: env.trim() ? env.trim() : undefined,
      url: transport === "http" ? url.trim() || undefined : undefined,
    });
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      await testServer.mutateAsync({ id });
    } finally {
      setTestingId(null);
    }
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
          className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Add Server
        </button>
      </div>

      {showAdd && (
        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-medium">New MCP Server</h3>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Name</label>
              <input
                className="w-full border rounded px-3 py-1.5 text-sm bg-background"
                placeholder="My MCP Server"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Transport</label>
              <select
                className="w-full border rounded px-3 py-1.5 text-sm bg-background"
                value={transport}
                onChange={e => setTransport(e.target.value as Transport)}
              >
                <option value="stdio">stdio</option>
                <option value="http">HTTP</option>
              </select>
            </div>
          </div>

          {transport === "stdio" ? (
            <>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block flex items-center gap-1">
                  <Terminal className="w-3 h-3" /> Command
                </label>
                <input
                  className="w-full border rounded px-3 py-1.5 text-sm bg-background font-mono"
                  placeholder="npx some-mcp-server"
                  value={command}
                  onChange={e => setCommand(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Args (space-separated)</label>
                <input
                  className="w-full border rounded px-3 py-1.5 text-sm bg-background font-mono"
                  placeholder="--port 3001 --verbose"
                  value={args}
                  onChange={e => setArgs(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div>
              <label className="text-sm text-muted-foreground mb-1 block flex items-center gap-1">
                <Globe className="w-3 h-3" /> URL
              </label>
              <input
                className="w-full border rounded px-3 py-1.5 text-sm bg-background font-mono"
                placeholder="http://localhost:3001"
                value={url}
                onChange={e => setUrl(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Env vars (JSON, optional)</label>
            <input
              className="w-full border rounded px-3 py-1.5 text-sm bg-background font-mono"
              placeholder='{"API_KEY": "..."}'
              value={env}
              onChange={e => setEnv(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={createServer.isPending || !name.trim()}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {createServer.isPending ? "Adding..." : "Add"}
            </button>
            <button
              onClick={() => { setShowAdd(false); resetForm(); }}
              className="px-3 py-1.5 border rounded text-sm hover:bg-muted"
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

        {servers.data?.map(srv => (
          <div key={srv.id} className="flex items-center gap-3 border rounded-lg p-3" data-testid="mcp-server-row">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{srv.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {srv.transport}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${srv.enabled ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-muted text-muted-foreground"}`}>
                  {srv.enabled ? "enabled" : "disabled"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                {srv.transport === "stdio" ? srv.command || "–" : srv.url || "–"}
              </p>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handleTest(srv.id)}
                disabled={testingId === srv.id}
                title="Test connection"
                className="p-1.5 rounded hover:bg-muted disabled:opacity-50"
              >
                {testingId === srv.id
                  ? <span className="text-xs">...</span>
                  : testServer.data?.ok === true && testingId === null
                    ? <Check className="w-4 h-4 text-green-500" />
                    : <TestTube className="w-4 h-4" />}
              </button>

              <button
                onClick={() => toggleServer.mutate({ id: srv.id, enabled: !srv.enabled })}
                title={srv.enabled ? "Disable" : "Enable"}
                className="p-1.5 rounded hover:bg-muted"
              >
                {srv.enabled ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
              </button>

              <button
                onClick={() => deleteServer.mutate({ id: srv.id })}
                title="Delete"
                className="p-1.5 rounded hover:bg-muted text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Plus, Trash2, ShieldCheck, Key, ClipboardList, ChevronDown, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function TrustSettings() {
  const [showAdd, setShowAdd] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [name, setName] = useState("");
  const [tool, setTool] = useState("");
  const [value, setValue] = useState("");
  const [agentId, setAgentId] = useState("");
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const credentials = trpc.trust.listCredentials.useQuery();
  const auditLog = trpc.trust.auditLog.useQuery({ limit: 20 }, { enabled: showAudit });

  const createCredential = trpc.trust.createCredential.useMutation({
    onSuccess: () => {
      utils.trust.listCredentials.invalidate();
      setShowAdd(false);
      resetForm();
      setError("");
    },
    onError: (err) => setError(err.message),
  });

  const deleteCredential = trpc.trust.deleteCredential.useMutation({
    onSuccess: () => {
      utils.trust.listCredentials.invalidate();
      setDeleteConfirm(null);
    },
    onError: (err) => setError(err.message),
  });

  function resetForm() {
    setName("");
    setTool("");
    setValue("");
    setAgentId("");
    setError("");
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const handleCreate = () => {
    setError("");
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!tool.trim()) {
      setError("Tool name is required.");
      return;
    }
    if (!value.trim()) {
      setError("Secret value is required.");
      return;
    }
    if (agentId.trim() && !UUID_RE.test(agentId.trim())) {
      setError("Agent ID must be a valid UUID or left blank.");
      return;
    }
    createCredential.mutate({
      name: name.trim(),
      tool: tool.trim(),
      value: value.trim(),
      agentId: agentId.trim() || undefined,
    });
  };

  const outcomeColor = (outcome: string) =>
    outcome === "success" ? "text-green-600" : outcome === "denied" ? "text-yellow-600" : "text-red-500";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Credential Vault</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Store encrypted secrets for agent tools. Values are AES-256-GCM encrypted at rest and never returned to the
        client.
      </p>

      {/* Credential list */}
      {credentials.data && credentials.data.length > 0 ? (
        <ul className="space-y-2">
          {credentials.data.map((cred) => (
            <li key={cred.id} className="agenthub-list-row flex items-center justify-between p-3 text-sm">
              <div className="flex items-center gap-3 min-w-0">
                <Key className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{cred.name}</p>
                  <p className="text-xs text-muted-foreground">
                    tool: <span className="font-mono">{cred.tool}</span>
                    {cred.agentId && (
                      <>
                        {" "}
                        · agent: <span className="font-mono text-xs">{cred.agentId.slice(0, 8)}…</span>
                      </>
                    )}{" "}
                    · hint: <span className="font-mono">{cred.keyHint}</span> ·{" "}
                    {new Date(cred.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="ml-4 shrink-0">
                {deleteConfirm === cred.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Delete?</span>
                    <button
                      onClick={() => deleteCredential.mutate({ id: cred.id })}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(cred.id)}
                    className="text-muted-foreground hover:text-red-500 transition-colors"
                    title="Delete credential"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground italic">No credentials stored.</p>
      )}

      {/* Add form */}
      {showAdd ? (
        <div className="agenthub-glass-panel space-y-3 rounded-2xl p-4">
          <h3 className="text-sm font-semibold">Add Credential</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. OpenWeather API Key"
                className="agenthub-field w-full px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tool</label>
              <input
                type="text"
                value={tool}
                onChange={(e) => setTool(e.target.value)}
                placeholder="e.g. web_search"
                className="agenthub-field w-full px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Secret Value</label>
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste secret here — stored encrypted, never shown again"
              className="agenthub-field w-full px-2 py-1.5 text-sm"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Agent ID{" "}
              <span className="text-muted-foreground font-normal">(optional UUID — leave blank for user-scoped)</span>
            </label>
            <input
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="agenthub-field w-full px-2 py-1.5 font-mono text-sm"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={createCredential.isPending}
              className="agenthub-primary-button rounded-xl px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {createCredential.isPending ? "Saving…" : "Save Credential"}
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                resetForm();
              }}
              className="agenthub-secondary-button px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/5 px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/70 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add Credential
        </button>
      )}

      {/* Audit log */}
      <div className="mt-4">
        <button
          onClick={() => setShowAudit((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {showAudit ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <ClipboardList className="h-4 w-4" />
          Audit Log
        </button>

        {showAudit && (
          <div className="mt-3">
            {auditLog.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : auditLog.data && auditLog.data.length > 0 ? (
              <ul className="space-y-1 text-xs font-mono">
                {auditLog.data.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 text-muted-foreground">
                    <span className={outcomeColor(entry.outcome)}>{entry.outcome.toUpperCase()}</span>
                    <span>{entry.tool}</span>
                    <span className="text-muted-foreground/60">{entry.keyHint}</span>
                    <span className="text-muted-foreground/60">{new Date(entry.createdAt).toLocaleString()}</span>
                    {entry.detail && <span className="truncate max-w-xs">{entry.detail}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground italic">No audit entries.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

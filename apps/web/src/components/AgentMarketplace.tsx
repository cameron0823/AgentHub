"use client";

import { useMemo, useState } from "react";
import { Download, Search, Store, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useChatStore } from "@/stores/chatStore";

function formatTools(tools: string[]) {
  return tools.length > 0 ? tools.join(", ") : "No tools";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Marketplace action failed.";
}

export function AgentMarketplace() {
  const [search, setSearch] = useState("");
  const [manifestText, setManifestText] = useState("");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [exportAgentId, setExportAgentId] = useState("");
  const [exportText, setExportText] = useState("");
  const agents = useChatStore((state) => state.agents);
  const utils = trpc.useUtils();
  const catalog = trpc.marketplace.catalog.useQuery();
  const validateManifest = trpc.marketplace.validateManifest.useMutation();
  const installManifest = trpc.marketplace.installManifest.useMutation({
    onSuccess: (result) => {
      setImportMessage(`Installed ${result.installedAgents.length} agent(s) from ${result.summary.name}.`);
      utils.agents.list.invalidate();
    },
  });
  const installCatalogItem = trpc.marketplace.installCatalogItem.useMutation({
    onSuccess: (result) => {
      setImportMessage(`Installed ${result.installedAgents.length} agent(s) from ${result.summary.name}.`);
      utils.agents.list.invalidate();
    },
  });
  const exportAgent = trpc.marketplace.exportAgent.useMutation({
    onSuccess: (result) => {
      setExportText(JSON.stringify(result.manifest, null, 2));
    },
  });

  const filteredCatalog = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return catalog.data || [];
    return (catalog.data || []).filter((item) => {
      const haystack = [
        item.summary.name,
        item.summary.description || "",
        ...item.summary.tags,
        ...item.summary.agents.flatMap((agent) => [agent.name, agent.description || "", agent.model, ...agent.tools]),
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [catalog.data, search]);

  const parseManifestText = () => {
    try {
      return JSON.parse(manifestText);
    } catch {
      throw new Error("Paste valid JSON before validating or installing.");
    }
  };

  const handleValidate = () => {
    setImportMessage(null);
    try {
      validateManifest.mutate(parseManifestText(), {
        onSuccess: (result) => {
          setImportMessage(`Valid manifest: ${result.summary.name} (${result.summary.agentCount} agent(s)).`);
        },
      });
    } catch (error) {
      setImportMessage(getErrorMessage(error));
    }
  };

  const handleInstallManifest = () => {
    setImportMessage(null);
    try {
      installManifest.mutate(parseManifestText());
    } catch (error) {
      setImportMessage(getErrorMessage(error));
    }
  };

  const handleExport = () => {
    if (!exportAgentId) {
      setExportText("Select a local agent to export.");
      return;
    }
    exportAgent.mutate({ agentId: exportAgentId });
  };

  const validationSummary = validateManifest.data?.summary;
  const actionError = validateManifest.error || installManifest.error || installCatalogItem.error || exportAgent.error;

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Agent Marketplace</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse bundled local agent packs, import pasted manifests, and export existing agents without remote marketplace fetches.
              </p>
            </div>
          </div>
        </div>

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Local Catalog</h3>
              <p className="text-sm text-muted-foreground">Bundled manifests are installed as fresh local agents.</p>
            </div>
            <label className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tags, tools, models..."
                className="w-full bg-transparent outline-none sm:w-64"
              />
            </label>
          </div>

          {catalog.isLoading ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Loading marketplace catalog...</div>
          ) : catalog.isError ? (
            <div className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">Could not load marketplace catalog.</div>
          ) : filteredCatalog.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No catalog items match your search.</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredCatalog.map((item) => (
                <div key={item.summary.slug} className="rounded-xl border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">{item.summary.name}</h4>
                      <p className="mt-1 text-sm text-muted-foreground">{item.summary.description}</p>
                    </div>
                    <button
                      onClick={() => installCatalogItem.mutate({ slug: item.summary.slug })}
                      disabled={installCatalogItem.isPending}
                      className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      Install
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.summary.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">#{tag}</span>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2">
                    {item.summary.agents.map((agent) => (
                      <div key={agent.localKey} className="rounded-lg border p-3 text-sm">
                        <div className="font-medium">{agent.name}</div>
                        <div className="mt-1 text-muted-foreground">{agent.description}</div>
                        <div className="mt-2 text-xs text-muted-foreground">Model: {agent.model}</div>
                        <div className="text-xs text-muted-foreground">Tools: {formatTools(agent.tools)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Paste Import Manifest</h3>
            </div>
            <textarea
              value={manifestText}
              onChange={(event) => setManifestText(event.target.value)}
              placeholder={'{\n  "schemaVersion": "agenthub.marketplace.v1",\n  "metadata": { "slug": "my-pack", "name": "My Pack" },\n  "agents": []\n}'}
              className="h-64 w-full rounded-lg border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={handleValidate}
                disabled={validateManifest.isPending}
                className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
              >
                Validate Manifest
              </button>
              <button
                onClick={handleInstallManifest}
                disabled={installManifest.isPending}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                Install Manifest
              </button>
            </div>
            {validationSummary ? (
              <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
                Validated {validationSummary.name}: {validationSummary.agentCount} agent(s), tags {validationSummary.tags.join(", ") || "none"}.
              </div>
            ) : null}
            {importMessage ? <div className="mt-3 text-sm text-muted-foreground">{importMessage}</div> : null}
            {actionError ? <div className="mt-3 text-sm text-destructive">{actionError.message}</div> : null}
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Export Local Agent</h3>
            </div>
            <select
              value={exportAgentId}
              onChange={(event) => setExportAgentId(event.target.value)}
              className="mb-3 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select an agent...</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
            <button
              onClick={handleExport}
              disabled={exportAgent.isPending}
              className="mb-3 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
            >
              Generate Export JSON
            </button>
            <textarea
              value={exportText}
              onChange={(event) => setExportText(event.target.value)}
              placeholder="Exported manifest JSON appears here for manual copy."
              className="h-72 w-full rounded-lg border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Exports include agent settings only. Sessions, messages, memories, database IDs, local paths, credentials, and provider runtime secrets are excluded.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

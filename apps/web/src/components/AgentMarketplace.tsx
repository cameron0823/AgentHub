"use client";

import { useMemo, useState } from "react";
import { Download, Eye, Plug, Search, Share2, Store, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { SkillsMarketplace } from "./SkillsMarketplace";

type MarketplaceTab = "local" | "remote" | "community" | "skills" | "openapi" | "installed" | "updates";

const MARKETPLACE_TABS: MarketplaceTab[] = [
  "local",
  "remote",
  "community",
  "skills",
  "openapi",
  "installed",
  "updates",
];

function marketplaceTabLabel(tab: MarketplaceTab) {
  if (tab === "local") return "Local";
  if (tab === "remote") return "Remote";
  if (tab === "community") return "Community";
  if (tab === "skills") return "Skills";
  if (tab === "openapi") return "OpenAPI";
  if (tab === "installed") return "Installed";
  return "Updates";
}

function formatTools(tools: string[]) {
  return tools.length > 0 ? tools.join(", ") : "No tools";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Marketplace action failed.";
}

export function AgentMarketplace() {
  const [activeTab, setActiveTab] = useState<MarketplaceTab>("local");
  const [search, setSearch] = useState("");
  const [manifestText, setManifestText] = useState("");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [exportAgentId, setExportAgentId] = useState("");
  const [exportText, setExportText] = useState("");
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [publishAgentId, setPublishAgentId] = useState("");
  const [communityDraft, setCommunityDraft] = useState("");
  const [communityMessage, setCommunityMessage] = useState<string | null>(null);
  const [openApiUrl, setOpenApiUrl] = useState("");
  const [openApiText, setOpenApiText] = useState("");
  const [openApiMessage, setOpenApiMessage] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const catalog = trpc.marketplace.catalog.useQuery();
  const remoteCatalog = trpc.marketplace.remoteCatalog.useQuery();
  const agentList = trpc.agents.list.useQuery();
  const openApiPlugins = trpc.marketplace.listOpenApiPlugins.useQuery();
  const validateManifest = trpc.marketplace.validateManifest.useMutation();
  const validateOpenApiPlugin = trpc.marketplace.validateOpenApiPlugin.useMutation();
  const loadOpenApiPlugin = trpc.marketplace.loadOpenApiPlugin.useMutation();
  const installOpenApiPlugin = trpc.marketplace.installOpenApiPlugin.useMutation({
    onSuccess: (result) => {
      setOpenApiMessage(`Installed ${result.toolCount} OpenAPI tool(s) from ${result.plugin.title}.`);
      utils.marketplace.listOpenApiPlugins.invalidate();
    },
  });
  const installOpenApiPluginFromUrl = trpc.marketplace.installOpenApiPluginFromUrl.useMutation({
    onSuccess: (result) => {
      setOpenApiMessage(`Installed ${result.toolCount} OpenAPI tool(s) from ${result.plugin.title}.`);
      utils.marketplace.listOpenApiPlugins.invalidate();
    },
  });
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
  const installRemoteItem = trpc.marketplace.installRemoteItem.useMutation({
    onSuccess: (result) => {
      setImportMessage(`Installed ${result.installedAgents.length} agent(s) from ${result.summary.name}.`);
      utils.agents.list.invalidate();
    },
  });
  const forkRemoteItem = trpc.marketplace.forkRemoteItem.useMutation({
    onSuccess: (result) => {
      setImportMessage(`Forked ${result.installedAgents.length} agent(s) from ${result.summary.name}.`);
      utils.agents.list.invalidate();
    },
  });
  const exportAgent = trpc.marketplace.exportAgent.useMutation({
    onSuccess: (result) => {
      setExportText(JSON.stringify(result.manifest, null, 2));
    },
  });
  const publishAgent = trpc.marketplace.publishAgent.useMutation({
    onSuccess: (result) => {
      setCommunityDraft(JSON.stringify({ indexItem: result.indexItem, manifest: result.manifest }, null, 2));
      setCommunityMessage(`${result.status}: ${result.message || "Community marketplace publish response received."}`);
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
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [catalog.data, search]);

  const filteredRemoteCatalog = useMemo(() => {
    const query = search.trim().toLowerCase();
    const items = remoteCatalog.data?.items || [];
    if (!query) return items;
    return items.filter((item) => {
      const haystack = [
        item.summary.name,
        item.summary.description || "",
        item.summary.author || "",
        item.summary.license || "",
        item.summary.version || "",
        ...item.summary.tags,
        ...item.summary.agents.flatMap((agent) => [agent.name, agent.description || "", agent.model, ...agent.tools]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [remoteCatalog.data?.items, search]);

  const previewItem = useMemo(() => {
    const items = remoteCatalog.data?.items || [];
    return items.find((item) => item.summary.slug === previewSlug) || null;
  }, [previewSlug, remoteCatalog.data?.items]);

  const parseManifestText = () => {
    try {
      return JSON.parse(manifestText);
    } catch {
      throw new Error("Paste valid JSON before validating or installing.");
    }
  };

  const parseOpenApiText = () => {
    try {
      return JSON.parse(openApiText);
    } catch {
      throw new Error("Paste valid OpenAPI JSON before validating or installing.");
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

  const handleValidateOpenApi = () => {
    setOpenApiMessage(null);
    try {
      validateOpenApiPlugin.mutate(parseOpenApiText(), {
        onSuccess: (result) => {
          setOpenApiMessage(`Valid OpenAPI plugin: ${result.manifest.title} (${result.toolCount} tool(s)).`);
        },
      });
    } catch (error) {
      setOpenApiMessage(getErrorMessage(error));
    }
  };

  const handleInstallOpenApi = () => {
    setOpenApiMessage(null);
    try {
      installOpenApiPlugin.mutate(parseOpenApiText());
    } catch (error) {
      setOpenApiMessage(getErrorMessage(error));
    }
  };

  const handleLoadOpenApiUrl = () => {
    setOpenApiMessage(null);
    loadOpenApiPlugin.mutate(
      { url: openApiUrl },
      {
        onSuccess: (result) => {
          setOpenApiText(JSON.stringify(result.manifest, null, 2));
          setOpenApiMessage(`Loaded ${result.toolCount} OpenAPI tool(s) from remote document.`);
        },
      },
    );
  };

  const handleExport = () => {
    if (!exportAgentId) {
      setExportText("Select a local agent to export.");
      return;
    }
    exportAgent.mutate({ agentId: exportAgentId });
  };

  const handleRemoteExport = (item: NonNullable<typeof remoteCatalog.data>["items"][number]) => {
    setExportText(JSON.stringify(item.manifest, null, 2));
    setImportMessage(`Exported ${item.summary.name} manifest.`);
  };

  const handleCommunityPublish = (submit: boolean) => {
    if (!publishAgentId) {
      setCommunityMessage("Select a local agent to publish.");
      return;
    }
    setCommunityMessage(null);
    publishAgent.mutate({ agentId: publishAgentId, submit });
  };

  const validationSummary = validateManifest.data?.summary;
  const actionError =
    validateManifest.error ||
    installManifest.error ||
    installCatalogItem.error ||
    installRemoteItem.error ||
    forkRemoteItem.error ||
    validateOpenApiPlugin.error ||
    loadOpenApiPlugin.error ||
    installOpenApiPlugin.error ||
    installOpenApiPluginFromUrl.error ||
    publishAgent.error ||
    exportAgent.error;
  const agents = agentList.data || [];
  const remoteWarnings = remoteCatalog.data?.warnings || [];
  const availableUpdates = filteredRemoteCatalog.filter((item) =>
    agents.some((agent) => agent.name === item.summary.name),
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <div className="agenthub-glass-panel rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-primary/15 p-3 text-primary">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-4xl font-semibold tracking-tight">Agent Marketplace</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse bundled and remote agent packs, import pasted manifests, and export existing agents.
              </p>
            </div>
          </div>
        </div>

        <div className="agenthub-glass-panel flex flex-wrap gap-2 rounded-2xl p-2">
          {MARKETPLACE_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-3 py-2 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10"
              }`}
            >
              {marketplaceTabLabel(tab)}
            </button>
          ))}
        </div>

        {activeTab === "local" && (
          <section className="agenthub-glass-panel rounded-2xl p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Local Catalog</h3>
                <p className="text-sm text-muted-foreground">Bundled manifests are installed as fresh local agents.</p>
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm">
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
              <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-muted-foreground">
                Loading marketplace catalog...
              </div>
            ) : catalog.isError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                Could not load marketplace catalog.
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-muted-foreground">
                No catalog items match your search.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2" data-testid="catalog-grid">
                {filteredCatalog.map((item) => (
                  <div key={item.summary.slug} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold">{item.summary.name}</h4>
                        <p className="mt-1 text-sm text-muted-foreground">{item.summary.description}</p>
                      </div>
                      <button
                        onClick={() => installCatalogItem.mutate({ slug: item.summary.slug })}
                        disabled={installCatalogItem.isPending}
                        className="agenthub-primary-button rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-60"
                      >
                        Install
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.summary.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-white/10 px-2 py-1 text-xs text-slate-300">
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 space-y-2">
                      {item.summary.agents.map((agent) => (
                        <div key={agent.localKey} className="rounded-xl border border-white/10 bg-black/10 p-3 text-sm">
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
        )}

        {activeTab === "remote" && (
          <section className="agenthub-glass-panel rounded-2xl p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Remote Catalog</h3>
                <p className="text-sm text-muted-foreground">
                  Remote index uses bundled local catalog as an offline fallback.
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search remote items..."
                  className="w-full bg-transparent outline-none sm:w-64"
                />
              </label>
            </div>
            {remoteWarnings.length > 0 ? (
              <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-950/20 p-3 text-sm text-amber-200">
                {remoteWarnings.map((warning) => (
                  <div key={warning}>{warning}</div>
                ))}
              </div>
            ) : null}
            {remoteCatalog.isLoading ? (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-muted-foreground">
                Loading remote marketplace catalog...
              </div>
            ) : filteredRemoteCatalog.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-muted-foreground">
                No remote marketplace item is available; offline fallback is active.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2" data-testid="remote-catalog-grid">
                {filteredRemoteCatalog.map((item) => (
                  <div key={item.summary.slug} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold">{item.summary.name}</h4>
                        <p className="mt-1 text-sm text-muted-foreground">{item.summary.description}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {[item.summary.author, item.summary.version, item.summary.license]
                            .filter(Boolean)
                            .join(" / ") || "Remote item"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        <button
                          onClick={() => setPreviewSlug(previewSlug === item.summary.slug ? null : item.summary.slug)}
                          className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15"
                        >
                          Preview
                        </button>
                        <button
                          onClick={() => handleRemoteExport(item)}
                          className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15"
                        >
                          Export
                        </button>
                        <button
                          onClick={() => installRemoteItem.mutate({ slug: item.summary.slug })}
                          disabled={installRemoteItem.isPending || forkRemoteItem.isPending}
                          className="agenthub-primary-button rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-60"
                        >
                          Install
                        </button>
                        <button
                          onClick={() => forkRemoteItem.mutate({ slug: item.summary.slug })}
                          disabled={installRemoteItem.isPending || forkRemoteItem.isPending}
                          className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-60"
                        >
                          Fork
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.summary.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-white/10 px-2 py-1 text-xs text-slate-300">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {previewItem ? (
              <div
                className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4"
                data-testid="remote-agent-preview"
              >
                <div className="mb-3 flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold">{previewItem.summary.name}</h4>
                </div>
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Metadata</div>
                    <dl className="mt-2 space-y-1">
                      <div>Author: {previewItem.summary.author || "Unknown"}</div>
                      <div>Version: {previewItem.summary.version || "Unknown"}</div>
                      <div>License: {previewItem.summary.license || "Unspecified"}</div>
                      <div>Agents: {previewItem.summary.agentCount}</div>
                    </dl>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Included Agents</div>
                    <div className="mt-2 space-y-2">
                      {previewItem.summary.agents.map((agent) => (
                        <div key={agent.localKey} className="rounded-xl border border-white/10 bg-white/5 p-2">
                          <div className="font-medium">{agent.name}</div>
                          <div className="text-xs text-muted-foreground">Model: {agent.model}</div>
                          <div className="text-xs text-muted-foreground">Tools: {formatTools(agent.tools)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <pre className="mt-3 max-h-64 overflow-auto rounded-xl border border-white/10 bg-slate-950/70 p-3 text-xs">
                  {JSON.stringify(previewItem.manifest, null, 2)}
                </pre>
              </div>
            ) : null}
          </section>
        )}

        {activeTab === "community" && (
          <section className="agenthub-glass-panel rounded-2xl p-5" data-testid="community-marketplace-publish">
            <div className="mb-3 flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Community Publish</h3>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
              <div>
                <select
                  value={publishAgentId}
                  onChange={(event) => setPublishAgentId(event.target.value)}
                  className="mb-3 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select an agent...</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleCommunityPublish(false)}
                    disabled={publishAgent.isPending}
                    className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-60"
                  >
                    Generate Draft
                  </button>
                  <button
                    onClick={() => handleCommunityPublish(true)}
                    disabled={publishAgent.isPending}
                    className="agenthub-primary-button rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-60"
                  >
                    Submit to Community
                  </button>
                </div>
                {communityMessage ? (
                  <div role="status" className="mt-3 text-sm text-muted-foreground">
                    {communityMessage}
                  </div>
                ) : null}
              </div>
              <textarea
                value={communityDraft}
                onChange={(event) => setCommunityDraft(event.target.value)}
                placeholder="Community publish package appears here."
                className="h-72 w-full rounded-xl border p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </section>
        )}

        {activeTab === "skills" && <SkillsMarketplace />}

        {activeTab === "openapi" && (
          <section className="agenthub-glass-panel rounded-2xl p-5" data-testid="openapi-plugin-installer">
            <div className="mb-3 flex items-center gap-2">
              <Plug className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">OpenAPI Plugins</h3>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
              <div className="space-y-3">
                <label className="block space-y-1 text-sm">
                  <span>OpenAPI document URL</span>
                  <input
                    value={openApiUrl}
                    onChange={(event) => setOpenApiUrl(event.target.value)}
                    placeholder="https://api.example.com/openapi.json"
                    className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleLoadOpenApiUrl}
                    disabled={loadOpenApiPlugin.isPending || !openApiUrl.trim()}
                    className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-60"
                  >
                    Load URL
                  </button>
                  <button
                    onClick={() => {
                      setOpenApiMessage(null);
                      installOpenApiPluginFromUrl.mutate({ url: openApiUrl });
                    }}
                    disabled={installOpenApiPluginFromUrl.isPending || !openApiUrl.trim()}
                    className="agenthub-primary-button rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-60"
                  >
                    Install URL
                  </button>
                </div>
                {openApiPlugins.data && openApiPlugins.data.length > 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                    <h4 className="mb-2 font-medium">Installed OpenAPI Tools</h4>
                    <div className="space-y-2">
                      {openApiPlugins.data.map((plugin) => (
                        <div key={plugin.id}>
                          <div className="font-medium">{plugin.title}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {plugin.enabledToolIds.map((toolId) => (
                              <span key={toolId} className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs">
                                {toolId}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div>
                <textarea
                  value={openApiText}
                  onChange={(event) => setOpenApiText(event.target.value)}
                  placeholder={
                    '{\n  "openapi": "3.1.0",\n  "info": { "title": "Example", "version": "1.0.0" },\n  "servers": [{ "url": "https://api.example.com" }],\n  "paths": {}\n}'
                  }
                  className="h-80 w-full rounded-xl border p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={handleValidateOpenApi}
                    disabled={validateOpenApiPlugin.isPending}
                    className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-60"
                  >
                    Validate OpenAPI
                  </button>
                  <button
                    onClick={handleInstallOpenApi}
                    disabled={installOpenApiPlugin.isPending}
                    className="agenthub-primary-button rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-60"
                  >
                    Install OpenAPI
                  </button>
                </div>
                {openApiMessage ? (
                  <div role="status" className="mt-3 text-sm text-muted-foreground">
                    {openApiMessage}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        )}

        {activeTab === "installed" && (
          <section className="agenthub-glass-panel rounded-2xl p-5">
            <h3 className="mb-4 text-lg font-semibold">Installed</h3>
            {agents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-muted-foreground">
                No installed agents yet.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {agents.map((agent) => (
                  <div key={agent.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                    <div className="font-medium">{agent.name}</div>
                    <div className="mt-1 text-muted-foreground">{agent.description}</div>
                    <div className="mt-2 text-xs text-muted-foreground">Model: {agent.model}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "updates" && (
          <section className="agenthub-glass-panel rounded-2xl p-5">
            <h3 className="mb-4 text-lg font-semibold">Updates</h3>
            {availableUpdates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-muted-foreground">
                No remote updates are available.
              </div>
            ) : (
              <div className="space-y-3">
                {availableUpdates.map((item) => (
                  <div key={item.summary.slug} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                    <div className="font-medium">{item.summary.name}</div>
                    <div className="text-muted-foreground">Remote version {item.summary.version || "unknown"}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="agenthub-glass-panel rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Paste Import Manifest</h3>
            </div>
            <textarea
              value={manifestText}
              onChange={(event) => setManifestText(event.target.value)}
              placeholder={
                '{\n  "schemaVersion": "agenthub.marketplace.v1",\n  "metadata": { "slug": "my-pack", "name": "My Pack" },\n  "agents": []\n}'
              }
              className="h-64 w-full rounded-xl border p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={handleValidate}
                disabled={validateManifest.isPending}
                className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-60"
              >
                Validate Manifest
              </button>
              <button
                onClick={handleInstallManifest}
                disabled={installManifest.isPending}
                className="agenthub-primary-button rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-60"
              >
                Install Manifest
              </button>
            </div>
            {validationSummary ? (
              <div className="mt-3 rounded-xl bg-white/10 p-3 text-sm">
                Validated {validationSummary.name}: {validationSummary.agentCount} agent(s), tags{" "}
                {validationSummary.tags.join(", ") || "none"}.
              </div>
            ) : null}
            {importMessage ? (
              <div role="status" className="mt-3 text-sm text-muted-foreground">
                {importMessage}
              </div>
            ) : null}
            {actionError ? (
              <div role="alert" className="mt-3 text-sm text-destructive">
                {actionError.message}
              </div>
            ) : null}
          </div>

          <div className="agenthub-glass-panel rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Export Local Agent</h3>
            </div>
            <select
              value={exportAgentId}
              onChange={(event) => setExportAgentId(event.target.value)}
              className="mb-3 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select an agent...</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleExport}
              disabled={exportAgent.isPending}
              className="mb-3 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-60"
            >
              Generate Export JSON
            </button>
            <textarea
              value={exportText}
              onChange={(event) => setExportText(event.target.value)}
              placeholder="Exported manifest JSON appears here for manual copy."
              className="h-72 w-full rounded-xl border p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Exports include agent settings only. Sessions, messages, memories, database IDs, local paths, credentials,
              and provider runtime secrets are excluded.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

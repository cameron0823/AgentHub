"use client";

import { useState } from "react";
import { Check, DownloadCloud, Search, ShieldCheck, Wrench } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { hasDesktopRuntime } from "@/lib/desktop-runtime";

export function McpMarketplace() {
  const [search, setSearch] = useState("");
  const [variablesText, setVariablesText] = useState("{}");
  const [manualInstructions, setManualInstructions] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const desktopAvailable = hasDesktopRuntime();
  const utils = trpc.useUtils();
  const catalog = trpc.mcpServers.marketplaceCatalog.useQuery({ query: search.trim() || undefined });
  const preflight = trpc.mcpServers.marketplacePreflight.useMutation();
  const install = trpc.mcpServers.installMarketplaceItem.useMutation({
    onSuccess: (result) => {
      utils.mcpServers.list.invalidate();
      setManualInstructions(result.manualInstructions ?? []);
      setStatusMessage(result.installed ? "Installed" : "Manual install required");
    },
  });

  function parseVariables() {
    const parsed = JSON.parse(variablesText || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  }

  async function handlePreflight(slug: string) {
    setStatusMessage("");
    setManualInstructions([]);
    const result = await preflight.mutateAsync({
      slug,
      variables: parseVariables(),
      desktopAvailable,
    });
    setManualInstructions(result.preflight.manualInstructions);
    setStatusMessage(result.preflight.status);
  }

  async function handleInstall(slug: string) {
    setStatusMessage("");
    setManualInstructions([]);
    try {
      await install.mutateAsync({
        slug,
        variables: parseVariables(),
        desktopAvailable,
      });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Install failed");
    }
  }

  return (
    <section className="agenthub-glass-panel space-y-4 rounded-2xl p-4" data-testid="mcp-marketplace">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <DownloadCloud className="h-4 w-4" />
          MCP Marketplace
        </h3>
        <label className="relative min-w-64 text-sm">
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <input
            className="agenthub-field w-full py-1.5 pl-8 pr-3"
            placeholder="Search MCP servers"
            aria-label="Search MCP servers"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      <textarea
        className="agenthub-field min-h-16 w-full px-3 py-2 font-mono text-xs"
        aria-label="Template variables JSON"
        value={variablesText}
        onChange={(event) => setVariablesText(event.target.value)}
      />

      {catalog.data?.warnings.map((warning) => (
        <p
          key={warning}
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
        >
          {warning}
        </p>
      ))}

      <div className="grid gap-3 md:grid-cols-2">
        {(catalog.data?.items ?? []).map((item) => (
          <article key={item.slug} className="agenthub-list-row space-y-3 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-medium">{item.name}</h4>
                <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
              </div>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">
                {item.transport}
              </span>
            </div>

            <div className="grid gap-3 text-xs md:grid-cols-2">
              <div>
                <h5 className="mb-1 flex items-center gap-1 font-medium">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Permissions
                </h5>
                <div className="flex flex-wrap gap-1">
                  {item.permissions.map((permission) => (
                    <span key={permission} className="rounded bg-white/10 px-2 py-0.5 text-muted-foreground">
                      {permission}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h5 className="mb-1 flex items-center gap-1 font-medium">
                  <Wrench className="h-3.5 w-3.5" />
                  Dependencies
                </h5>
                <div className="flex flex-wrap gap-1">
                  {item.dependencies.desktop && (
                    <span className="rounded bg-white/10 px-2 py-0.5 text-muted-foreground">desktop-runtime</span>
                  )}
                  {item.dependencies.commands.map((dependency) => (
                    <span key={dependency} className="rounded bg-white/10 px-2 py-0.5 text-muted-foreground">
                      {dependency}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {item.requiredVariables.length > 0 && (
              <p className="text-xs text-muted-foreground">Required variables: {item.requiredVariables.join(", ")}</p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handlePreflight(item.slug)}
                className="agenthub-secondary-button px-3 py-1.5 text-xs"
              >
                Check
              </button>
              <button
                onClick={() => handleInstall(item.slug)}
                disabled={install.isPending}
                className="agenthub-primary-button flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Install
              </button>
            </div>
          </article>
        ))}
      </div>

      {(manualInstructions.length > 0 || statusMessage) && (
        <details open className="rounded-xl border border-white/10 bg-black/20 p-3">
          <summary className="cursor-pointer text-sm font-medium">Manual install</summary>
          {statusMessage && <p className="mt-2 text-xs text-muted-foreground">{statusMessage}</p>}
          {manualInstructions.map((instruction) => (
            <code key={instruction} className="mt-2 block whitespace-pre-wrap rounded bg-black/30 px-2 py-1 text-xs">
              {instruction}
            </code>
          ))}
        </details>
      )}
    </section>
  );
}

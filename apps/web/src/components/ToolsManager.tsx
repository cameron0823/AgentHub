"use client";

import { useMemo, useState } from "react";
import { Boxes, CheckCircle2, Plug, Search, ShieldCheck, Wrench } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { hasDesktopRuntime } from "@/lib/desktop-runtime";

type ToolTab = "builtins" | "mcp" | "skills" | "openapi";
const PRIORITY_BUILTIN_TOOL_IDS = ["github_repo", "web_fetch", "local_system"] as const;
const TOOL_PROFILE_NAMES = ["minimal", "research", "coding", "messaging", "admin", "full"] as const;

export function ToolsManager() {
  const [tab, setTab] = useState<ToolTab>("builtins");
  const [query, setQuery] = useState("");
  const builtIns = trpc.trust.toolCatalog.useQuery();
  const mcpServers = trpc.mcpServers.list.useQuery();
  const skills = trpc.skills.list.useQuery();
  const openApiPlugins = trpc.marketplace.listOpenApiPlugins.useQuery();
  const desktopAvailable = hasDesktopRuntime();

  const filteredBuiltIns = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (builtIns.data ?? [])
      .filter(
        (tool) =>
          !q ||
          [tool.id, tool.name, tool.category, ...tool.permissions].some((value) => value.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        const ai = PRIORITY_BUILTIN_TOOL_IDS.indexOf(a.id as (typeof PRIORITY_BUILTIN_TOOL_IDS)[number]);
        const bi = PRIORITY_BUILTIN_TOOL_IDS.indexOf(b.id as (typeof PRIORITY_BUILTIN_TOOL_IDS)[number]);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
  }, [builtIns.data, query]);

  const filteredMcpServers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (mcpServers.data ?? []).filter((server) => {
      return (
        !q ||
        [server.name, server.transport, server.url ?? "", server.command ?? ""].some((value) =>
          value.toLowerCase().includes(q),
        )
      );
    });
  }, [mcpServers.data, query]);

  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (skills.data ?? []).filter((skill) => {
      return (
        !q ||
        [skill.name, skill.slug, skill.description ?? "", skill.enabledToolId].some((value) =>
          value.toLowerCase().includes(q),
        )
      );
    });
  }, [skills.data, query]);

  const filteredOpenApiTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (openApiPlugins.data ?? []).flatMap((plugin) =>
      plugin.tools
        .map((tool, index) => ({
          id: plugin.enabledToolIds[index] ?? tool.name,
          pluginTitle: plugin.title,
          ...tool,
        }))
        .filter(
          (tool) =>
            !q ||
            [tool.id, tool.pluginTitle, tool.name, tool.description, tool.method, tool.path].some((value) =>
              value.toLowerCase().includes(q),
            ),
        ),
    );
  }, [openApiPlugins.data, query]);

  return (
    <section className="space-y-4" data-testid="tools-manager">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Wrench className="h-5 w-5" />
          Tools Manager
        </h2>
        <label className="relative min-w-64 text-sm">
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <input
            className="agenthub-field w-full py-1.5 pl-8 pr-3"
            placeholder="Search tools"
            aria-label="Search tools"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tool sources">
        {[
          ["builtins", "Built-ins"],
          ["mcp", "MCP Servers"],
          ["skills", "Skills"],
          ["openapi", "OpenAPI"],
        ].map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value as ToolTab)}
            className={`rounded-xl px-3 py-1.5 text-sm ${tab === value ? "agenthub-primary-button" : "agenthub-secondary-button"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "builtins" && (
        <div className="grid gap-3 md:grid-cols-2">
          {filteredBuiltIns.map((tool) => (
            <article key={tool.id} className="agenthub-list-row space-y-3 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">{tool.id}</h3>
                  <p className="text-xs text-muted-foreground">{tool.name}</p>
                </div>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">
                  {tool.desktopOnly ? "Desktop only" : "Web safe"}
                </span>
              </div>
              <div>
                <h4 className="mb-1 flex items-center gap-1 text-xs font-medium">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Permissions
                </h4>
                <div className="flex flex-wrap gap-1">
                  {tool.permissions.map((permission) => (
                    <span key={permission} className="rounded bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">
                      {permission}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {tool.credentialRequired ? "Credential required" : "No credential required"}
                {tool.sensitive ? " · HITL approval" : ""}
                {tool.desktopOnly && !desktopAvailable ? " · Unavailable in web mode" : ""}
              </p>
            </article>
          ))}
        </div>
      )}

      {tab === "mcp" && (
        <div className="space-y-2">
          {filteredMcpServers.map((server) => (
            <article key={server.id} className="agenthub-list-row flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-medium">{server.name}</h3>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {server.transport} · {server.url ?? server.command ?? "not configured"}
                </p>
              </div>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">
                {server.lastHealthStatus ?? "unknown"}
              </span>
            </article>
          ))}
          {filteredMcpServers.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/15 p-4 text-center text-sm text-muted-foreground">
              No MCP Servers match the current filter.
            </p>
          )}
        </div>
      )}

      {tab === "skills" && (
        <div className="space-y-2">
          {filteredSkills.map((skill) => (
            <article key={skill.slug} className="agenthub-list-row flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-medium">{skill.name}</h3>
                <p className="truncate text-xs text-muted-foreground">{skill.enabledToolId}</p>
              </div>
              <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Installed
              </span>
            </article>
          ))}
          {filteredSkills.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/15 p-4 text-center text-sm text-muted-foreground">
              No Skills match the current filter.
            </p>
          )}
        </div>
      )}

      {tab === "openapi" && (
        <div className="space-y-2" data-testid="openapi-tools-list">
          {filteredOpenApiTools.map((tool) => (
            <article key={tool.id} className="agenthub-list-row flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-medium">{tool.id}</h3>
                <p className="truncate text-xs text-muted-foreground">
                  {tool.pluginTitle} · {tool.method} {tool.path}
                </p>
              </div>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">OpenAPI</span>
            </article>
          ))}
          {filteredOpenApiTools.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/15 p-4 text-center text-sm text-muted-foreground">
              No OpenAPI tools match the current filter.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Boxes className="h-3.5 w-3.5" /> Built-ins are runtime-registered tools.
        </span>
        <span className="flex items-center gap-1">
          <Plug className="h-3.5 w-3.5" /> MCP and skill tools are enabled by their own settings.
        </span>
        <span className="flex items-center gap-1">
          <Plug className="h-3.5 w-3.5" /> OpenAPI tools are enabled per generated tool ID.
        </span>
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" /> Tool profiles: {TOOL_PROFILE_NAMES.join(", ")}.
        </span>
      </div>
    </section>
  );
}

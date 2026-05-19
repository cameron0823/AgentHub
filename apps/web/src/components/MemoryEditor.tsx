"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Wrench } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useChatStore, type MemoryEntry, type MemoryStatus } from "@/stores/chatStore";

const STATUS_OPTIONS: Array<MemoryStatus | ""> = ["", "accepted", "proposed", "rejected", "archived"];
const SCOPE_OPTIONS = [
  { value: "all", label: "All memories" },
  { value: "shared", label: "Shared memories" },
  { value: "agent", label: "Agent-specific memories" },
] as const;

type MemoryScope = (typeof SCOPE_OPTIONS)[number]["value"];

interface MaintenanceSuggestion {
  id: string;
  action: "edit" | "delete" | "merge" | "keep";
  reason: string;
  proposed?: {
    category?: string;
    key?: string;
    value?: string;
    confidence?: number;
    status?: MemoryStatus;
  };
  relatedIds?: string[];
  risk: "low" | "medium" | "high";
  score?: number;
}

function toMemoryEntry(entry: {
  id: string;
  agentId: string | null;
  category: string;
  key: string;
  value: string;
  confidence: number;
  sourceMessageId: string | null;
  status: MemoryStatus;
  isEdited: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}): MemoryEntry {
  return entry;
}

export function MemoryEditor() {
  const { agents, memoryEntries, setMemoryEntries, addMemoryEntry, updateMemoryEntry, deleteMemoryEntry } =
    useChatStore();
  const [draftAgentId, setDraftAgentId] = useState("");
  const [agentFilterId, setAgentFilterId] = useState("");
  const [scopeFilter, setScopeFilter] = useState<MemoryScope>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<MemoryStatus | "">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    category: "profile",
    key: "",
    value: "",
    confidence: 1,
    status: "accepted" as MemoryStatus,
  });
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const utils = trpc.useUtils();
  const listQuery = trpc.memoryEntries.list.useQuery({
    scope: scopeFilter,
    ...(agentFilterId && { agentId: agentFilterId }),
    ...(categoryFilter && { category: categoryFilter }),
    ...(statusFilter && { status: statusFilter }),
  });
  const searchResults = trpc.memoryEntries.search.useQuery(
    { query: debouncedSearch, scope: scopeFilter, ...(agentFilterId && { agentId: agentFilterId }) },
    { enabled: debouncedSearch.length > 0 },
  );
  const pendingQuery = trpc.memoryEntries.list.useQuery({ status: "proposed" });
  const createEntry = trpc.memoryEntries.create.useMutation({
    onSuccess: (entry) => {
      addMemoryEntry(toMemoryEntry(entry));
      setDraft({ category: "profile", key: "", value: "", confidence: 1, status: "accepted" });
      utils.memoryEntries.list.invalidate();
    },
  });
  const maintenanceReview = trpc.memoryEntries.maintenanceReview.useMutation();
  const applyMaintenanceSuggestion = trpc.memoryEntries.applyMaintenanceSuggestion.useMutation({
    onSuccess: () => {
      utils.memoryEntries.list.invalidate();
      maintenanceReview.mutate({
        scope: scopeFilter,
        ...(agentFilterId && { agentId: agentFilterId }),
      });
    },
  });
  const updateEntry = trpc.memoryEntries.update.useMutation({
    onSuccess: (_result, variables) => {
      updateMemoryEntry(variables.id, { ...variables, updatedAt: new Date(), isEdited: true });
      setEditingId(null);
      utils.memoryEntries.list.invalidate();
    },
  });
  const bulkSetStatus = trpc.memoryEntries.bulkSetStatus.useMutation({
    onSuccess: () => {
      utils.memoryEntries.list.invalidate();
    },
  });
  const removeEntry = trpc.memoryEntries.delete.useMutation({
    onSuccess: (_result, variables) => {
      deleteMemoryEntry(variables.id);
      utils.memoryEntries.list.invalidate();
    },
  });

  useEffect(() => {
    const data = debouncedSearch ? searchResults.data : listQuery.data;
    if (data) {
      setMemoryEntries(data.map(toMemoryEntry));
    }
  }, [listQuery.data, searchResults.data, debouncedSearch, setMemoryEntries]);

  const categories = useMemo(() => {
    return [...new Set(memoryEntries.map((entry) => entry.category))].sort();
  }, [memoryEntries]);

  const proposedMemoryIds = useMemo(() => (pendingQuery.data ?? []).map((entry) => entry.id), [pendingQuery.data]);
  const pendingCount = proposedMemoryIds.length;
  const maintenanceSuggestions = (maintenanceReview.data ?? []) as MaintenanceSuggestion[];

  const selectedEntry = memoryEntries.find((entry) => entry.id === editingId);

  useEffect(() => {
    if (selectedEntry) {
      setDraftAgentId(selectedEntry.agentId || "");
      setDraft({
        category: selectedEntry.category,
        key: selectedEntry.key,
        value: selectedEntry.value,
        confidence: selectedEntry.confidence,
        status: selectedEntry.status,
      });
    }
  }, [selectedEntry]);

  const saveDraft = () => {
    const payload = {
      agentId: draftAgentId || null,
      category: draft.category.trim(),
      key: draft.key.trim(),
      value: draft.value.trim(),
      confidence: draft.confidence,
      status: draft.status,
    };
    if (!payload.category || !payload.key || !payload.value) return;
    if (editingId) {
      updateEntry.mutate({ id: editingId, ...payload });
    } else {
      createEntry.mutate(payload);
    }
  };

  const runMaintenanceReview = () => {
    maintenanceReview.mutate({
      scope: scopeFilter,
      ...(agentFilterId && { agentId: agentFilterId }),
    });
  };

  const applySuggestion = (suggestion: MaintenanceSuggestion) => {
    applyMaintenanceSuggestion.mutate({
      id: suggestion.id,
      action: suggestion.action,
      proposed: suggestion.proposed,
      relatedIds: suggestion.relatedIds,
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-transparent">
      <div className="border-b border-white/10 p-6">
        <h2 className="text-2xl font-semibold">Memory</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manual saved memories. Accepted entries are injected transparently for memory-enabled single-agent chats.
        </p>
      </div>

      {pendingCount > 0 && (
        <div className="mx-6 mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-200">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {pendingCount} proposed memory{pendingCount > 1 ? "ies" : "y"} pending review
            </span>
            <button onClick={() => setStatusFilter("proposed")} className="text-xs underline hover:no-underline">
              View pending
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => bulkSetStatus.mutate({ ids: proposedMemoryIds, status: "accepted" })}
                disabled={bulkSetStatus.isPending || proposedMemoryIds.length === 0}
                className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-700 hover:bg-green-100 disabled:opacity-60 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300"
              >
                Accept all proposed
              </button>
              <button
                type="button"
                onClick={() => bulkSetStatus.mutate({ ids: proposedMemoryIds, status: "rejected" })}
                disabled={bulkSetStatus.isPending || proposedMemoryIds.length === 0}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-60"
              >
                Reject all proposed
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[320px_1fr]">
        <section className="agenthub-glass-panel rounded-2xl p-5">
          <h3 className="font-medium">Create or edit memory</h3>
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="text-muted-foreground">Agent</span>
              <select
                value={draftAgentId}
                onChange={(event) => setDraftAgentId(event.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2"
              >
                <option value="">Shared / unassigned</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Category</span>
              <input
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Key</span>
              <input
                value={draft.key}
                onChange={(event) => setDraft({ ...draft, key: event.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Value</span>
              <textarea
                value={draft.value}
                onChange={(event) => setDraft({ ...draft, value: event.target.value })}
                rows={5}
                className="mt-1 w-full rounded-xl border px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Confidence</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={draft.confidence}
                onChange={(event) => setDraft({ ...draft, confidence: Number(event.target.value) })}
                className="mt-1 w-full rounded-xl border px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Status</span>
              <select
                value={draft.status}
                onChange={(event) => setDraft({ ...draft, status: event.target.value as MemoryStatus })}
                className="mt-1 w-full rounded-xl border px-3 py-2"
              >
                {STATUS_OPTIONS.filter(Boolean).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button
                onClick={saveDraft}
                disabled={createEntry.isPending || updateEntry.isPending}
                className="agenthub-primary-button rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {editingId ? "Save changes" : "Create memory"}
              </button>
              {editingId ? (
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="agenthub-glass-panel flex flex-wrap gap-3 rounded-2xl p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search key or value..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-52 rounded-xl border py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <div className="flex flex-wrap rounded-xl border border-white/10 bg-white/5 p-1">
              {SCOPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setScopeFilter(option.value);
                    if (option.value === "shared") setAgentFilterId("");
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm ${scopeFilter === option.value ? "bg-white text-slate-900" : "text-muted-foreground hover:bg-white/10"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <select
              value={agentFilterId}
              onChange={(event) => {
                setAgentFilterId(event.target.value);
                if (event.target.value) setScopeFilter("agent");
              }}
              className="rounded-xl border px-3 py-2 text-sm"
              disabled={scopeFilter === "shared"}
            >
              <option value="">All agents</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
              disabled={!!debouncedSearch}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as MemoryStatus | "")}
              className="rounded-xl border px-3 py-2 text-sm"
              disabled={!!debouncedSearch}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status || "all"} value={status}>
                  {status || "All statuses"}
                </option>
              ))}
            </select>
          </div>

          <div data-testid="memory-maintenance-panel" className="agenthub-glass-panel rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">Memory maintenance</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review conflicts, stale entries, category drift, and relevance decay before applying changes.
                </p>
              </div>
              <button
                type="button"
                onClick={runMaintenanceReview}
                disabled={maintenanceReview.isPending}
                className="agenthub-primary-button inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                <Wrench className="h-4 w-4" />
                Review memories
              </button>
            </div>
            {maintenanceReview.isError ? (
              <div className="mt-3 rounded-xl border border-destructive/30 p-3 text-sm text-destructive">
                Could not review memories.
              </div>
            ) : null}
            {maintenanceReview.isSuccess && maintenanceSuggestions.length === 0 ? (
              <div className="mt-3 rounded-xl border border-white/10 p-3 text-sm text-muted-foreground">
                No maintenance suggestions for the current scope.
              </div>
            ) : null}
            {maintenanceSuggestions.length > 0 ? (
              <div className="mt-4 space-y-3">
                {maintenanceSuggestions.map((suggestion) => (
                  <div
                    key={`${suggestion.id}-${suggestion.action}-${suggestion.relatedIds?.join("-") ?? "single"}`}
                    className="rounded-xl border border-white/10 bg-white/5 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          {suggestion.action} · {suggestion.risk} risk
                          {suggestion.score !== undefined ? ` · score ${suggestion.score.toFixed(2)}` : ""}
                        </div>
                        <p className="mt-1 text-sm">{suggestion.reason}</p>
                        {suggestion.relatedIds?.length ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Related memories: {suggestion.relatedIds.length}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => applySuggestion(suggestion)}
                        disabled={applyMaintenanceSuggestion.isPending}
                        className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15 disabled:opacity-60"
                      >
                        Apply suggestion
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {(debouncedSearch ? searchResults.isLoading : listQuery.isLoading) ? (
            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Loading memories...</div>
          ) : null}
          {(debouncedSearch ? searchResults.isError : listQuery.isError) ? (
            <div className="rounded-xl border border-destructive/30 p-6 text-sm text-destructive">
              Could not load memories.
            </div>
          ) : null}
          {!(debouncedSearch ? searchResults.isLoading : listQuery.isLoading) && memoryEntries.length === 0 ? (
            <div className="agenthub-glass-panel flex min-h-[19rem] items-center justify-center rounded-2xl p-6 text-sm text-slate-200">
              {debouncedSearch ? "No memories match your search." : "No memories yet."}
            </div>
          ) : null}

          <div className="space-y-3">
            {memoryEntries.map((entry) => (
              <article key={entry.id} className="agenthub-glass-panel rounded-2xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {entry.category} · {entry.status} · confidence {entry.confidence.toFixed(2)}
                    </div>
                    <h3 className="mt-1 font-medium">{entry.key}</h3>
                  </div>
                  <div className="flex gap-2">
                    {entry.status === "proposed" && (
                      <>
                        <button
                          onClick={() => updateEntry.mutate({ id: entry.id, status: "accepted" })}
                          className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-700 hover:bg-green-100 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => updateEntry.mutate({ id: entry.id, status: "rejected" })}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setEditingId(entry.id)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeEntry.mutate({ id: entry.id })}
                      disabled={removeEntry.isPending}
                      className="rounded-lg border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{entry.value}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

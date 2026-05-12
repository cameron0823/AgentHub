"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useChatStore, type MemoryEntry, type MemoryStatus } from "@/stores/chatStore";

const STATUS_OPTIONS: Array<MemoryStatus | ""> = ["", "accepted", "proposed", "rejected", "archived"];

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
  const { agents, memoryEntries, setMemoryEntries, addMemoryEntry, updateMemoryEntry, deleteMemoryEntry } = useChatStore();
  const [agentId, setAgentId] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<MemoryStatus | "">("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ category: "profile", key: "", value: "", confidence: 1, status: "accepted" as MemoryStatus });
  const utils = trpc.useUtils();
  const listQuery = trpc.memoryEntries.list.useQuery({
    ...(agentId && { agentId }),
    ...(categoryFilter && { category: categoryFilter }),
    ...(statusFilter && { status: statusFilter }),
  });
  const createEntry = trpc.memoryEntries.create.useMutation({
    onSuccess: (entry) => {
      addMemoryEntry(toMemoryEntry(entry));
      setDraft({ category: "profile", key: "", value: "", confidence: 1, status: "accepted" });
      utils.memoryEntries.list.invalidate();
    },
  });
  const updateEntry = trpc.memoryEntries.update.useMutation({
    onSuccess: (_result, variables) => {
      updateMemoryEntry(variables.id, { ...variables, updatedAt: new Date(), isEdited: true });
      setEditingId(null);
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
    if (listQuery.data) {
      setMemoryEntries(listQuery.data.map(toMemoryEntry));
    }
  }, [listQuery.data, setMemoryEntries]);

  const categories = useMemo(() => {
    return [...new Set(memoryEntries.map((entry) => entry.category))].sort();
  }, [memoryEntries]);

  const pendingCount = useMemo(() => memoryEntries.filter((e) => e.status === "proposed").length, [memoryEntries]);

  const selectedEntry = memoryEntries.find((entry) => entry.id === editingId);

  useEffect(() => {
    if (selectedEntry) {
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
      agentId: agentId || null,
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b p-6">
        <h2 className="text-2xl font-semibold">Memory</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manual saved memories. Accepted entries are injected transparently for memory-enabled single-agent chats.</p>
      </div>

      {pendingCount > 0 && (
        <div className="mx-6 mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-200">
          <div className="flex items-center justify-between">
            <span className="font-medium">{pendingCount} proposed memory{pendingCount > 1 ? "ies" : "y"} pending review</span>
            <button
              onClick={() => setStatusFilter("proposed")}
              className="text-xs underline hover:no-underline"
            >
              View pending
            </button>
          </div>
        </div>
      )}

      <div className="grid flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[320px_1fr]">
        <section className="rounded-xl border bg-card p-4">
          <h3 className="font-medium">Create or edit memory</h3>
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="text-muted-foreground">Agent</span>
              <select value={agentId} onChange={(event) => setAgentId(event.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2">
                <option value="">Global / unassigned</option>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Category</span>
              <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Key</span>
              <input value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Value</span>
              <textarea value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} rows={5} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Confidence</span>
              <input type="number" min="0" max="1" step="0.05" value={draft.confidence} onChange={(event) => setDraft({ ...draft, confidence: Number(event.target.value) })} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Status</span>
              <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as MemoryStatus })} className="mt-1 w-full rounded-lg border bg-background px-3 py-2">
                {STATUS_OPTIONS.filter(Boolean).map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <div className="flex gap-2">
              <button onClick={saveDraft} disabled={createEntry.isPending || updateEntry.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{editingId ? "Save changes" : "Create memory"}</button>
              {editingId ? <button onClick={() => setEditingId(null)} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancel</button> : null}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap gap-3 rounded-xl border bg-card p-4">
            <select value={agentId} onChange={(event) => setAgentId(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">
              <option value="">All agents</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">
              <option value="">All categories</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as MemoryStatus | "")} className="rounded-lg border bg-background px-3 py-2 text-sm">
              {STATUS_OPTIONS.map((status) => <option key={status || "all"} value={status}>{status || "All statuses"}</option>)}
            </select>
          </div>

          {listQuery.isLoading ? <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Loading memories...</div> : null}
          {listQuery.isError ? <div className="rounded-xl border border-destructive/30 p-6 text-sm text-destructive">Could not load memories.</div> : null}
          {!listQuery.isLoading && memoryEntries.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No memories yet.</div> : null}

          <div className="space-y-3">
            {memoryEntries.map((entry) => (
              <article key={entry.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{entry.category} · {entry.status} · confidence {entry.confidence.toFixed(2)}</div>
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
                          className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    <button onClick={() => setEditingId(entry.id)} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">Edit</button>
                    <button onClick={() => removeEntry.mutate({ id: entry.id })} disabled={removeEntry.isPending} className="rounded-lg border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60">Delete</button>
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

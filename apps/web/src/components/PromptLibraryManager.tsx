"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Pin, PinOff, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface PromptFormState {
  title: string;
  content: string;
  tags: string;
  isPinned: boolean;
}

const emptyForm: PromptFormState = { title: "", content: "", tags: "", isPinned: false };

export function PromptLibraryManager() {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromptFormState>(emptyForm);
  const [showCreate, setShowCreate] = useState(false);

  const utils = trpc.useUtils();
  const { data: prompts = [] } = trpc.promptLibrary.list.useQuery({ search: search || undefined });
  const createPrompt = trpc.promptLibrary.create.useMutation({
    onSuccess: () => {
      utils.promptLibrary.list.invalidate();
      setShowCreate(false);
      setForm(emptyForm);
    },
  });
  const updatePrompt = trpc.promptLibrary.update.useMutation({
    onSuccess: () => {
      utils.promptLibrary.list.invalidate();
      setEditingId(null);
    },
  });
  const deletePrompt = trpc.promptLibrary.delete.useMutation({
    onSuccess: () => utils.promptLibrary.list.invalidate(),
  });

  const parseTags = (s: string) =>
    s
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

  const handleSave = () => {
    const payload = { title: form.title, content: form.content, tags: parseTags(form.tags), isPinned: form.isPinned };
    if (editingId) {
      updatePrompt.mutate({ id: editingId, ...payload });
    } else {
      createPrompt.mutate(payload);
    }
  };

  const startEdit = (prompt: {
    id: string;
    title: string;
    content: string;
    tags: string[] | null;
    isPinned: boolean | null;
  }) => {
    setEditingId(prompt.id);
    setForm({
      title: prompt.title,
      content: prompt.content,
      tags: (prompt.tags ?? []).join(", "),
      isPinned: prompt.isPinned ?? false,
    });
    setShowCreate(true);
  };

  const cancelForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowCreate(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts..."
            className="agenthub-field w-full py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <button
          onClick={() => {
            cancelForm();
            setShowCreate(true);
          }}
          className="agenthub-primary-button flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> New
        </button>
      </div>

      {showCreate && (
        <div className="agenthub-glass-panel space-y-3 rounded-2xl p-4">
          <h3 className="text-sm font-semibold">{editingId ? "Edit Prompt" : "New Prompt"}</h3>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Title"
            className="agenthub-field w-full px-3 py-2 text-sm"
          />
          <textarea
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            placeholder="Prompt content..."
            rows={4}
            className="agenthub-field w-full resize-none px-3 py-2 text-sm"
          />
          <input
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            placeholder="Tags (comma-separated)"
            className="agenthub-field w-full px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.isPinned}
              onChange={(e) => setForm((f) => ({ ...f, isPinned: e.target.checked }))}
              className="rounded"
            />
            Pin to top
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!form.title.trim() || !form.content.trim()}
              className="agenthub-primary-button rounded-xl px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {editingId ? "Save" : "Create"}
            </button>
            <button onClick={cancelForm} className="agenthub-secondary-button px-3 py-1.5">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="agenthub-glass-panel divide-y divide-white/10 overflow-hidden rounded-2xl">
        {prompts.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {search ? "No prompts match your search." : "No prompts yet. Create one to get started."}
          </div>
        ) : (
          prompts.map((prompt) => (
            <div key={prompt.id} className="flex items-start gap-3 p-3 hover:bg-white/5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{prompt.title}</span>
                  {prompt.isPinned && <Pin className="w-3 h-3 text-muted-foreground shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{prompt.content}</p>
                {prompt.tags && prompt.tags.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {prompt.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/10 px-2 py-0.5 text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => updatePrompt.mutate({ id: prompt.id, isPinned: !prompt.isPinned })}
                  className="agenthub-icon-button"
                  title={prompt.isPinned ? "Unpin" : "Pin"}
                >
                  {prompt.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => startEdit(prompt)} className="agenthub-icon-button" title="Edit">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => deletePrompt.mutate({ id: prompt.id })}
                  className="agenthub-icon-button text-destructive hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

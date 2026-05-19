"use client";

import { useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { RouteStrategy, ToolProfile } from "@/stores/chatStore";

export interface AgentBuilderAssistantPatch {
  name?: string;
  description?: string;
  avatar?: string;
  systemPrompt?: string;
  model?: string;
  routeStrategy?: RouteStrategy;
  fallbackModelIds?: string[];
  tools?: string[];
  toolProfile?: ToolProfile;
  deniedTools?: string[];
  memoryEnabled?: boolean;
  knowledgeBaseId?: string | null;
  openingMessage?: string;
  openingQuestions?: string[];
}

interface AgentBuilderAssistantProps {
  activeAgentId?: string | null;
  currentForm: AgentBuilderAssistantPatch;
  onApplyPatch: (patch: AgentBuilderAssistantPatch) => void;
}

function cleanString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanStringArray(value: string[] | undefined) {
  const cleaned = value?.map((item) => item.trim()).filter(Boolean);
  return cleaned && cleaned.length > 0 ? cleaned : undefined;
}

function sanitizePreviewCurrentForm(form: AgentBuilderAssistantPatch): AgentBuilderAssistantPatch {
  return {
    ...(cleanString(form.name) && { name: cleanString(form.name) }),
    ...(cleanString(form.description) && { description: cleanString(form.description) }),
    ...(cleanString(form.avatar) && { avatar: cleanString(form.avatar) }),
    ...(cleanString(form.systemPrompt) && { systemPrompt: cleanString(form.systemPrompt) }),
    ...(cleanString(form.model) && { model: cleanString(form.model) }),
    ...(form.routeStrategy !== undefined && { routeStrategy: form.routeStrategy }),
    ...(cleanStringArray(form.fallbackModelIds) && { fallbackModelIds: cleanStringArray(form.fallbackModelIds) }),
    ...(cleanStringArray(form.tools) && { tools: cleanStringArray(form.tools) }),
    ...(form.toolProfile !== undefined && { toolProfile: form.toolProfile }),
    ...(cleanStringArray(form.deniedTools) && { deniedTools: cleanStringArray(form.deniedTools) }),
    ...(form.memoryEnabled !== undefined && { memoryEnabled: form.memoryEnabled }),
    ...(form.knowledgeBaseId !== undefined && { knowledgeBaseId: form.knowledgeBaseId }),
    ...(cleanString(form.openingMessage) && { openingMessage: cleanString(form.openingMessage) }),
    ...(cleanStringArray(form.openingQuestions) && { openingQuestions: cleanStringArray(form.openingQuestions) }),
  };
}

export function AgentBuilderAssistant({ activeAgentId, currentForm, onApplyPatch }: AgentBuilderAssistantProps) {
  const [request, setRequest] = useState("");
  const [draft, setDraft] = useState<{
    summary: string;
    patch: AgentBuilderAssistantPatch;
    changes: Array<{ field: string; label: string; before: string | null; after: string | null; reason: string }>;
    rejected: string[];
  } | null>(null);

  const preview = trpc.agentBuilder.preview.useMutation({
    onSuccess: (result) => setDraft(result),
  });

  const handlePreview = () => {
    if (!request.trim()) return;
    preview.mutate({
      request: request.trim(),
      agentId: activeAgentId || undefined,
      current: sanitizePreviewCurrentForm(currentForm),
    });
  };

  const handleApply = () => {
    if (!draft) return;
    onApplyPatch(draft.patch);
    setDraft(null);
    setRequest("");
  };

  return (
    <section className="agenthub-glass-panel rounded-2xl p-5" data-testid="agent-builder-assistant">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">AI Draft</h3>
      </div>
      <div className="flex flex-col gap-2 md:flex-row">
        <textarea
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          rows={3}
          placeholder="Build a research agent that checks current sources, cites claims, and opens with three starter questions."
          className="min-h-[5rem] flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={handlePreview}
          disabled={!request.trim() || preview.isPending}
          className="agenthub-primary-button inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60 md:self-start"
        >
          <Sparkles className="h-4 w-4" />
          Draft
        </button>
      </div>

      {preview.error ? (
        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {preview.error.message}
        </p>
      ) : null}

      {draft ? (
        <div className="mt-4 space-y-3" data-testid="assistant diff">
          <div className="text-sm text-muted-foreground">{draft.summary}</div>
          <div className="divide-y divide-white/10 rounded-xl border border-white/10">
            {draft.changes.map((change) => (
              <div
                key={`${change.field}-${change.after}`}
                className="grid gap-2 px-3 py-2 text-sm md:grid-cols-[10rem_1fr]"
              >
                <div className="font-medium">{change.label}</div>
                <div className="min-w-0">
                  <div className="truncate text-muted-foreground">{change.before ?? "Empty"}</div>
                  <div className="truncate text-foreground">{change.after ?? "Empty"}</div>
                </div>
              </div>
            ))}
          </div>
          {draft.rejected.length > 0 ? (
            <div className="rounded-xl border border-amber-400/20 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
              {draft.rejected.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleApply}
              className="agenthub-primary-button inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
            >
              <Check className="h-4 w-4" />
              Apply
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="agenthub-secondary-button inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
            >
              <X className="h-4 w-4" />
              Reject
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

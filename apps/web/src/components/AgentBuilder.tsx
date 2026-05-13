"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Trash2, Download, Plus, X } from "lucide-react";
import { DEFAULT_MODEL_ID, useChatStore, type Agent } from "@/stores/chatStore";
import { trpc } from "@/lib/trpc";

const TOOL_OPTIONS = [
  { id: "calculator", label: "Calculator", description: "Evaluate math expressions." },
  { id: "datetime", label: "Date and time", description: "Read current date/time context." },
  { id: "read_file", label: "Read file", description: "Read files only when explicitly enabled and allowed." },
  { id: "web_search", label: "Web Search", description: "Search the internet via SearXNG for current information." },
];

function emptyForm() {
  return {
    name: "",
    description: "",
    avatar: "",
    systemPrompt: "You are a helpful local AI agent.",
    model: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 4096,
    tools: ["calculator", "datetime"],
    memoryEnabled: true,
    knowledgeBaseId: null as string | null,
    openingMessage: "",
    openingQuestions: [] as string[],
  };
}

function formFromAgent(agent?: Agent) {
  if (!agent) return emptyForm();
  return {
    name: agent.name,
    description: agent.description || "",
    avatar: agent.avatar || "",
    systemPrompt: agent.systemPrompt,
    model: agent.model || DEFAULT_MODEL_ID,
    temperature: agent.temperature ?? 0.7,
    maxTokens: agent.maxTokens ?? 4096,
    tools: agent.tools || [],
    memoryEnabled: agent.memoryEnabled,
    knowledgeBaseId: agent.knowledgeBaseId || null,
    openingMessage: (agent as any).openingMessage || "",
    openingQuestions: (agent as any).openingQuestions || [],
  };
}

export function AgentBuilder() {
  const {
    agents,
    activeAgentId,
    addAgent,
    updateAgent,
    deleteAgent,
    setActiveAgent,
    setMainView,
  } = useChatStore();
  const activeAgent = useMemo(
    () => agents.find((agent) => agent.id === activeAgentId),
    [agents, activeAgentId]
  );
  const [form, setForm] = useState(() => formFromAgent(activeAgent));
  const utils = trpc.useUtils();

  useEffect(() => {
    setForm(formFromAgent(activeAgent));
  }, [activeAgent]);

  const createAgent = trpc.agents.create.useMutation({
    onSuccess: (agent) => {
      addAgent(toAgent(agent));
      utils.agents.list.invalidate();
      setMainView("chat");
    },
  });
  const updateServerAgent = trpc.agents.update.useMutation({
    onSuccess: (_result, variables) => {
      updateAgent(variables.id, {
        ...variables,
        description: variables.description || null,
        avatar: variables.avatar || null,
        tools: variables.tools || [],
        knowledgeBaseId: variables.knowledgeBaseId || null,
      });
      utils.agents.list.invalidate();
      setMainView("chat");
    },
  });
  const deleteServerAgent = trpc.agents.delete.useMutation({
    onSuccess: (_result, variables) => {
      deleteAgent(variables.id);
      utils.agents.list.invalidate();
      setMainView("chat");
    },
  });

  const exportAgent = trpc.marketplace.exportAgent.useMutation({
    onSuccess: ({ manifest }) => {
      const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${manifest.metadata?.slug ?? "agent"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const isSaving = createAgent.isPending || updateServerAgent.isPending;
  const canSave = form.name.trim() && form.systemPrompt.trim() && !isSaving;

  const setTool = (toolId: string, enabled: boolean) => {
    setForm((current) => ({
      ...current,
      tools: enabled
        ? [...new Set([...current.tools, toolId])]
        : current.tools.filter((tool) => tool !== toolId),
    }));
  };

  const handleSave = () => {
    const input = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      avatar: form.avatar.trim() || undefined,
      systemPrompt: form.systemPrompt.trim(),
      model: form.model.trim() || DEFAULT_MODEL_ID,
      temperature: Number(form.temperature),
      maxTokens: Number(form.maxTokens),
      tools: form.tools,
      memoryEnabled: form.memoryEnabled,
      knowledgeBaseId: form.knowledgeBaseId,
      openingMessage: form.openingMessage.trim() || undefined,
      openingQuestions: form.openingQuestions.filter(Boolean),
    };

    if (activeAgent) {
      updateServerAgent.mutate({ id: activeAgent.id, ...input });
      return;
    }

    createAgent.mutate(input);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{activeAgent ? "Edit Agent" : "New Agent"}</h2>
            <p className="text-sm text-muted-foreground">Build a reusable persona for agent-scoped chats.</p>
          </div>
          <div className="flex gap-2">
            {activeAgent ? (
              <>
                <button
                  type="button"
                  onClick={() => exportAgent.mutate({ agentId: activeAgent.id })}
                  disabled={exportAgent.isPending}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                  title="Export agent as JSON"
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => deleteServerAgent.mutate({ id: activeAgent.id })}
                  disabled={deleteServerAgent.isPending}
                  className="flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Save Agent
            </button>
          </div>
        </div>

        <section className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 font-semibold">Basics</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Name</span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Research Assistant"
                className="w-full rounded-lg border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Avatar</span>
              <input
                value={form.avatar}
                onChange={(event) => setForm({ ...form, avatar: event.target.value })}
                placeholder="RA"
                className="w-full rounded-lg border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span>Description</span>
              <input
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Summarizes sources and proposes next steps."
                className="w-full rounded-lg border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 font-semibold">Persona</h3>
          <label className="space-y-1 text-sm">
            <span>System prompt</span>
            <textarea
              value={form.systemPrompt}
              onChange={(event) => setForm({ ...form, systemPrompt: event.target.value })}
              rows={9}
              className="w-full rounded-lg border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground">
              Supports variables: <code className="font-mono">{"{{USER_NAME}}"}</code>,{" "}
              <code className="font-mono">{"{{CURRENT_DATE}}"}</code>,{" "}
              <code className="font-mono">{"{{CURRENT_TIME}}"}</code>,{" "}
              <code className="font-mono">{"{{AGENT_NAME}}"}</code>
            </p>
          </label>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 font-semibold">Opening Experience</h3>
          <div className="space-y-3">
            <label className="space-y-1 text-sm">
              <span>Opening message <span className="text-muted-foreground">(shown when chat starts)</span></span>
              <textarea
                value={form.openingMessage}
                onChange={(e) => setForm({ ...form, openingMessage: e.target.value })}
                rows={3}
                placeholder="Hi! I'm your research assistant. What can I help you with today?"
                className="w-full rounded-lg border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <div className="space-y-1 text-sm">
              <span>Starter questions</span>
              {form.openingQuestions.map((q: string, i: number) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={q}
                    onChange={(e) => {
                      const next = [...form.openingQuestions];
                      next[i] = e.target.value;
                      setForm({ ...form, openingQuestions: next });
                    }}
                    placeholder="Ask me anything..."
                    className="flex-1 rounded-lg border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={() => setForm({ ...form, openingQuestions: form.openingQuestions.filter((_: string, j: number) => j !== i) })}
                    className="p-2 hover:bg-muted rounded-lg text-muted-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setForm({ ...form, openingQuestions: [...form.openingQuestions, ""] })}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <Plus className="w-4 h-4" /> Add question
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 font-semibold">Capabilities</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm md:col-span-3">
              <span>Model</span>
              <input
                value={form.model}
                onChange={(event) => setForm({ ...form, model: event.target.value })}
                className="w-full rounded-lg border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Temperature</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={form.temperature}
                onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })}
                className="w-full rounded-lg border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Max tokens</span>
              <input
                type="number"
                min="1"
                value={form.maxTokens}
                onChange={(event) => setForm({ ...form, maxTokens: Number(event.target.value) })}
                className="w-full rounded-lg border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={form.memoryEnabled}
                onChange={(event) => setForm({ ...form, memoryEnabled: event.target.checked })}
              />
              Memory enabled
            </label>
            <KBSelector
              value={form.knowledgeBaseId}
              onChange={(kbId) => setForm({ ...form, knowledgeBaseId: kbId })}
            />
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {TOOL_OPTIONS.map((tool) => (
              <label key={tool.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={form.tools.includes(tool.id)}
                    onChange={(event) => setTool(tool.id, event.target.checked)}
                  />
                  {tool.label}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function KBSelector({ value, onChange }: { value: string | null; onChange: (kbId: string | null) => void }) {
  const kbs = trpc.knowledgeBases.list.useQuery();
  return (
    <label className="space-y-1 text-sm md:col-span-3">
      <span>Knowledge Base</span>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-lg border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">None</option>
        {kbs.data?.map((kb) => (
          <option key={kb.id} value={kb.id}>
            {kb.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">Attach a knowledge base for RAG context retrieval during chats.</p>
    </label>
  );
}

function toAgent(agent: {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  systemPrompt: string;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  tools: string | null;
  memoryEnabled: boolean | null;
  knowledgeBaseId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}): Agent {
  let tools: string[] = [];
  try {
    const parsed = JSON.parse(agent.tools || "[]");
    tools = Array.isArray(parsed) ? parsed.filter((tool): tool is string => typeof tool === "string") : [];
  } catch {
    tools = [];
  }

  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    avatar: agent.avatar,
    systemPrompt: agent.systemPrompt,
    model: agent.model || DEFAULT_MODEL_ID,
    temperature: agent.temperature ?? 0.7,
    maxTokens: agent.maxTokens ?? 4096,
    tools,
    memoryEnabled: agent.memoryEnabled ?? true,
    knowledgeBaseId: agent.knowledgeBaseId,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

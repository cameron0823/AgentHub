"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Trash2, Download, Plus, X } from "lucide-react";
import { DEFAULT_MODEL_ID, useChatStore, type Agent, type RouteStrategy, type ToolProfile } from "@/stores/chatStore";
import { trpc } from "@/lib/trpc";
import { AgentBuilderAssistant, type AgentBuilderAssistantPatch } from "./AgentBuilderAssistant";

const TOOL_OPTIONS = [
  { id: "calculator", label: "Calculator", description: "Evaluate math expressions." },
  { id: "datetime", label: "Date and time", description: "Read current date/time context." },
  { id: "read_file", label: "Read file", description: "Read files only when explicitly enabled and allowed." },
  { id: "web_search", label: "Web Search", description: "Search the internet via SearXNG for current information." },
  { id: "web_fetch", label: "Web fetch", description: "Fetch public HTTP(S) pages through outbound request guards." },
  {
    id: "github_repo",
    label: "GitHub repository",
    description: "Read GitHub repo metadata, issues, and pull requests with explicit credentials.",
  },
  {
    id: "execute_code",
    label: "Execute code",
    description: "Run Python through governed sandbox execution with HITL approval.",
  },
  {
    id: "generate_image",
    label: "Generate image",
    description: "Create image resources when a capable provider is configured.",
  },
  {
    id: "local_system",
    label: "Local system",
    description: "Desktop-only local capability status; no shell execution.",
  },
];

const TOOL_PROFILE_OPTIONS: Array<{ value: ToolProfile; label: string; description: string }> = [
  { value: "minimal", label: "Minimal", description: "Calculator and date/time only." },
  { value: "research", label: "Research", description: "Search and public fetch tools." },
  { value: "coding", label: "Coding", description: "Read-only repo, sandbox, skills, and MCP tools." },
  { value: "messaging", label: "Messaging", description: "Communication-safe context tools." },
  { value: "admin", label: "Admin", description: "All built-ins and governed extension tools." },
  { value: "full", label: "Full", description: "Every selected tool unless denied." },
];

const ROUTE_STRATEGY_OPTIONS: Array<{ value: RouteStrategy; label: string }> = [
  { value: "fixed", label: "Fixed" },
  { value: "local-first", label: "Local first" },
  { value: "speed-first", label: "Speed first" },
  { value: "cost-first", label: "Cost first" },
  { value: "reasoning-first", label: "Reasoning first" },
  { value: "fallback-chain", label: "Fallback chain" },
];

const TTS_PROVIDER_OPTIONS = [
  { value: "browser", label: "Browser fallback" },
  { value: "edge", label: "Microsoft Edge Speech" },
  { value: "openai", label: "OpenAI Audio" },
  { value: "piper", label: "Piper local TTS" },
] as const;

const STT_PROVIDER_OPTIONS = [
  { value: "browser", label: "Browser fallback" },
  { value: "openai", label: "OpenAI Whisper" },
  { value: "faster-whisper", label: "faster-whisper local STT" },
] as const;

type VoiceProvider = (typeof TTS_PROVIDER_OPTIONS)[number]["value"] | (typeof STT_PROVIDER_OPTIONS)[number]["value"];

const VOICE_ID_OPTIONS = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "en_US-lessac-medium",
] as const;

function parseFallbackModels(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDeniedTools(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function emptyForm() {
  return {
    name: "",
    description: "",
    avatar: "",
    systemPrompt: "You are a helpful local AI agent.",
    model: DEFAULT_MODEL_ID,
    routeStrategy: "fixed" as RouteStrategy,
    fallbackModelsText: "",
    voiceProvider: "browser" as VoiceProvider,
    voiceId: "alloy",
    voiceSpeed: 1,
    sttProvider: "browser" as VoiceProvider,
    handsFreeVoice: false,
    temperature: 0.7,
    maxTokens: 4096,
    tools: ["calculator", "datetime"],
    toolProfile: "minimal" as ToolProfile,
    deniedToolsText: "",
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
    routeStrategy: agent.routeStrategy || "fixed",
    fallbackModelsText: (agent.fallbackModelIds || []).join("\n"),
    voiceProvider: agent.voiceProvider || "browser",
    voiceId: agent.voiceId || "alloy",
    voiceSpeed: agent.voiceSpeed ?? 1,
    sttProvider: agent.sttProvider || "browser",
    handsFreeVoice: agent.handsFreeVoice ?? false,
    temperature: agent.temperature ?? 0.7,
    maxTokens: agent.maxTokens ?? 4096,
    tools: agent.tools || [],
    toolProfile: agent.toolProfile || "full",
    deniedToolsText: (agent.deniedTools || []).join("\n"),
    memoryEnabled: agent.memoryEnabled,
    knowledgeBaseId: agent.knowledgeBaseId || null,
    openingMessage: (agent as any).openingMessage || "",
    openingQuestions: (agent as any).openingQuestions || [],
  };
}

export function AgentBuilder() {
  const { agents, activeAgentId, addAgent, updateAgent, deleteAgent, setActiveAgent, setMainView } = useChatStore();
  const activeAgent = useMemo(() => agents.find((agent) => agent.id === activeAgentId), [agents, activeAgentId]);
  const [form, setForm] = useState(() => formFromAgent(activeAgent));
  const utils = trpc.useUtils();
  const installedSkills = trpc.skills.list.useQuery();
  const openApiPlugins = trpc.marketplace.listOpenApiPlugins.useQuery();
  const skillToolOptions = useMemo(
    () =>
      (installedSkills.data || []).map((skill) => ({
        id: `skill:${skill.slug}`,
        label: skill.name,
        description: `Activate installed skill package ${skill.enabledToolId}.`,
      })),
    [installedSkills.data],
  );
  const openApiToolOptions = useMemo(
    () =>
      (openApiPlugins.data || []).flatMap((plugin) =>
        plugin.tools.map((tool, index) => ({
          id: plugin.enabledToolIds[index] ?? tool.name,
          label: `${plugin.title}: ${tool.name}`,
          description: `${tool.method} ${tool.path} - ${tool.description}`,
        })),
      ),
    [openApiPlugins.data],
  );

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
        toolProfile: variables.toolProfile || "minimal",
        deniedTools: variables.deniedTools || [],
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
      tools: enabled ? [...new Set([...current.tools, toolId])] : current.tools.filter((tool) => tool !== toolId),
    }));
  };

  const handleSave = () => {
    const input = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      avatar: form.avatar.trim() || undefined,
      systemPrompt: form.systemPrompt.trim(),
      model: form.model.trim() || DEFAULT_MODEL_ID,
      routeStrategy: form.routeStrategy,
      fallbackModelIds: parseFallbackModels(form.fallbackModelsText),
      voiceProvider: form.voiceProvider,
      voiceId: form.voiceId,
      voiceSpeed: Number(form.voiceSpeed),
      sttProvider: form.sttProvider,
      handsFreeVoice: form.handsFreeVoice,
      temperature: Number(form.temperature),
      maxTokens: Number(form.maxTokens),
      tools: form.tools,
      toolProfile: form.toolProfile,
      deniedTools: parseDeniedTools(form.deniedToolsText),
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

  const applyAssistantPatch = (patch: AgentBuilderAssistantPatch) => {
    setForm((current) => ({
      ...current,
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.avatar !== undefined && { avatar: patch.avatar }),
      ...(patch.systemPrompt !== undefined && { systemPrompt: patch.systemPrompt }),
      ...(patch.model !== undefined && { model: patch.model }),
      ...(patch.routeStrategy !== undefined && { routeStrategy: patch.routeStrategy }),
      ...(patch.fallbackModelIds !== undefined && { fallbackModelsText: patch.fallbackModelIds.join("\n") }),
      ...(patch.tools !== undefined && { tools: patch.tools }),
      ...(patch.toolProfile !== undefined && { toolProfile: patch.toolProfile }),
      ...(patch.deniedTools !== undefined && { deniedToolsText: patch.deniedTools.join("\n") }),
      ...(patch.memoryEnabled !== undefined && { memoryEnabled: patch.memoryEnabled }),
      ...(patch.knowledgeBaseId !== undefined && { knowledgeBaseId: patch.knowledgeBaseId }),
      ...(patch.openingMessage !== undefined && { openingMessage: patch.openingMessage }),
      ...(patch.openingQuestions !== undefined && { openingQuestions: patch.openingQuestions }),
    }));
  };

  return (
    <div className="flex-1 overflow-y-auto bg-transparent p-6">
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
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-60"
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
              className="agenthub-primary-button flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Save Agent
            </button>
          </div>
        </div>

        <AgentBuilderAssistant
          activeAgentId={activeAgent?.id}
          currentForm={{
            name: form.name,
            description: form.description,
            avatar: form.avatar,
            systemPrompt: form.systemPrompt,
            model: form.model,
            routeStrategy: form.routeStrategy,
            fallbackModelIds: parseFallbackModels(form.fallbackModelsText),
            tools: form.tools,
            toolProfile: form.toolProfile,
            deniedTools: parseDeniedTools(form.deniedToolsText),
            memoryEnabled: form.memoryEnabled,
            knowledgeBaseId: form.knowledgeBaseId,
            openingMessage: form.openingMessage,
            openingQuestions: form.openingQuestions.filter(Boolean),
          }}
          onApplyPatch={applyAssistantPatch}
        />

        <section className="agenthub-glass-panel rounded-2xl p-5">
          <h3 className="mb-3 font-semibold">Basics</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Name</span>
              <input
                name="name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Research Assistant"
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Avatar</span>
              <input
                name="avatar"
                value={form.avatar}
                onChange={(event) => setForm({ ...form, avatar: event.target.value })}
                placeholder="RA"
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span>Description</span>
              <input
                name="description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Summarizes sources and proposes next steps."
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
          </div>
        </section>

        <section className="agenthub-glass-panel rounded-2xl p-5">
          <h3 className="mb-3 font-semibold">Persona</h3>
          <label className="space-y-1 text-sm">
            <span>System prompt</span>
            <textarea
              name="systemPrompt"
              value={form.systemPrompt}
              onChange={(event) => setForm({ ...form, systemPrompt: event.target.value })}
              rows={9}
              className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground">
              Supports variables: <code className="font-mono">{"{{USER_NAME}}"}</code>,{" "}
              <code className="font-mono">{"{{CURRENT_DATE}}"}</code>,{" "}
              <code className="font-mono">{"{{CURRENT_TIME}}"}</code>,{" "}
              <code className="font-mono">{"{{AGENT_NAME}}"}</code>
            </p>
          </label>
        </section>

        <section className="agenthub-glass-panel rounded-2xl p-5">
          <h3 className="mb-3 font-semibold">Opening Experience</h3>
          <div className="space-y-3">
            <label className="space-y-1 text-sm">
              <span>
                Opening message <span className="text-muted-foreground">(shown when chat starts)</span>
              </span>
              <textarea
                value={form.openingMessage}
                onChange={(e) => setForm({ ...form, openingMessage: e.target.value })}
                rows={3}
                placeholder="Hi! I'm your research assistant. What can I help you with today?"
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
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
                    className="flex-1 rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={() =>
                      setForm({
                        ...form,
                        openingQuestions: form.openingQuestions.filter((_: string, j: number) => j !== i),
                      })
                    }
                    className="rounded-lg p-2 text-muted-foreground hover:bg-white/10"
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

        <section className="agenthub-glass-panel rounded-2xl p-5">
          <h3 className="mb-3 font-semibold">Capabilities</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm md:col-span-3">
              <span>Model</span>
              <input
                name="model"
                value={form.model}
                onChange={(event) => setForm({ ...form, model: event.target.value })}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Route strategy</span>
              <select
                name="routeStrategy"
                value={form.routeStrategy}
                onChange={(event) => setForm({ ...form, routeStrategy: event.target.value as RouteStrategy })}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              >
                {ROUTE_STRATEGY_OPTIONS.map((strategy) => (
                  <option key={strategy.value} value={strategy.value}>
                    {strategy.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span>Fallback models</span>
              <textarea
                name="fallbackModelIds"
                value={form.fallbackModelsText}
                onChange={(event) => setForm({ ...form, fallbackModelsText: event.target.value })}
                rows={3}
                placeholder="ollama:qwen2.5:7b&#10;groq:llama-3.3-70b"
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
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
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Max tokens</span>
              <input
                type="number"
                min="1"
                value={form.maxTokens}
                onChange={(event) => setForm({ ...form, maxTokens: Number(event.target.value) })}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Tool profile</span>
              <select
                name="toolProfile"
                value={form.toolProfile}
                onChange={(event) => setForm({ ...form, toolProfile: event.target.value as ToolProfile })}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              >
                {TOOL_PROFILE_OPTIONS.map((profile) => (
                  <option key={profile.value} value={profile.value}>
                    {profile.label}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-muted-foreground">
                {TOOL_PROFILE_OPTIONS.find((profile) => profile.value === form.toolProfile)?.description}
              </span>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={form.memoryEnabled}
                onChange={(event) => setForm({ ...form, memoryEnabled: event.target.checked })}
              />
              Memory enabled
            </label>
            <KBSelector value={form.knowledgeBaseId} onChange={(kbId) => setForm({ ...form, knowledgeBaseId: kbId })} />
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {TOOL_OPTIONS.map((tool) => (
              <label key={tool.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
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

          {skillToolOptions.length > 0 ? (
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold">Installed skills</h4>
              <div className="grid gap-2 md:grid-cols-2">
                {skillToolOptions.map((tool) => (
                  <label key={tool.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
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
            </div>
          ) : null}

          {openApiToolOptions.length > 0 ? (
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold">OpenAPI tools</h4>
              <div className="grid gap-2 md:grid-cols-2">
                {openApiToolOptions.map((tool) => (
                  <label key={tool.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
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
            </div>
          ) : null}

          <label className="mt-4 block space-y-1 text-sm">
            <span>Deny list</span>
            <textarea
              value={form.deniedToolsText}
              onChange={(event) => setForm({ ...form, deniedToolsText: event.target.value })}
              rows={3}
              placeholder="execute_code&#10;local_system&#10;mcp:*&#10;openapi:*"
              className="w-full rounded-xl border px-3 py-2 font-mono text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="block text-xs text-muted-foreground">
              Tool names listed here are removed from prompts and denied again before execution.
            </span>
          </label>
        </section>

        <section className="agenthub-glass-panel rounded-2xl p-5">
          <h3 className="mb-3 font-semibold">Voice conversations</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span>Provider TTS</span>
              <select
                value={form.voiceProvider}
                onChange={(event) => setForm({ ...form, voiceProvider: event.target.value as VoiceProvider })}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              >
                {TTS_PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Voice</span>
              <select
                value={form.voiceId}
                onChange={(event) => setForm({ ...form, voiceId: event.target.value })}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              >
                {VOICE_ID_OPTIONS.map((voice) => (
                  <option key={voice} value={voice}>
                    {voice}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Playback speed</span>
              <input
                type="number"
                min="0.25"
                max="4"
                step="0.25"
                value={form.voiceSpeed}
                onChange={(event) => setForm({ ...form, voiceSpeed: Number(event.target.value) })}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span>Speech-to-text provider</span>
              <select
                value={form.sttProvider}
                onChange={(event) => setForm({ ...form, sttProvider: event.target.value as VoiceProvider })}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              >
                {STT_PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={form.handsFreeVoice}
                onChange={(event) => setForm({ ...form, handsFreeVoice: event.target.checked })}
              />
              Hands-free reply playback
            </label>
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
        className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
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

function normalizeVoiceProvider(value: unknown): VoiceProvider {
  if (value === "openai" || value === "edge" || value === "piper" || value === "faster-whisper") return value;
  return "browser";
}

function toAgent(agent: {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  systemPrompt: string;
  model: string | null;
  routeStrategy?: RouteStrategy | null;
  fallbackModelIds?: unknown;
  voiceProvider?: string | null;
  voiceId?: string | null;
  voiceSpeed?: number | null;
  sttProvider?: string | null;
  handsFreeVoice?: boolean | null;
  temperature: number | null;
  maxTokens: number | null;
  tools: string | null;
  toolProfile?: ToolProfile | null;
  deniedTools?: unknown;
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
  const fallbackModelIds = Array.isArray(agent.fallbackModelIds)
    ? agent.fallbackModelIds.filter((modelId): modelId is string => typeof modelId === "string")
    : [];

  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    avatar: agent.avatar,
    systemPrompt: agent.systemPrompt,
    model: agent.model || DEFAULT_MODEL_ID,
    routeStrategy: agent.routeStrategy || "fixed",
    fallbackModelIds,
    voiceProvider: normalizeVoiceProvider(agent.voiceProvider),
    voiceId: agent.voiceId || "alloy",
    voiceSpeed: agent.voiceSpeed ?? 1,
    sttProvider: normalizeVoiceProvider(agent.sttProvider),
    handsFreeVoice: agent.handsFreeVoice ?? false,
    temperature: agent.temperature ?? 0.7,
    maxTokens: agent.maxTokens ?? 4096,
    tools,
    toolProfile: agent.toolProfile || "full",
    deniedTools: Array.isArray(agent.deniedTools)
      ? agent.deniedTools.filter((tool): tool is string => typeof tool === "string")
      : [],
    memoryEnabled: agent.memoryEnabled ?? true,
    knowledgeBaseId: agent.knowledgeBaseId,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

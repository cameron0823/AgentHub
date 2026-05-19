import { z } from "zod";

export const DEFAULT_AGENT_BUILDER_MODEL = "ollama:qwen2.5:7b";

export const routeStrategySchema = z.enum([
  "fixed",
  "local-first",
  "speed-first",
  "cost-first",
  "reasoning-first",
  "fallback-chain",
]);

export const toolProfileSchema = z.enum(["minimal", "research", "coding", "messaging", "admin", "full"]);

export const agentBuilderPatchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  avatar: z.string().optional(),
  systemPrompt: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  routeStrategy: routeStrategySchema.optional(),
  fallbackModelIds: z.array(z.string().min(1)).optional(),
  tools: z.array(z.string().min(1)).optional(),
  toolProfile: toolProfileSchema.optional(),
  deniedTools: z.array(z.string().min(1)).optional(),
  memoryEnabled: z.boolean().optional(),
  knowledgeBaseId: z.string().uuid().nullable().optional(),
  openingMessage: z.string().optional(),
  openingQuestions: z.array(z.string().min(1)).max(4).optional(),
});

export type AgentBuilderPatch = z.infer<typeof agentBuilderPatchSchema>;

const changeGroupSchema = z.enum(["identity", "model_tools", "prompt", "opening", "knowledge"]);

export const agentBuilderDiffSchema = z.object({
  summary: z.string(),
  patch: agentBuilderPatchSchema,
  changes: z.array(
    z.object({
      group: changeGroupSchema,
      field: z.string(),
      label: z.string(),
      before: z.string().nullable(),
      after: z.string().nullable(),
      reason: z.string(),
    }),
  ),
  rejected: z.array(z.string()).default([]),
});

export type AgentBuilderDiff = z.infer<typeof agentBuilderDiffSchema>;

interface CurrentAgentConfig {
  name?: string | null;
  description?: string | null;
  avatar?: string | null;
  systemPrompt?: string | null;
  model?: string | null;
  routeStrategy?: z.infer<typeof routeStrategySchema> | null;
  fallbackModelIds?: string[] | null;
  tools?: string[] | null;
  toolProfile?: z.infer<typeof toolProfileSchema> | null;
  deniedTools?: string[] | null;
  memoryEnabled?: boolean | null;
  knowledgeBaseId?: string | null;
  openingMessage?: string | null;
  openingQuestions?: string[] | null;
}

interface AvailableModel {
  id: string;
  name?: string;
  providerId?: string;
}

interface AvailableTool {
  id: string;
  name?: string;
  description?: string;
}

interface AvailableKnowledgeBase {
  id: string;
  name: string;
  description?: string | null;
}

export interface AgentBuilderDraftInput {
  request: string;
  currentAgent?: CurrentAgentConfig | null;
  availableModels: AvailableModel[];
  availableTools: AvailableTool[];
  knowledgeBases: AvailableKnowledgeBase[];
}

const FIELD_LABELS: Record<keyof AgentBuilderPatch, string> = {
  name: "Name",
  description: "Description",
  avatar: "Avatar",
  systemPrompt: "System prompt",
  model: "Model",
  routeStrategy: "Route strategy",
  fallbackModelIds: "Fallback models",
  tools: "Tools",
  toolProfile: "Tool profile",
  deniedTools: "Denied tools",
  memoryEnabled: "Memory",
  knowledgeBaseId: "Knowledge base",
  openingMessage: "Opening message",
  openingQuestions: "Starter questions",
};

const FIELD_GROUPS: Record<keyof AgentBuilderPatch, z.infer<typeof changeGroupSchema>> = {
  name: "identity",
  description: "identity",
  avatar: "identity",
  systemPrompt: "prompt",
  model: "model_tools",
  routeStrategy: "model_tools",
  fallbackModelIds: "model_tools",
  tools: "model_tools",
  toolProfile: "model_tools",
  deniedTools: "model_tools",
  memoryEnabled: "knowledge",
  knowledgeBaseId: "knowledge",
  openingMessage: "opening",
  openingQuestions: "opening",
};

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function pickPersona(text: string) {
  if (includesAny(text, ["research", "sources", "citation", "literature"])) {
    return {
      name: "Research Assistant",
      description: "Finds, compares, and summarizes grounded source material.",
      avatar: "RA",
    };
  }
  if (includesAny(text, ["code", "developer", "debug", "frontend", "backend", "repo"])) {
    return {
      name: "Engineering Assistant",
      description: "Plans, reviews, and implements software changes with verification.",
      avatar: "EA",
    };
  }
  if (includesAny(text, ["crm", "sales", "lead", "pipeline", "client"])) {
    return {
      name: "CRM Assistant",
      description: "Helps manage customer context, follow-ups, and pipeline actions.",
      avatar: "CRM",
    };
  }
  if (includesAny(text, ["write", "content", "blog", "copy", "email"])) {
    return {
      name: "Writing Assistant",
      description: "Drafts concise, audience-aware content with clear structure.",
      avatar: "WA",
    };
  }
  const cleaned = text.replace(/[^a-z0-9\s-]/gi, " ").trim();
  return {
    name: cleaned ? `${titleCase(cleaned)} Assistant` : "Custom Assistant",
    description: "Configured from a natural-language builder request.",
    avatar: "AI",
  };
}

function selectModel(text: string, currentModel: string | undefined, availableModelIds: Set<string>) {
  const candidates = Array.from(availableModelIds);
  const preferReasoning = includesAny(text, ["reason", "complex", "plan", "architecture", "debug"]);
  const preferVision = includesAny(text, ["vision", "image", "screenshot", "visual"]);
  const preferred = candidates.find(
    (id) =>
      (preferReasoning && /o3|o1|reason|gpt-4/i.test(id)) || (preferVision && /gpt-4o|vision|gemini|claude/i.test(id)),
  );
  return (
    preferred ||
    currentModel ||
    (availableModelIds.has(DEFAULT_AGENT_BUILDER_MODEL) ? DEFAULT_AGENT_BUILDER_MODEL : candidates[0])
  );
}

function selectTools(text: string, currentTools: string[], availableToolIds: Set<string>) {
  const tools = new Set(currentTools.filter((tool) => availableToolIds.has(tool)));
  if (availableToolIds.has("calculator") && includesAny(text, ["math", "calculate", "budget", "finance", "pricing"])) {
    tools.add("calculator");
  }
  if (availableToolIds.has("datetime") && includesAny(text, ["schedule", "date", "time", "calendar", "deadline"])) {
    tools.add("datetime");
  }
  if (
    availableToolIds.has("web_search") &&
    includesAny(text, ["research", "current", "latest", "source", "market", "competitor"])
  ) {
    tools.add("web_search");
  }
  if (
    availableToolIds.has("read_file") &&
    includesAny(text, ["file", "document", "repo", "codebase", "knowledge base", "kb"])
  ) {
    tools.add("read_file");
  }
  if (
    availableToolIds.has("generate_image") &&
    includesAny(text, ["image", "illustration", "poster", "logo", "visual"])
  ) {
    tools.add("generate_image");
  }
  if (tools.size === 0) {
    for (const fallback of ["calculator", "datetime"]) {
      if (availableToolIds.has(fallback)) tools.add(fallback);
    }
  }
  return Array.from(tools);
}

function selectToolProfile(text: string, currentProfile: z.infer<typeof toolProfileSchema> | null | undefined) {
  if (includesAny(text, ["admin", "operator", "operations"])) return "admin";
  if (includesAny(text, ["code", "developer", "debug", "frontend", "backend", "repo", "sandbox"])) return "coding";
  if (includesAny(text, ["research", "sources", "citation", "literature", "market", "competitor"])) return "research";
  if (includesAny(text, ["crm", "sales", "lead", "pipeline", "client", "email", "message", "write", "content"]))
    return "messaging";
  return currentProfile ?? "minimal";
}

function selectKnowledgeBase(
  text: string,
  currentKnowledgeBaseId: string | null | undefined,
  knowledgeBases: AvailableKnowledgeBase[],
) {
  if (!includesAny(text, ["knowledge base", "kb", "docs", "documents", "sources"]))
    return currentKnowledgeBaseId ?? null;
  const normalized = text.toLowerCase();
  const exact = knowledgeBases.find((kb) => normalized.includes(kb.name.toLowerCase()));
  return exact?.id || knowledgeBases[0]?.id || currentKnowledgeBaseId || null;
}

function systemPromptFor(request: string, personaName: string, tools: string[]) {
  const toolLine =
    tools.length > 0
      ? `Use enabled tools when they materially improve accuracy: ${tools.join(", ")}.`
      : "Work from the conversation context and be explicit about uncertainty.";
  return [
    `You are ${personaName}.`,
    `Primary assignment: ${request.trim()}`,
    "Respond with concise, structured, actionable guidance.",
    "Ask for clarification only when a missing detail blocks a safe or correct answer.",
    toolLine,
  ].join("\n");
}

function starterQuestions(text: string) {
  if (includesAny(text, ["research", "sources", "market"])) {
    return [
      "What question should I research first?",
      "Which sources or markets should I prioritize?",
      "Do you want a brief, table, or action plan?",
    ];
  }
  if (includesAny(text, ["code", "debug", "repo", "developer"])) {
    return [
      "What change should I inspect first?",
      "Which command should define success?",
      "Should I optimize for speed, safety, or coverage?",
    ];
  }
  return ["What outcome do you want first?", "What constraints should I preserve?", "How should I format the result?"];
}

function formatValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) return value.length ? value.join(", ") : null;
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  return String(value);
}

function createChanges(patch: AgentBuilderPatch, current: CurrentAgentConfig) {
  return (Object.keys(patch) as Array<keyof AgentBuilderPatch>).map((field) => ({
    group: FIELD_GROUPS[field],
    field,
    label: FIELD_LABELS[field],
    before: formatValue(current[field as keyof CurrentAgentConfig]),
    after: formatValue(patch[field]),
    reason: `Set from the builder request during the ${FIELD_GROUPS[field].replace("_", " ")} pass.`,
  }));
}

function rejectedUnsafeRequests(text: string) {
  const rejected: string[] = [];
  if (/\b(shell|terminal|filesystem|file system|stdio|native mcp|docker|powershell)\b/i.test(text)) {
    rejected.push(
      "Native filesystem, shell, STDIO MCP, Docker, and terminal capabilities are not part of the web Agent Builder surface.",
    );
  }
  return rejected;
}

export function createAgentBuilderDraft(input: AgentBuilderDraftInput): AgentBuilderDiff {
  const request = input.request.trim();
  const text = request.toLowerCase();
  const current = input.currentAgent ?? {};
  const availableModelIds = new Set(
    [DEFAULT_AGENT_BUILDER_MODEL, current.model || "", ...input.availableModels.map((model) => model.id)].filter(
      Boolean,
    ),
  );
  const availableToolIds = new Set(input.availableTools.map((tool) => tool.id));
  const persona = pickPersona(text);
  const tools = selectTools(text, current.tools ?? [], availableToolIds);
  const toolProfile = selectToolProfile(text, current.toolProfile);
  const selectedModel = selectModel(text, current.model ?? undefined, availableModelIds);
  const knowledgeBaseId = selectKnowledgeBase(text, current.knowledgeBaseId, input.knowledgeBases);
  const rejected = rejectedUnsafeRequests(text);

  const patch: AgentBuilderPatch = {
    name: current.name || persona.name,
    description: persona.description,
    avatar: current.avatar || persona.avatar,
    model: selectedModel,
    routeStrategy: current.routeStrategy || "fixed",
    tools,
    toolProfile,
    deniedTools: current.deniedTools ?? [],
    memoryEnabled: current.memoryEnabled ?? true,
    knowledgeBaseId,
    systemPrompt: systemPromptFor(request, current.name || persona.name, tools),
    openingMessage: `I'm ${current.name || persona.name}. What should we work on first?`,
    openingQuestions: starterQuestions(text),
  };

  if (selectedModel && !availableModelIds.has(selectedModel)) {
    rejected.push(`Requested model "${selectedModel}" is not available.`);
    delete patch.model;
  }

  patch.tools = (patch.tools ?? []).filter((tool) => {
    const valid = availableToolIds.has(tool);
    if (!valid) rejected.push(`Requested tool "${tool}" is not available.`);
    return valid;
  });

  if (patch.knowledgeBaseId && !input.knowledgeBases.some((kb) => kb.id === patch.knowledgeBaseId)) {
    rejected.push("Requested knowledge base is not available.");
    patch.knowledgeBaseId = current.knowledgeBaseId ?? null;
  }

  return agentBuilderDiffSchema.parse({
    summary: `Drafted ${current.name ? "updates" : "a new agent"} from the request.`,
    patch: agentBuilderPatchSchema.parse(patch),
    changes: createChanges(patch, current),
    rejected,
  });
}

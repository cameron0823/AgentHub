import { z } from "zod";

export const MARKETPLACE_SCHEMA_VERSION = "agenthub.marketplace.v1" as const;
export const DEFAULT_MARKETPLACE_MODEL = "ollama:qwen2.5:7b";
export const SUPPORTED_MARKETPLACE_TOOLS = ["calculator", "datetime", "read_file"] as const;

const supportedToolSchema = z.enum(SUPPORTED_MARKETPLACE_TOOLS);

const metadataSchema = z.object({
  slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase kebab-case slug."),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  author: z.string().trim().min(1).optional(),
  license: z.string().trim().min(1).optional(),
  version: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
}).strict();

const manifestAgentSchema = z.object({
  localKey: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase kebab-case localKey."),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  avatar: z.string().trim().min(1).optional(),
  systemPrompt: z.string().trim().min(1),
  model: z.string().trim().min(1).default(DEFAULT_MARKETPLACE_MODEL),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().max(128000).default(4096),
  tools: z.array(supportedToolSchema).default([]),
  memoryEnabled: z.boolean().default(true),
}).strict();

const manifestSchema = z.object({
  schemaVersion: z.literal(MARKETPLACE_SCHEMA_VERSION),
  metadata: metadataSchema,
  agents: z.array(manifestAgentSchema).min(1, "Manifest must include at least one agent."),
}).strict().superRefine((manifest, ctx) => {
  const seen = new Set<string>();
  for (const agent of manifest.agents) {
    if (seen.has(agent.localKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agents"],
        message: `Duplicate agent localKey: ${agent.localKey}`,
      });
    }
    seen.add(agent.localKey);
  }
});

export type MarketplaceManifest = z.infer<typeof manifestSchema>;
export type MarketplaceManifestAgent = MarketplaceManifest["agents"][number];
export type MarketplaceManifestSummary = {
  schemaVersion: typeof MARKETPLACE_SCHEMA_VERSION;
  slug: string;
  name: string;
  description?: string;
  author?: string;
  license?: string;
  version?: string;
  tags: string[];
  agentCount: number;
  agents: Array<{
    localKey: string;
    name: string;
    description?: string;
    model: string;
    tools: string[];
    memoryEnabled: boolean;
  }>;
};

export const bundledMarketplaceCatalog: MarketplaceManifest[] = [
  {
    schemaVersion: MARKETPLACE_SCHEMA_VERSION,
    metadata: {
      slug: "research-copilot",
      name: "Research Copilot",
      description: "Local research assistant for structured notes, citations, and follow-up questions.",
      author: "AgentHub",
      license: "MIT",
      version: "1.0.0",
      tags: ["research", "writing", "local-first"],
    },
    agents: [
      {
        localKey: "research-analyst",
        name: "Research Analyst",
        description: "Breaks broad topics into grounded findings and concise summaries.",
        avatar: "research",
        systemPrompt: "You are a local-first research analyst. Ask clarifying questions only when blocked, separate observed facts from inference, and produce concise findings with source notes when provided.",
        tools: ["datetime"],
      },
    ],
  },
  {
    schemaVersion: MARKETPLACE_SCHEMA_VERSION,
    metadata: {
      slug: "developer-utility-pack",
      name: "Developer Utility Pack",
      description: "Two practical agents for code reasoning and quick calculations.",
      author: "AgentHub",
      license: "MIT",
      version: "1.0.0",
      tags: ["development", "tools", "productivity"],
    },
    agents: [
      {
        localKey: "code-reviewer",
        name: "Local Code Reviewer",
        description: "Reviews pasted code for correctness, edge cases, and maintainability.",
        avatar: "dev",
        systemPrompt: "You are a pragmatic local code reviewer. Prioritize bugs, regressions, unsafe assumptions, and missing tests. Keep summaries brief and actionable.",
        tools: ["datetime", "read_file"],
      },
      {
        localKey: "calculation-helper",
        name: "Calculation Helper",
        description: "Solves quantitative checks and explains assumptions.",
        avatar: "calc",
        systemPrompt: "You are a careful calculation assistant. State formulas, validate units, use calculator when useful, and flag uncertain assumptions.",
        tools: ["calculator"],
      },
    ],
  },
  {
    schemaVersion: MARKETPLACE_SCHEMA_VERSION,
    metadata: {
      slug: "daily-operator",
      name: "Daily Operator",
      description: "Personal planning and decision support agents that stay local.",
      author: "AgentHub",
      license: "MIT",
      version: "1.0.0",
      tags: ["planning", "productivity", "local-first"],
    },
    agents: [
      {
        localKey: "daily-planner",
        name: "Daily Planner",
        description: "Turns goals into a realistic local task plan.",
        avatar: "plan",
        systemPrompt: "You are a grounded daily planning assistant. Convert goals into sequenced actions, call out constraints, and keep plans realistic for today.",
        tools: ["datetime"],
      },
    ],
  },
].map((manifest) => manifestSchema.parse(manifest));

export function parseMarketplaceManifest(input: unknown): MarketplaceManifest {
  return manifestSchema.parse(input);
}

export function summarizeMarketplaceManifest(manifest: MarketplaceManifest): MarketplaceManifestSummary {
  return {
    schemaVersion: manifest.schemaVersion,
    slug: manifest.metadata.slug,
    name: manifest.metadata.name,
    description: manifest.metadata.description,
    author: manifest.metadata.author,
    license: manifest.metadata.license,
    version: manifest.metadata.version,
    tags: manifest.metadata.tags,
    agentCount: manifest.agents.length,
    agents: manifest.agents.map((agent) => ({
      localKey: agent.localKey,
      name: agent.name,
      description: agent.description,
      model: agent.model,
      tools: agent.tools,
      memoryEnabled: agent.memoryEnabled,
    })),
  };
}

export function getBundledCatalogItems() {
  return bundledMarketplaceCatalog.map((manifest) => ({
    summary: summarizeMarketplaceManifest(manifest),
    manifest,
  }));
}

export function findBundledCatalogItem(slug: string) {
  return bundledMarketplaceCatalog.find((manifest) => manifest.metadata.slug === slug) || null;
}

export function createAgentExportManifest(agent: {
  name: string;
  description: string | null;
  avatar: string | null;
  systemPrompt: string;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  tools: string | null;
  memoryEnabled: boolean | null;
}): MarketplaceManifest {
  const safeLocalKey = agent.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "exported-agent";
  const parsedTools = parseExportedTools(agent.tools);

  return parseMarketplaceManifest({
    schemaVersion: MARKETPLACE_SCHEMA_VERSION,
    metadata: {
      slug: safeLocalKey,
      name: agent.name,
      description: agent.description || undefined,
      author: "Local AgentHub",
      version: "1.0.0",
      tags: ["exported", "local-first"],
    },
    agents: [{
      localKey: safeLocalKey,
      name: agent.name,
      description: agent.description || undefined,
      avatar: agent.avatar || undefined,
      systemPrompt: agent.systemPrompt,
      model: agent.model || DEFAULT_MARKETPLACE_MODEL,
      temperature: agent.temperature ?? 0.7,
      maxTokens: agent.maxTokens ?? 4096,
      tools: parsedTools,
      memoryEnabled: agent.memoryEnabled ?? true,
    }],
  });
}

function parseExportedTools(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((tool): tool is string => (SUPPORTED_MARKETPLACE_TOOLS as readonly string[]).includes(tool));
  } catch {
    return [];
  }
}

import { getProviderCatalogEntry } from "./catalog";
import { splitQualifiedModelId } from "./registry";
import type { ProviderHealth } from "./types";

export const routeStrategies = [
  "fixed",
  "local-first",
  "speed-first",
  "cost-first",
  "reasoning-first",
  "fallback-chain",
] as const;

export type RouteStrategy = (typeof routeStrategies)[number];

export interface RoutePolicy {
  strategy?: RouteStrategy | null;
  fallbackModelIds?: string[] | string | null;
}

export interface RouteAgentConfig {
  model?: string | null;
  routeStrategy?: RouteStrategy | string | null;
  fallbackModelIds?: string[] | string | null;
}

export interface ResolveRouteInput {
  requestedModel?: string | null;
  agent?: RouteAgentConfig | null;
  providerHealth?: ProviderHealth[];
  policy?: RoutePolicy | null;
}

export interface RouteCandidate {
  modelId: string;
  providerId: string;
  providerName?: string;
  providerType: "local" | "cloud" | "unknown";
  healthy: boolean;
  latency: number | null;
  estimatedCostRank: number;
  reasoningCapable: boolean;
}

export interface RouteDecision {
  strategy: RouteStrategy;
  requestedModelId: string;
  modelId: string;
  providerId: string;
  fallbackModelIds: string[];
  candidates: RouteCandidate[];
  reason: string;
}

const DEFAULT_MODEL_ID = "ollama:qwen2.5:7b";

const COST_RANK_BY_PROVIDER: Record<string, number> = {
  ollama: 0,
  lmstudio: 0,
  vllm: 0,
  groq: 1,
  deepseek: 2,
  qwen: 2,
  zhipu: 2,
  together: 3,
  fireworks: 3,
  huggingface: 3,
  openrouter: 4,
  "vercel-ai-gateway": 4,
  newapi: 4,
  aihubmix: 4,
  perplexity: 5,
  xai: 6,
  gemini: 7,
  openai: 8,
  "azure-openai": 8,
  anthropic: 9,
  "github-copilot": 10,
  "aws-bedrock": 10,
};

function normalizeStrategy(strategy?: RouteStrategy | string | null): RouteStrategy {
  return routeStrategies.includes(strategy as RouteStrategy) ? (strategy as RouteStrategy) : "fixed";
}

function parseFallbackModelIds(value?: string[] | string | null): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Fall through to comma/newline parsing.
  }

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueModelIds(modelIds: string[]): string[] {
  return [...new Set(modelIds.map((modelId) => modelId.trim()).filter(Boolean))];
}

function candidateFor(modelId: string, healthByProviderId: Map<string, ProviderHealth>): RouteCandidate {
  const { providerId } = splitQualifiedModelId(modelId);
  const catalogEntry = getProviderCatalogEntry(providerId);
  const health = healthByProviderId.get(providerId);
  const isHealthy = health ? health.status === "healthy" : false;

  return {
    modelId,
    providerId,
    providerName: health?.name ?? catalogEntry?.name,
    providerType: catalogEntry?.type ?? "unknown",
    healthy: isHealthy,
    latency: typeof health?.latency === "number" && health.latency >= 0 ? health.latency : null,
    estimatedCostRank: COST_RANK_BY_PROVIDER[providerId] ?? 50,
    reasoningCapable: catalogEntry?.capabilities.includes("reasoning") ?? false,
  };
}

function firstHealthy(candidates: RouteCandidate[]): RouteCandidate | undefined {
  return candidates.find((candidate) => candidate.healthy);
}

function withFallback(
  candidate: RouteCandidate | undefined,
  requested: RouteCandidate,
  strategy: RouteStrategy,
  reason: string,
): RouteDecision {
  const selected = candidate ?? requested;
  return {
    strategy,
    requestedModelId: requested.modelId,
    modelId: selected.modelId,
    providerId: selected.providerId,
    fallbackModelIds: [],
    candidates: [],
    reason: candidate ? reason : "No healthy route candidate was available; keeping the requested model.",
  };
}

export function resolveRoute(input: ResolveRouteInput): RouteDecision {
  const requestedModelId = input.requestedModel || input.agent?.model || DEFAULT_MODEL_ID;
  const fallbackModelIds = uniqueModelIds([
    ...parseFallbackModelIds(input.policy?.fallbackModelIds),
    ...parseFallbackModelIds(input.agent?.fallbackModelIds),
  ]).filter((modelId) => modelId !== requestedModelId);
  const strategy = normalizeStrategy(input.policy?.strategy ?? input.agent?.routeStrategy);
  const healthByProviderId = new Map((input.providerHealth ?? []).map((health) => [health.id, health]));
  const candidates = uniqueModelIds([requestedModelId, ...fallbackModelIds]).map((modelId) =>
    candidateFor(modelId, healthByProviderId),
  );
  const requested = candidates[0] ?? candidateFor(DEFAULT_MODEL_ID, healthByProviderId);
  let selected: RouteCandidate | undefined;
  let reason = "";

  switch (strategy) {
    case "fixed":
      selected = requested;
      reason = "Fixed strategy selected the requested model.";
      break;
    case "local-first":
      selected =
        candidates.find((candidate) => candidate.healthy && candidate.providerType === "local") ??
        firstHealthy(candidates);
      reason =
        selected?.providerType === "local"
          ? "Local-first strategy selected a healthy local provider."
          : "Local-first strategy found no healthy local provider and used the first healthy fallback.";
      break;
    case "speed-first":
      selected = [...candidates]
        .filter((candidate) => candidate.healthy)
        .sort((a, b) => (a.latency ?? Number.MAX_SAFE_INTEGER) - (b.latency ?? Number.MAX_SAFE_INTEGER))[0];
      reason = "Speed-first strategy selected the lowest-latency healthy provider.";
      break;
    case "cost-first":
      selected = [...candidates]
        .filter((candidate) => candidate.healthy)
        .sort((a, b) => a.estimatedCostRank - b.estimatedCostRank)[0];
      reason = "Cost-first strategy selected the lowest estimated cost provider.";
      break;
    case "reasoning-first":
      selected =
        candidates.find((candidate) => candidate.healthy && candidate.reasoningCapable) ?? firstHealthy(candidates);
      reason = selected?.reasoningCapable
        ? "Reasoning-first strategy selected a healthy reasoning-capable provider."
        : "Reasoning-first strategy found no healthy reasoning provider and used the first healthy fallback.";
      break;
    case "fallback-chain":
      selected = firstHealthy(candidates);
      reason = "Fallback-chain strategy selected the first healthy candidate.";
      break;
  }

  const decision = withFallback(selected, requested, strategy, reason);
  return {
    ...decision,
    fallbackModelIds,
    candidates,
  };
}

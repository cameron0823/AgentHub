import { getProviderCatalogEntry, type ProviderCapability } from "./catalog";
import { splitQualifiedModelId } from "./registry";

export type NormalizedModelCapability = "chat" | "vision" | "tools" | "embeddings" | "reasoning" | "imageGeneration";

const VISION_MODEL_HINTS = [
  "gpt-4o",
  "gpt-4.1",
  "vision",
  "llava",
  "bakllava",
  "gemini",
  "claude-3",
  "claude-sonnet",
  "claude-opus",
  "kimi-latest",
  "kimi-k2",
  "vl",
];

const NON_VISION_MODEL_HINTS = ["o1", "o3", "o3-mini", "haiku", "gpt-5.4-nano", "gpt-5-mini"];

function normalizeProviderCapability(capability: ProviderCapability): NormalizedModelCapability | undefined {
  if (capability === "toolCalling") return "tools";
  if (
    capability === "chat" ||
    capability === "vision" ||
    capability === "embeddings" ||
    capability === "reasoning" ||
    capability === "imageGeneration"
  ) {
    return capability;
  }
  return undefined;
}

function hasHint(modelId: string, hints: string[]) {
  const normalized = modelId.toLowerCase();
  return hints.some((hint) => normalized.includes(hint));
}

export function inferModelCapabilities(modelId: string): NormalizedModelCapability[] {
  const { providerId, model } = splitQualifiedModelId(modelId);
  const catalogEntry = getProviderCatalogEntry(providerId);
  const capabilities = new Set<NormalizedModelCapability>(["chat"]);

  for (const capability of catalogEntry?.capabilities ?? []) {
    const normalized = normalizeProviderCapability(capability);
    if (normalized) capabilities.add(normalized);
  }

  const qualifiedModel = `${providerId}:${model}`;
  if (hasHint(qualifiedModel, VISION_MODEL_HINTS)) {
    capabilities.add("vision");
  }
  if (hasHint(qualifiedModel, NON_VISION_MODEL_HINTS) && !hasHint(qualifiedModel, ["gpt-4o", "gemini"])) {
    capabilities.delete("vision");
  }

  return Array.from(capabilities);
}

export function modelSupportsCapability(modelId: string, capability: NormalizedModelCapability): boolean {
  return inferModelCapabilities(modelId).includes(capability);
}

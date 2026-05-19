import type { ModelProvider, ProviderHealth, ModelInfo } from "./types";
import { createProviderFromCatalogCredential, type ProviderCredentialConfig } from "./factories";
import { providerCatalog } from "./catalog";
import { OllamaProvider } from "./providers/ollama";
import { LMStudioProvider } from "./providers/lmstudio";
import { VLLMProvider } from "./providers/vllm";
import { A1111Provider, ComfyUIProvider, FasterWhisperProvider, PiperProvider } from "./providers/local-media";

export const DEFAULT_QUALIFIED_MODEL_ID = "ollama:qwen2.5:7b";
export const LOCAL_PROVIDER_IDS = [
  "ollama",
  "lmstudio",
  "vllm",
  "piper",
  "faster-whisper",
  "comfyui",
  "a1111",
] as const;

export type LocalProviderId = (typeof LOCAL_PROVIDER_IDS)[number];

export interface QualifiedModelResolution {
  provider: ModelProvider;
  providerId: string;
  model: string;
  qualifiedModelId: string;
}

export function qualifyModelId(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

export function splitQualifiedModelId(modelId: string): { providerId: string; model: string } {
  const [providerId, ...modelParts] = modelId.split(":");
  if (!providerId || modelParts.length === 0) {
    return { providerId: "ollama", model: modelId };
  }
  return { providerId, model: modelParts.join(":") };
}

export type CredentialConfig = ProviderCredentialConfig;

export function createCloudProvider(config: CredentialConfig): ModelProvider | undefined {
  return createProviderFromCatalogCredential(config);
}

export function createDefaultLocalProviders(): ModelProvider[] {
  return [
    new OllamaProvider(),
    new LMStudioProvider(),
    new VLLMProvider(),
    new PiperProvider(),
    new FasterWhisperProvider(),
    new ComfyUIProvider(),
    new A1111Provider(),
  ];
}

export class ProviderRegistry {
  private providers = new Map<string, ModelProvider>();

  constructor() {
    for (const provider of createDefaultLocalProviders()) {
      this.register(provider);
    }
  }

  register(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(id: string): void {
    this.providers.delete(id);
  }

  get(id: string): ModelProvider | undefined {
    return this.providers.get(id);
  }

  list(): ModelProvider[] {
    return Array.from(this.providers.values());
  }

  listLocalProviders(): ModelProvider[] {
    return this.list().filter((provider) => provider.type === "local");
  }

  /** @deprecated Mutates shared registry — use forUser() for per-request isolation. */
  loadUserCredentials(credentials: Array<CredentialConfig & { expiresAt?: Date | null }>) {
    for (const [id, provider] of this.providers) {
      if (provider.type === "cloud") {
        this.providers.delete(id);
      }
    }

    for (const config of credentials) {
      if (config.authType === "oauth" && config.expiresAt && config.expiresAt < new Date()) {
        continue;
      }
      const provider = createCloudProvider(config);
      if (provider) {
        this.register(provider);
      }
    }
  }

  forUser(credentials: Array<CredentialConfig & { expiresAt?: Date | null }>): ProviderRegistry {
    const derived = new ProviderRegistry();
    for (const config of credentials) {
      if (config.authType === "oauth" && config.expiresAt && config.expiresAt < new Date()) {
        continue;
      }
      const provider = createCloudProvider(config);
      if (provider) {
        derived.register(provider);
      }
    }
    return derived;
  }

  async healthCheckAll(): Promise<ProviderHealth[]> {
    return Promise.all(this.list().map(async (p) => p.healthCheck()));
  }

  async listAllModels(): Promise<(ModelInfo & { providerId: string; providerName: string })[]> {
    const results = await Promise.all(
      this.list().map(async (provider) => {
        try {
          const models = await provider.listModels();
          return models.map((m) => ({
            ...m,
            id: qualifyModelId(provider.id, m.id),
            name: m.name,
            providerId: provider.id,
            providerName: provider.name,
          }));
        } catch {
          return [];
        }
      }),
    );
    return results.flat();
  }

  resolveModel(modelId: string): QualifiedModelResolution {
    const parsed = splitQualifiedModelId(modelId);
    const hasKnownProviderPrefix = Boolean(this.get(parsed.providerId));
    const providerId = hasKnownProviderPrefix ? parsed.providerId : "ollama";
    const model = hasKnownProviderPrefix ? parsed.model : modelId;
    const provider = this.get(providerId);
    if (!provider) throw new Error(`Provider not available: ${providerId}`);

    return {
      provider,
      providerId,
      model,
      qualifiedModelId: qualifyModelId(providerId, model),
    };
  }
}

export const providerRegistry = new ProviderRegistry();

const _paidPlanProviderIds = new Set(providerCatalog.filter((e) => e.type === "cloud").map((e) => e.id));

export function isPaidPlanRequired(providerId: string): boolean {
  return _paidPlanProviderIds.has(providerId);
}

export function checkProviderPlanAccess(providerId: string, plan: string): { allowed: boolean; requiredPlan: string } {
  if (!isPaidPlanRequired(providerId)) return { allowed: true, requiredPlan: "free" };
  const allowed = plan === "pro" || plan === "team" || plan === "enterprise";
  return { allowed, requiredPlan: "pro" };
}

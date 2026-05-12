import type { ModelProvider, ProviderHealth, ModelInfo } from "./types";
import { OllamaProvider } from "./providers/ollama";
import { LMStudioProvider } from "./providers/lmstudio";
import { VLLMProvider } from "./providers/vllm";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { MoonshotProvider } from "./providers/moonshot";
import { GitHubCopilotProvider } from "./providers/github-copilot";

export const DEFAULT_QUALIFIED_MODEL_ID = "ollama:qwen2.5:7b";

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

export interface CredentialConfig {
  providerId: string;
  authType: "api_key" | "oauth";
  apiKey?: string;
  baseUrl?: string;
  accessToken?: string;
}

export function createCloudProvider(config: CredentialConfig): ModelProvider | undefined {
  switch (config.providerId) {
    case "openai":
      if (!config.apiKey) return undefined;
      return new OpenAIProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl });
    case "anthropic":
      if (!config.apiKey) return undefined;
      return new AnthropicProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl });
    case "gemini":
      if (!config.apiKey) return undefined;
      return new GeminiProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl });
    case "moonshot":
      if (!config.apiKey) return undefined;
      return new MoonshotProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl });
    case "github-copilot":
      if (!config.accessToken) return undefined;
      return new GitHubCopilotProvider(config.accessToken);
    default:
      return undefined;
  }
}

export class ProviderRegistry {
  private providers = new Map<string, ModelProvider>();

  constructor() {
    this.register(new OllamaProvider());
    this.register(new LMStudioProvider());
    this.register(new VLLMProvider());
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

  async healthCheckAll(): Promise<ProviderHealth[]> {
    return Promise.all(
      this.list().map(async (p) => p.healthCheck())
    );
  }

  async listAllModels(): Promise<(ModelInfo & { providerId: string; providerName: string })[]> {
    const results: (ModelInfo & { providerId: string; providerName: string })[] = [];
    for (const provider of this.list()) {
      try {
        const models = await provider.listModels();
        for (const m of models) {
          results.push({
            ...m,
            id: qualifyModelId(provider.id, m.id),
            name: m.name,
            providerId: provider.id,
            providerName: provider.name,
          });
        }
      } catch {
        // Skip unavailable providers
      }
    }
    return results;
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

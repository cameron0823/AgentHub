import type { ModelProvider, ProviderHealth, ModelInfo } from "./types";
import { OllamaProvider } from "./providers/ollama";

export class ProviderRegistry {
  private providers = new Map<string, ModelProvider>();

  constructor() {
    this.register(new OllamaProvider());
  }

  register(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): ModelProvider | undefined {
    return this.providers.get(id);
  }

  list(): ModelProvider[] {
    return Array.from(this.providers.values());
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
          results.push({ ...m, providerId: provider.id, providerName: provider.name });
        }
      } catch {
        // Skip unavailable providers
      }
    }
    return results;
  }
}

export const providerRegistry = new ProviderRegistry();

import type { ModelProvider } from "./types";
import { getProviderCatalogEntry } from "./catalog";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { GitHubCopilotProvider } from "./providers/github-copilot";
import { MoonshotProvider } from "./providers/moonshot";
import { OpenAIProvider } from "./providers/openai";
import { OpenAICompatibleProvider } from "./providers/openai-compatible";

export interface ProviderCredentialConfig {
  providerId: string;
  authType: "api_key" | "oauth";
  apiKey?: string;
  baseUrl?: string;
  accessToken?: string;
}

function credentialBaseUrl(config: ProviderCredentialConfig, defaultBaseUrl?: string) {
  return config.baseUrl?.trim() || defaultBaseUrl;
}

export function createProviderFromCatalogCredential(config: ProviderCredentialConfig): ModelProvider | undefined {
  const catalogEntry = getProviderCatalogEntry(config.providerId);
  if (!catalogEntry || catalogEntry.type !== "cloud") return undefined;

  switch (catalogEntry.factory) {
    case "openai":
      if (!config.apiKey) return undefined;
      return new OpenAIProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl });
    case "anthropic":
      if (!config.apiKey) return undefined;
      return new AnthropicProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl });
    case "gemini":
      if (config.authType === "oauth") {
        if (!config.accessToken) return undefined;
        return new GeminiProvider({ authType: "oauth", accessToken: config.accessToken, baseUrl: config.baseUrl });
      }
      if (!config.apiKey) return undefined;
      return new GeminiProvider({ authType: "api_key", apiKey: config.apiKey, baseUrl: config.baseUrl });
    case "moonshot":
      if (!config.apiKey) return undefined;
      return new MoonshotProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl });
    case "github-copilot":
      if (!config.accessToken) return undefined;
      return new GitHubCopilotProvider(config.accessToken);
    case "openai-compatible": {
      if (!config.apiKey) return undefined;
      const baseUrl = credentialBaseUrl(config, catalogEntry.defaultBaseUrl);
      if (!baseUrl) return undefined;
      return new OpenAICompatibleProvider({
        id: catalogEntry.id,
        name: catalogEntry.name,
        baseUrl,
        apiKey: config.apiKey,
        apiPath: catalogEntry.apiPath,
        type: "cloud",
      });
    }
    default:
      return undefined;
  }
}

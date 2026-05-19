import type { ModelProvider } from "./types";

export type ProviderAuthType = "none" | "api_key" | "oauth";
export type ProviderBaseUrlMode = "fixed" | "optional" | "required";
export type ProviderModelListMode = "local" | "dynamic" | "static" | "manual";
export type ProviderFactory =
  | "ollama"
  | "lmstudio"
  | "vllm"
  | "openai"
  | "anthropic"
  | "gemini"
  | "moonshot"
  | "github-copilot"
  | "openai-compatible"
  | "piper"
  | "faster-whisper"
  | "comfyui"
  | "a1111"
  | "none";

export type ProviderCapability =
  | "chat"
  | "vision"
  | "toolCalling"
  | "embeddings"
  | "imageGeneration"
  | "tts"
  | "stt"
  | "reasoning";

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  type: ModelProvider["type"];
  authType: ProviderAuthType;
  capabilities: ProviderCapability[];
  baseUrlMode: ProviderBaseUrlMode;
  modelListMode: ProviderModelListMode;
  factory: ProviderFactory;
  defaultBaseUrl?: string;
  apiPath?: string;
  envVar?: string;
  aliases?: string[];
  defaultModels?: string[];
  enabledByDefault?: boolean;
}

export const providerCatalog: ProviderCatalogEntry[] = [
  {
    id: "ollama",
    name: "Ollama",
    type: "local",
    authType: "none",
    capabilities: ["chat", "vision", "embeddings", "toolCalling"],
    baseUrlMode: "optional",
    modelListMode: "local",
    factory: "ollama",
    defaultBaseUrl: "http://localhost:11434",
    envVar: "OLLAMA_URL",
    enabledByDefault: true,
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    type: "local",
    authType: "none",
    capabilities: ["chat", "toolCalling"],
    baseUrlMode: "optional",
    modelListMode: "local",
    factory: "lmstudio",
    defaultBaseUrl: "http://localhost:1234",
    envVar: "LMSTUDIO_URL",
    aliases: ["lm-studio"],
    enabledByDefault: true,
  },
  {
    id: "vllm",
    name: "vLLM",
    type: "local",
    authType: "none",
    capabilities: ["chat", "toolCalling"],
    baseUrlMode: "optional",
    modelListMode: "local",
    factory: "vllm",
    defaultBaseUrl: "http://localhost:8000",
    envVar: "VLLM_URL",
    enabledByDefault: true,
  },
  {
    id: "piper",
    name: "Piper TTS",
    type: "local",
    authType: "none",
    capabilities: ["tts"],
    baseUrlMode: "optional",
    modelListMode: "local",
    factory: "piper",
    defaultBaseUrl: "http://localhost:10200",
    envVar: "PIPER_TTS_URL",
    enabledByDefault: true,
  },
  {
    id: "faster-whisper",
    name: "faster-whisper STT",
    type: "local",
    authType: "none",
    capabilities: ["stt"],
    baseUrlMode: "optional",
    modelListMode: "local",
    factory: "faster-whisper",
    defaultBaseUrl: "http://localhost:10300",
    envVar: "FASTER_WHISPER_URL",
    enabledByDefault: true,
  },
  {
    id: "comfyui",
    name: "ComfyUI",
    type: "local",
    authType: "none",
    capabilities: ["imageGeneration"],
    baseUrlMode: "optional",
    modelListMode: "local",
    factory: "comfyui",
    defaultBaseUrl: "http://localhost:8188",
    envVar: "COMFYUI_URL",
    enabledByDefault: true,
  },
  {
    id: "a1111",
    name: "AUTOMATIC1111",
    type: "local",
    authType: "none",
    capabilities: ["imageGeneration"],
    baseUrlMode: "optional",
    modelListMode: "local",
    factory: "a1111",
    defaultBaseUrl: "http://localhost:7860",
    envVar: "A1111_URL",
    enabledByDefault: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "vision", "toolCalling", "embeddings", "imageGeneration", "tts", "stt", "reasoning"],
    baseUrlMode: "optional",
    modelListMode: "dynamic",
    factory: "openai",
    defaultBaseUrl: "https://api.openai.com",
    enabledByDefault: true,
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "vision", "toolCalling", "reasoning"],
    baseUrlMode: "optional",
    modelListMode: "static",
    factory: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    enabledByDefault: true,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "vision", "toolCalling", "embeddings", "reasoning"],
    baseUrlMode: "optional",
    modelListMode: "dynamic",
    factory: "gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    enabledByDefault: true,
  },
  {
    id: "moonshot",
    name: "Moonshot AI (Kimi)",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "vision", "toolCalling", "reasoning"],
    baseUrlMode: "optional",
    modelListMode: "dynamic",
    factory: "moonshot",
    defaultBaseUrl: "https://api.moonshot.cn",
    enabledByDefault: true,
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    type: "cloud",
    authType: "oauth",
    capabilities: ["chat", "vision", "toolCalling", "reasoning"],
    baseUrlMode: "fixed",
    modelListMode: "dynamic",
    factory: "github-copilot",
    defaultBaseUrl: "https://api.githubcopilot.com",
    enabledByDefault: false,
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "vision", "toolCalling", "embeddings", "reasoning"],
    baseUrlMode: "required",
    modelListMode: "manual",
    factory: "openai-compatible",
  },
  {
    id: "aws-bedrock",
    name: "AWS Bedrock",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "vision", "toolCalling", "embeddings", "reasoning"],
    baseUrlMode: "required",
    modelListMode: "manual",
    factory: "none",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "vision", "toolCalling", "reasoning"],
    baseUrlMode: "optional",
    modelListMode: "dynamic",
    factory: "openai-compatible",
    defaultBaseUrl: "https://openrouter.ai/api",
  },
  {
    id: "together",
    name: "Together AI",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "vision", "toolCalling", "embeddings"],
    baseUrlMode: "optional",
    modelListMode: "dynamic",
    factory: "openai-compatible",
    defaultBaseUrl: "https://api.together.xyz",
  },
  {
    id: "groq",
    name: "Groq",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "toolCalling"],
    baseUrlMode: "optional",
    modelListMode: "dynamic",
    factory: "openai-compatible",
    defaultBaseUrl: "https://api.groq.com/openai",
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "vision", "toolCalling", "embeddings"],
    baseUrlMode: "optional",
    modelListMode: "dynamic",
    factory: "openai-compatible",
    defaultBaseUrl: "https://api.fireworks.ai/inference",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "toolCalling", "reasoning"],
    baseUrlMode: "optional",
    modelListMode: "dynamic",
    factory: "openai-compatible",
    defaultBaseUrl: "https://api.deepseek.com",
  },
  {
    id: "qwen",
    name: "Qwen",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "vision", "toolCalling", "embeddings", "reasoning"],
    baseUrlMode: "optional",
    modelListMode: "dynamic",
    factory: "openai-compatible",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode",
  },
  {
    id: "zhipu",
    name: "Zhipu AI",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "vision", "toolCalling", "embeddings", "reasoning"],
    baseUrlMode: "optional",
    modelListMode: "dynamic",
    factory: "openai-compatible",
    defaultBaseUrl: "https://open.bigmodel.cn",
    apiPath: "/api/paas/v4",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "embeddings"],
    baseUrlMode: "required",
    modelListMode: "manual",
    factory: "openai-compatible",
  },
  {
    id: "xai",
    name: "xAI",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "vision", "toolCalling", "reasoning"],
    baseUrlMode: "optional",
    modelListMode: "dynamic",
    factory: "openai-compatible",
    defaultBaseUrl: "https://api.x.ai",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "reasoning"],
    baseUrlMode: "optional",
    modelListMode: "dynamic",
    factory: "openai-compatible",
    defaultBaseUrl: "https://api.perplexity.ai",
  },
  {
    id: "vercel-ai-gateway",
    name: "Vercel AI Gateway",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "vision", "toolCalling", "reasoning"],
    baseUrlMode: "optional",
    modelListMode: "dynamic",
    factory: "openai-compatible",
    defaultBaseUrl: "https://ai-gateway.vercel.sh",
  },
  {
    id: "newapi",
    name: "NewAPI",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "vision", "toolCalling", "embeddings", "reasoning"],
    baseUrlMode: "required",
    modelListMode: "dynamic",
    factory: "openai-compatible",
  },
  {
    id: "aihubmix",
    name: "AIHubMix",
    type: "cloud",
    authType: "api_key",
    capabilities: ["chat", "vision", "toolCalling", "embeddings", "reasoning"],
    baseUrlMode: "optional",
    modelListMode: "dynamic",
    factory: "openai-compatible",
    defaultBaseUrl: "https://aihubmix.com",
  },
];

const providerCatalogById = new Map(
  providerCatalog.flatMap((provider) => [
    [provider.id, provider] as const,
    ...(provider.aliases ?? []).map((alias) => [alias, provider] as const),
  ]),
);

export function getProviderCatalogEntry(providerId: string): ProviderCatalogEntry | undefined {
  return providerCatalogById.get(providerId);
}

export function getCredentialProviderCatalog(): ProviderCatalogEntry[] {
  return providerCatalog.filter((provider) => provider.type === "cloud" && provider.authType !== "none");
}

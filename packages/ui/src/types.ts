export type ArtifactKind = "html" | "svg" | "css" | "react";

export interface ChatArtifact {
  id: string;
  title: string;
  kind: ArtifactKind;
  language: string;
  content: string;
  previewHtml: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  toolCallId?: string;
  toolName: string;
  result: unknown;
}

export type ModelCapability =
  | "chat"
  | "vision"
  | "tools"
  | "embeddings"
  | "reasoning"
  | "imageGeneration"
  | "tts"
  | "stt";

export interface ModelMetadata {
  id: string;
  name: string;
  providerId?: string;
  providerName?: string;
  providerStatus?: "healthy" | "unhealthy";
  providerLatency?: number;
  parameters?: string;
  capabilities?: ModelCapability[];
}

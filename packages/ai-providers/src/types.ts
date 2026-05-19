export type ContentPart = { type: "text"; text: string } | { type: "image_url"; url: string };

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentPart[];
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  size?: number;
  parameters?: string;
  capabilities: ("chat" | "vision" | "tools" | "embeddings" | "reasoning" | "imageGeneration" | "tts" | "stt")[];
}

export interface ChatOptions {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  tools?: Tool[];
  stream?: boolean;
  signal?: AbortSignal;
}

export interface ChatResponse {
  content: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ReasoningTimelineEvent {
  id: string;
  kind: "provider_reasoning" | "tool_decision" | "tool_execution" | "routing" | "checkpoint";
  title: string;
  content?: string;
  visibility: "provider-visible" | "metadata-only" | "redacted";
  startedAtMs?: number;
  durationMs?: number;
  toolName?: string;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatStreamChunk {
  type: "content" | "reasoning" | "reasoning_event" | "tool_call" | "done";
  content?: string;
  event?: ReasoningTimelineEvent;
  toolCall?: ToolCall;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface TextToSpeechOptions {
  text: string;
  model?: string;
  voice?: string;
  format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  speed?: number;
  signal?: AbortSignal;
}

export interface TextToSpeechResponse {
  audio: ArrayBuffer;
  mimeType: string;
  model: string;
  voice: string;
}

export interface SpeechToTextOptions {
  audio: ArrayBuffer | Uint8Array | Blob;
  fileName?: string;
  mimeType?: string;
  model?: string;
  language?: string;
  prompt?: string;
  signal?: AbortSignal;
}

export interface SpeechToTextResponse {
  text: string;
  model: string;
  language?: string;
  durationSeconds?: number;
}

export interface ImageGenerationOptions {
  prompt: string;
  model?: string;
  size?: "256x256" | "512x512" | "1024x1024" | "1024x1536" | "1536x1024" | "1024x1792" | "1792x1024" | "auto" | string;
  quality?: "standard" | "hd" | "low" | "medium" | "high" | "auto";
  style?: "vivid" | "natural";
  n?: number;
  responseFormat?: "url" | "b64_json";
  signal?: AbortSignal;
}

export interface GeneratedImage {
  url?: string;
  b64Json?: string;
  dataUrl?: string;
  mimeType: string;
  revisedPrompt?: string;
  providerImageId?: string;
}

export interface ImageGenerationResponse {
  images: GeneratedImage[];
  model: string;
  prompt: string;
  providerId?: string;
}

export interface ProviderHealth {
  id: string;
  name: string;
  status: "healthy" | "unhealthy";
  latency: number;
}

export interface ModelProvider {
  readonly id: string;
  readonly name: string;
  readonly type: "local" | "cloud";

  listModels(): Promise<ModelInfo[]>;
  healthCheck(): Promise<ProviderHealth>;
  chat(options: ChatOptions): Promise<ChatResponse>;
  streamChat(options: ChatOptions): AsyncIterable<ChatStreamChunk>;
  embed?(texts: string[]): Promise<number[][]>;
  textToSpeech?(options: TextToSpeechOptions): Promise<TextToSpeechResponse>;
  speechToText?(options: SpeechToTextOptions): Promise<SpeechToTextResponse>;
  createImage?(options: ImageGenerationOptions): Promise<ImageGenerationResponse>;
}

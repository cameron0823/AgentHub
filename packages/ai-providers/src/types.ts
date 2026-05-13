export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; url: string };

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
  capabilities: ("chat" | "vision" | "tools" | "embeddings" | "reasoning")[];
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

export interface ChatStreamChunk {
  type: "content" | "reasoning" | "tool_call" | "done";
  content?: string;
  toolCall?: ToolCall;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
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
}

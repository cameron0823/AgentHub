import { Message, ChatStreamChunk } from "@agenthub/ai-providers";

export interface AgentOptions {
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  maxToolIterations?: number;
  toolTimeoutMs?: number;
}

export interface ExtraTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface RunOptions {
  sessionId: string;
  messages: Message[];
  tools?: string[];
  extraTools?: ExtraTool[];
  signal?: AbortSignal;
}

export type AgentStreamChunk = ChatStreamChunk | {
  type: "tool_result";
  toolName: string;
  toolCallId?: string;
  result: any;
};

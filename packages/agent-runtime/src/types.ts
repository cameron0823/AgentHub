import { Message, ChatStreamChunk, type ReasoningTimelineEvent, type ProviderRegistry } from "@agenthub/ai-providers";
import type { ApprovalDecision, ApprovalHandler, ApprovalPolicy, ApprovalRequest } from "./approvals";
import type { ToolExecutionContext } from "./tools/registry";

export interface AgentOptions {
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  maxToolIterations?: number;
  toolTimeoutMs?: number;
  /** Per-request provider registry. Falls back to global providerRegistry when omitted. */
  registry?: ProviderRegistry;
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
  toolContext?: ToolExecutionContext;
  deniedTools?: string[];
  approval?: ApprovalHandler;
  approvalPolicy?: ApprovalPolicy;
  signal?: AbortSignal;
}

export type AgentStreamChunk = ChatStreamChunk | {
  type: "reasoning_event";
  event: ReasoningTimelineEvent;
} | {
  type: "tool_result";
  toolName: string;
  toolCallId?: string;
  result: any;
} | {
  type: "approval_request";
  approvalId: string;
  request: ApprovalRequest;
} | {
  type: "approval_result";
  approvalId: string;
  toolName?: string;
  decision: ApprovalDecision;
};

import type { AgentOptions, AgentStreamChunk } from "../types";
import type { Message } from "@agenthub/ai-providers";

export type OrchestrationPattern = "sequential" | "parallel" | "supervisor" | "debate" | "groupchat";

export interface OrchestratorAgent {
  id: string;
  name: string;
  role: string | null;
  sortOrder?: number | null;
  tools: string[];
  runtimeOptions: AgentOptions;
}

export interface GroupConfig {
  id: string;
  name: string;
  pattern: OrchestrationPattern;
  description?: string | null;
}

export interface AgentRunResult {
  agentId: string;
  agentName: string;
  output: string;
  chunks: AgentStreamChunk[];
  toolCalls?: Array<{
    name: string;
    arguments: string;
    result: string;
  }>;
}

// Base events shared across all patterns
interface BaseEvent {
  groupId: string;
}

export type OrchestratorEvent =
  // Group lifecycle events
  | (BaseEvent & { type: "group_start"; groupName: string; pattern: OrchestrationPattern; agentCount: number })
  | (BaseEvent & { type: "group_complete"; groupName: string; pattern: OrchestrationPattern; outputs: AgentRunResult[]; synthesis: string })

  // Agent lifecycle events
  | (BaseEvent & { type: "agent_start"; agentId: string; agentName: string; role: string | null })
  | (BaseEvent & { type: "agent_output"; agentId: string; agentName: string; chunk: AgentStreamChunk })
  | (BaseEvent & { type: "agent_complete"; agentId: string; agentName: string; output: string })

  // Supervisor pattern events
  | (BaseEvent & { type: "supervisor_start"; supervisor: string })
  | (BaseEvent & { type: "supervisor_thinking"; content: string })
  | (BaseEvent & { type: "supervisor_plan"; plan: string })
  | (BaseEvent & { type: "supervisor_review"; review: string })

  // HITL checkpoint event
  | (BaseEvent & { type: "hitl_checkpoint"; checkpointId: string; title: string; plan: string })

  // Debate pattern events
  | (BaseEvent & { type: "debate_start"; agents: string[]; rounds: number })
  | (BaseEvent & { type: "debate_round"; round: number; total: number })

  // GroupChat pattern events
  | (BaseEvent & { type: "groupchat_start"; agents: string[]; maxTurns: number })
  | (BaseEvent & { type: "groupchat_turn"; turn: number; maxTurns: number })

  // Error event
  | { type: "error"; groupId?: string; agentId?: string; error: string };

export interface OrchestratorRunOptions {
  group: GroupConfig;
  agents: OrchestratorAgent[];
  task: string;
  sessionId: string;
  messages?: Message[];
  streamToClient?: boolean;
  signal?: AbortSignal;
  /** Called at HITL checkpoints. Return true to proceed, false to cancel. */
  checkpoint?: (checkpointId: string, title: string, plan: string) => Promise<boolean>;
}

export type AgentRuntimeFactory = (agent: OrchestratorAgent) => {
  run(options: {
    sessionId: string;
    messages: Message[];
    tools?: string[];
    signal?: AbortSignal;
  }): AsyncGenerator<AgentStreamChunk>;
};

export interface Orchestrator {
  run(options: OrchestratorRunOptions): AsyncGenerator<OrchestratorEvent>;
}

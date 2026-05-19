export const HETEROGENEOUS_RUNNER_FEATURE_FLAG = "AGENTHUB_HETEROGENEOUS_ENABLED" as const;
export const HETEROGENEOUS_ALLOWED_COMMANDS_ENV = "AGENTHUB_HETERO_ALLOWED_COMMANDS" as const;
export const HETEROGENEOUS_WORKSPACE_ROOT_ENV = "AGENTHUB_HETERO_WORKSPACE_ROOT" as const;
export const HETEROGENEOUS_ALLOWED_ENV_KEYS_ENV = "AGENTHUB_HETERO_ALLOWED_ENV_KEYS" as const;

export type HeterogeneousAgentKind = "claude" | "codex" | "generic";
export type HeterogeneousRunStatus = "queued" | "running" | "success" | "error" | "cancelled" | "feature_disabled";

export interface HeterogeneousAgentProfile {
  id?: string;
  userId?: string;
  name: string;
  description?: string | null;
  kind: "claude" | "codex" | "generic";
  command: string;
  args: string[];
  workingDirectory?: string | null;
  env: Record<string, string>;
  isEnabled: boolean;
}

export interface HeterogeneousRunInput {
  prompt: string;
  args?: string[];
  stdin?: string;
}

export type HeterogeneousRunEvent =
  | { type: "status"; status: HeterogeneousRunStatus; message?: string }
  | { type: "stdout"; content: string }
  | { type: "stderr"; content: string }
  | { type: "exit"; exitCode: number | null; signal: NodeJS.Signals | null };

export interface HeterogeneousRunnerOptions {
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  allowedCommands?: string[];
  workspaceRoot?: string | null;
  allowedEnvKeys?: string[];
  timeoutMs?: number;
}

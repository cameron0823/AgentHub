import crypto from "node:crypto";

export type ApprovalKind = "tool_action" | "group_checkpoint";
export type ApprovalDecisionSource = "human" | "timeout" | "auto";

export interface ApprovalRequest {
  id: string;
  kind: ApprovalKind;
  sessionId: string;
  toolName?: string;
  actionName?: string;
  title: string;
  prompt: string;
  argsPreview?: string;
  policyReason: string;
  createdAt: string;
}

export interface ApprovalDecision {
  approved: boolean;
  reason?: string;
  source?: ApprovalDecisionSource;
}

export type ApprovalHandler = (request: ApprovalRequest) => Promise<ApprovalDecision | boolean>;

export interface ApprovalPolicy {
  enabled?: boolean;
  requireAllTools?: boolean;
  sensitiveTools?: string[];
  timeoutMs?: number;
}

export const DEFAULT_APPROVAL_TIMEOUT_MS = 300_000;

export const DEFAULT_SENSITIVE_TOOLS = [
  "execute_code",
  "exec_skill_script",
  "export_skill_file",
  "run_shell",
  "filesystem_write",
  "mcp_stdio",
] as const;

export function requiresApprovalForTool(toolName: string, policy: ApprovalPolicy = {}) {
  if (policy.enabled === false) return false;
  if (policy.requireAllTools) return true;
  const sensitiveTools = policy.sensitiveTools ?? [...DEFAULT_SENSITIVE_TOOLS];
  return sensitiveTools.includes(toolName);
}

export function previewApprovalArgs(args: unknown) {
  const raw = typeof args === "string" ? args : JSON.stringify(args);
  if (!raw) return "";
  return raw.length > 1_000 ? `${raw.slice(0, 1_000)}...` : raw;
}

export function createToolApprovalRequest(input: {
  sessionId: string;
  toolName: string;
  args: unknown;
  policyReason?: string;
}): ApprovalRequest {
  return {
    id: crypto.randomUUID(),
    kind: "tool_action",
    sessionId: input.sessionId,
    toolName: input.toolName,
    actionName: input.toolName,
    title: `Approve tool action: ${input.toolName}`,
    prompt: `Approve execution of ${input.toolName}?`,
    argsPreview: previewApprovalArgs(input.args),
    policyReason: input.policyReason ?? `${input.toolName} is configured as a sensitive tool.`,
    createdAt: new Date().toISOString(),
  };
}

export async function requestApproval(
  request: ApprovalRequest,
  handler: ApprovalHandler | undefined,
  timeoutMs = DEFAULT_APPROVAL_TIMEOUT_MS,
): Promise<ApprovalDecision> {
  if (!handler) {
    return { approved: false, reason: "Approval handler unavailable", source: "auto" };
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      handler(request),
      new Promise<ApprovalDecision>((resolve) => {
        timeout = setTimeout(() => {
          resolve({ approved: false, reason: "Approval timed out", source: "timeout" });
        }, timeoutMs);
      }),
    ]);

    if (typeof result === "boolean") {
      return { approved: result, source: "human" };
    }
    return { ...result, source: result.source ?? "human" };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

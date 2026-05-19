import { and, eq, gte } from "drizzle-orm";
import { db } from "./db";
import { credentialAuditLog, type McpServer } from "./db/schema";
import { appendCredentialAuditLog } from "./trust-engine";

export interface McpGovernancePolicy {
  enabled?: boolean;
  allowedTools?: string[];
  deniedTools?: string[];
  rateLimitPerMinute?: number;
  allowedHoursUtc?: { start: number; end: number } | number[];
  blockedPatterns?: string[];
}

export interface McpGovernanceDecision {
  allowed: boolean;
  reason: string;
}

export interface McpGovernanceContext {
  userId: string;
  agentId?: string | null;
  server: McpServer;
  toolName: string;
  args: Record<string, unknown>;
  now?: Date;
}

export interface EnforceMcpGovernanceInput extends McpGovernanceContext {
  callTool: () => Promise<unknown>;
}

function parsePolicy(server: McpServer): McpGovernancePolicy {
  const raw = server.governancePolicy;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as McpGovernancePolicy;
}

function normalizeList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
    : [];
}

function isInsideAllowedHours(allowedHoursUtc: McpGovernancePolicy["allowedHoursUtc"], now: Date) {
  if (!allowedHoursUtc) return true;
  const hour = now.getUTCHours();
  if (Array.isArray(allowedHoursUtc)) {
    return allowedHoursUtc.includes(hour);
  }
  const start = Math.max(0, Math.min(23, Math.floor(allowedHoursUtc.start)));
  const end = Math.max(0, Math.min(23, Math.floor(allowedHoursUtc.end)));
  if (start <= end) return hour >= start && hour <= end;
  return hour >= start || hour <= end;
}

function includesBlockedPattern(args: Record<string, unknown>, blockedPatterns: string[]) {
  if (blockedPatterns.length === 0) return null;
  const body = JSON.stringify(args).toLowerCase();
  return blockedPatterns.find((pattern) => body.includes(pattern.toLowerCase())) ?? null;
}

export function evaluateMcpGovernancePolicy(input: McpGovernanceContext): McpGovernanceDecision {
  if (!input.server.governanceEnabled) {
    return { allowed: true, reason: "Governance disabled for MCP server" };
  }

  const policy = parsePolicy(input.server);
  if (policy.enabled === false) {
    return { allowed: true, reason: "Governance policy disabled" };
  }

  const allowedTools = normalizeList(policy.allowedTools);
  const deniedTools = normalizeList(policy.deniedTools);
  const blockedPatterns = normalizeList(policy.blockedPatterns);

  if (allowedTools.length > 0 && !allowedTools.includes(input.toolName)) {
    return { allowed: false, reason: `Tool ${input.toolName} is not allowed by MCP governance policy` };
  }
  if (deniedTools.includes(input.toolName)) {
    return { allowed: false, reason: `Tool ${input.toolName} is denied by MCP governance policy` };
  }
  if (!isInsideAllowedHours(policy.allowedHoursUtc, input.now ?? new Date())) {
    return { allowed: false, reason: "MCP governance time window is closed" };
  }
  const blockedPattern = includesBlockedPattern(input.args, blockedPatterns);
  if (blockedPattern) {
    return { allowed: false, reason: `MCP governance blocked pattern: ${blockedPattern}` };
  }

  return { allowed: true, reason: "MCP governance policy allowed request" };
}

function auditToolName(server: McpServer, toolName: string) {
  return `mcp:${server.id}:${toolName}`;
}

export async function recordMcpGovernanceAuditEvent(
  input: McpGovernanceContext & {
    decision: McpGovernanceDecision;
    detail?: string;
  },
) {
  const decision = input.decision;
  await appendCredentialAuditLog({
    userId: input.userId,
    agentId: input.agentId ?? null,
    credentialId: null,
    tool: auditToolName(input.server, input.toolName),
    keyHint: input.server.name.slice(0, 8),
    outcome: decision.allowed ? "success" : "denied",
    detail: input.detail ?? `MCP Governance Bridge: ${decision.reason}`,
  });
}

async function enforceRateLimit(
  input: McpGovernanceContext,
  policy: McpGovernancePolicy,
): Promise<McpGovernanceDecision | null> {
  const rateLimitPerMinute = policy.rateLimitPerMinute;
  if (!input.server.governanceEnabled || !rateLimitPerMinute || rateLimitPerMinute < 1) return null;

  const since = new Date((input.now ?? new Date()).getTime() - 60_000);
  const recent = await db
    .select({ id: credentialAuditLog.id })
    .from(credentialAuditLog)
    .where(
      and(
        eq(credentialAuditLog.userId, input.userId),
        eq(credentialAuditLog.tool, auditToolName(input.server, input.toolName)),
        eq(credentialAuditLog.outcome, "success"),
        gte(credentialAuditLog.createdAt, since),
      ),
    )
    .limit(rateLimitPerMinute);

  if (recent.length >= rateLimitPerMinute) {
    return { allowed: false, reason: `MCP governance rate limit exceeded: ${rateLimitPerMinute}/minute` };
  }
  return null;
}

export async function enforceMcpGovernance(input: EnforceMcpGovernanceInput): Promise<unknown> {
  const policy = parsePolicy(input.server);
  const decision = evaluateMcpGovernancePolicy(input);
  const rateDecision = decision.allowed ? await enforceRateLimit(input, policy) : null;
  const finalDecision = rateDecision ?? decision;

  if (!finalDecision.allowed) {
    await recordMcpGovernanceAuditEvent({ ...input, decision: finalDecision });
    throw new Error(finalDecision.reason);
  }

  try {
    const result = await input.callTool();
    await recordMcpGovernanceAuditEvent({ ...input, decision: finalDecision });
    return result;
  } catch (error) {
    await appendCredentialAuditLog({
      userId: input.userId,
      agentId: input.agentId ?? null,
      credentialId: null,
      tool: auditToolName(input.server, input.toolName),
      keyHint: input.server.name.slice(0, 8),
      outcome: "error",
      detail: `MCP Governance Bridge: ${error instanceof Error ? error.message : String(error)}`,
    });
    throw error;
  }
}

import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "./db";
import { agents, agentSignalReviewItems, agentSignalReviews, agentTasks, installedSkills, users } from "./db/schema";
import { TOOL_PROFILES, compileToolProfile } from "./tool-profiles";

export const AGENT_SIGNAL_CRON = "45 2 * * *";
export const AGENT_SIGNAL_POLICY_VERSION = "agent-signal-v1";
const REVIEW_LOOKBACK_HOURS = 24;

type FindingSeverity = "info" | "warning" | "critical";
type FindingCategory = "agent" | "task" | "skill" | "tool" | "workflow";
type AgentSignalTrigger = "manual" | "schedule";

interface AgentSignalFindingInput {
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  recommendation: string;
  agentId?: string | null;
  taskId?: string | null;
  skillId?: string | null;
  evidence?: Record<string, unknown>;
}

function briefDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parsePermissions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { allowNetwork: false, allowFileSystem: false, scriptExecution: "disabled", operations: [] as string[] };
  }
  const permissions = value as Record<string, unknown>;
  return {
    allowNetwork: permissions.allowNetwork === true,
    allowFileSystem: permissions.allowFileSystem === true,
    scriptExecution: permissions.scriptExecution === "sandboxed" ? "sandboxed" : "disabled",
    operations: Array.isArray(permissions.operations)
      ? permissions.operations.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export function createAgentSignalFinding(input: AgentSignalFindingInput): AgentSignalFindingInput {
  return input;
}

export async function buildAgentSignalPolicyInputs(userId: string, since: Date) {
  const [agentRows, taskRows, skillRows] = await Promise.all([
    db
      .select({
        id: agents.id,
        name: agents.name,
        toolProfile: agents.toolProfile,
        tools: agents.tools,
        deniedTools: agents.deniedTools,
        memoryEnabled: agents.memoryEnabled,
        updatedAt: agents.updatedAt,
      })
      .from(agents)
      .where(eq(agents.userId, userId)),
    db
      .select({
        id: agentTasks.id,
        agentId: agentTasks.agentId,
        title: agentTasks.title,
        status: agentTasks.status,
        error: agentTasks.error,
        retryCount: agentTasks.retryCount,
        maxRetries: agentTasks.maxRetries,
        updatedAt: agentTasks.updatedAt,
      })
      .from(agentTasks)
      .where(and(eq(agentTasks.userId, userId), gte(agentTasks.updatedAt, since)))
      .orderBy(desc(agentTasks.updatedAt))
      .limit(50),
    db
      .select({
        id: installedSkills.id,
        slug: installedSkills.slug,
        name: installedSkills.name,
        permissions: installedSkills.permissions,
      })
      .from(installedSkills)
      .where(eq(installedSkills.userId, userId)),
  ]);

  return { agents: agentRows, tasks: taskRows, skills: skillRows };
}

function reviewAgents(input: Awaited<ReturnType<typeof buildAgentSignalPolicyInputs>>): AgentSignalFindingInput[] {
  const findings: AgentSignalFindingInput[] = [];
  const installedSkillSlugs = new Set(input.skills.map((skill) => skill.slug));

  for (const agent of input.agents) {
    const selectedTools = parseJsonStringArray(agent.tools);
    const deniedTools = parseJsonStringArray(agent.deniedTools);
    const compiled = compileToolProfile({ selectedTools, profile: agent.toolProfile, deniedTools });
    const highRiskTools = selectedTools.filter(
      (tool) => tool === "execute_code" || tool === "local_system" || tool.startsWith("mcp:"),
    );

    if (
      (agent.toolProfile === "full" || agent.toolProfile === "admin") &&
      highRiskTools.length > 0 &&
      deniedTools.length === 0
    ) {
      findings.push(
        createAgentSignalFinding({
          severity: "warning",
          category: "tool",
          agentId: agent.id,
          title: `${agent.name} exposes high-risk tools without a deny list`,
          recommendation:
            "Review the agent tool profile and add deny-list entries for tools it should not call autonomously.",
          evidence: { profile: agent.toolProfile, highRiskTools, policy: TOOL_PROFILES[agent.toolProfile] },
        }),
      );
    }

    if (compiled.removedTools.length > 0) {
      findings.push(
        createAgentSignalFinding({
          severity: "info",
          category: "tool",
          agentId: agent.id,
          title: `${agent.name} has tools removed by profile policy`,
          recommendation: "Confirm the current profile still matches this agent's intended work.",
          evidence: { profile: compiled.profile, removedTools: compiled.removedTools },
        }),
      );
    }

    const skillTools = selectedTools.filter((tool) => tool.startsWith("skill:"));
    const missingSkillTools = skillTools.filter((tool) => !installedSkillSlugs.has(tool.replace(/^skill:/, "")));
    if (missingSkillTools.length > 0) {
      findings.push(
        createAgentSignalFinding({
          severity: "warning",
          category: "skill",
          agentId: agent.id,
          title: `${agent.name} references missing skills`,
          recommendation: "Install the missing skills or remove stale skill tool IDs from the agent.",
          evidence: { missingSkillTools },
        }),
      );
    }

    if (agent.memoryEnabled === false) {
      findings.push(
        createAgentSignalFinding({
          severity: "info",
          category: "agent",
          agentId: agent.id,
          title: `${agent.name} has memory disabled`,
          recommendation: "Confirm memory is intentionally disabled for this agent's workflow.",
          evidence: { memoryEnabled: false },
        }),
      );
    }
  }

  return findings;
}

function reviewTasks(input: Awaited<ReturnType<typeof buildAgentSignalPolicyInputs>>): AgentSignalFindingInput[] {
  return input.tasks
    .filter((task) => task.status === "error" || task.status === "cancelled")
    .map((task) =>
      createAgentSignalFinding({
        severity: task.status === "error" && task.retryCount >= task.maxRetries ? "critical" : "warning",
        category: "task",
        agentId: task.agentId,
        taskId: task.id,
        title: `Task ${task.status}: ${task.title}`,
        recommendation:
          task.status === "error"
            ? "Inspect the task output, adjust the prompt or assigned agent, and retry when the cause is understood."
            : "Confirm cancellation was intentional or reschedule the work.",
        evidence: { status: task.status, error: task.error, retryCount: task.retryCount, maxRetries: task.maxRetries },
      }),
    );
}

function reviewSkills(input: Awaited<ReturnType<typeof buildAgentSignalPolicyInputs>>): AgentSignalFindingInput[] {
  return input.skills.flatMap((skill) => {
    const permissions = parsePermissions(skill.permissions);
    if (!permissions.allowNetwork && !permissions.allowFileSystem && permissions.scriptExecution !== "sandboxed")
      return [];
    return [
      createAgentSignalFinding({
        severity: permissions.allowFileSystem ? "warning" : "info",
        category: "skill",
        skillId: skill.id,
        title: `${skill.name} has elevated skill permissions`,
        recommendation: "Review whether this skill still needs network, filesystem, or script execution permissions.",
        evidence: { slug: skill.slug, permissions },
      }),
    ];
  });
}

function summarize(findings: AgentSignalFindingInput[]) {
  const critical = findings.filter((finding) => finding.severity === "critical").length;
  const warning = findings.filter((finding) => finding.severity === "warning").length;
  if (findings.length === 0) return "Agent Signal found no open self-review findings in the latest policy pass.";
  return `Agent Signal found ${findings.length} item(s): ${critical} critical, ${warning} warning, ${findings.length - critical - warning} informational.`;
}

export async function runAgentSignalForUser(
  userId: string,
  options: { generatedBy?: AgentSignalTrigger; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - REVIEW_LOOKBACK_HOURS * 60 * 60 * 1000);
  const policyInputs = await buildAgentSignalPolicyInputs(userId, since);
  const findings = [...reviewAgents(policyInputs), ...reviewTasks(policyInputs), ...reviewSkills(policyInputs)];
  const sourceCounts = {
    agents: policyInputs.agents.length,
    tasks: policyInputs.tasks.length,
    skills: policyInputs.skills.length,
    findings: findings.length,
  };

  const [review] = await db
    .insert(agentSignalReviews)
    .values({
      userId,
      generatedForDate: briefDate(now),
      generatedBy: options.generatedBy ?? "schedule",
      status: "completed",
      policyVersion: AGENT_SIGNAL_POLICY_VERSION,
      summary: summarize(findings),
      sourceCounts,
      startedAt: now,
      completedAt: now,
    })
    .returning();

  const items = findings.length
    ? await db
        .insert(agentSignalReviewItems)
        .values(
          findings.map((finding) => ({
            reviewId: review.id,
            userId,
            agentId: finding.agentId ?? null,
            taskId: finding.taskId ?? null,
            skillId: finding.skillId ?? null,
            severity: finding.severity,
            category: finding.category,
            title: finding.title,
            recommendation: finding.recommendation,
            evidence: finding.evidence ?? {},
            status: "open" as const,
            createdAt: now,
          })),
        )
        .returning()
    : [];

  return { review, items };
}

export async function runAgentSignalForAllUsers(now = new Date()) {
  const generatedForDate = briefDate(now);
  const rows = await db.select({ id: users.id }).from(users);
  const results = [];

  for (const user of rows) {
    const [existing] = await db
      .select({ id: agentSignalReviews.id })
      .from(agentSignalReviews)
      .where(
        and(
          eq(agentSignalReviews.userId, user.id),
          eq(agentSignalReviews.generatedForDate, generatedForDate),
          eq(agentSignalReviews.generatedBy, "schedule"),
        ),
      )
      .limit(1);
    if (existing) continue;
    results.push(await runAgentSignalForUser(user.id, { generatedBy: "schedule", now }));
  }

  return results;
}

import { and, desc, eq, gte, or } from "drizzle-orm";
import { db } from "./db";
import {
  agentTasks,
  agentSignalReviewItems,
  automations,
  automationRuns,
  dailyBriefs,
  memoryEntries,
  users,
} from "./db/schema";

export const DAILY_BRIEF_CRON = "15 8 * * *";
export const DEFAULT_DAILY_BRIEF_WINDOW_HOURS = 24;

type DailyBriefTrigger = "manual" | "schedule" | "system";
type DailyBriefSectionKey = "tasks" | "automations" | "memory" | "alerts" | "scheduledSummaries" | "agentSignal";

export interface DailyBriefSection {
  key: DailyBriefSectionKey;
  title: string;
  items: string[];
}

export interface DailyBriefSourceCounts {
  tasks: number;
  automations: number;
  memoryChanges: number;
  alerts: number;
  scheduledSummaries: number;
  agentSignalFindings: number;
}

interface DailyBriefSources {
  taskItems: string[];
  automationItems: string[];
  memoryItems: string[];
  alerts: string[];
  scheduledSummaries: string[];
  agentSignalFindings: string[];
}

function briefDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function plural(count: number, singular: string, many = `${singular}s`) {
  return `${count} ${count === 1 ? singular : many}`;
}

function excerpt(value: string | null | undefined, max = 180) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function section(key: DailyBriefSectionKey, title: string, items: string[]): DailyBriefSection {
  return { key, title, items: items.length ? items : ["No new activity in this section."] };
}

export async function collectDailyBriefSources(userId: string, since: Date): Promise<DailyBriefSources> {
  const [tasks, automationDefs, runRows, memories, signalItems] = await Promise.all([
    db
      .select({
        title: agentTasks.title,
        status: agentTasks.status,
        output: agentTasks.output,
        error: agentTasks.error,
        updatedAt: agentTasks.updatedAt,
      })
      .from(agentTasks)
      .where(and(eq(agentTasks.userId, userId), gte(agentTasks.updatedAt, since)))
      .orderBy(desc(agentTasks.updatedAt))
      .limit(8),
    db
      .select({
        name: automations.name,
        prompt: automations.prompt,
        isActive: automations.isActive,
        executionCount: automations.executionCount,
        lastRunAt: automations.lastRunAt,
        pausedAt: automations.pausedAt,
        pauseReason: automations.pauseReason,
      })
      .from(automations)
      .where(eq(automations.userId, userId))
      .orderBy(desc(automations.lastRunAt), desc(automations.createdAt))
      .limit(8),
    db
      .select({
        automationName: automations.name,
        prompt: automations.prompt,
        status: automationRuns.status,
        output: automationRuns.output,
        error: automationRuns.error,
        notificationStatus: automationRuns.notificationStatus,
        notificationError: automationRuns.notificationError,
        startedAt: automationRuns.startedAt,
        completedAt: automationRuns.completedAt,
      })
      .from(automationRuns)
      .innerJoin(automations, eq(automationRuns.automationId, automations.id))
      .where(
        and(
          eq(automations.userId, userId),
          or(gte(automationRuns.startedAt, since), gte(automationRuns.completedAt, since)),
        ),
      )
      .orderBy(desc(automationRuns.startedAt), desc(automationRuns.completedAt))
      .limit(10),
    db
      .select({
        category: memoryEntries.category,
        key: memoryEntries.key,
        value: memoryEntries.value,
        status: memoryEntries.status,
        updatedAt: memoryEntries.updatedAt,
      })
      .from(memoryEntries)
      .where(and(eq(memoryEntries.userId, userId), gte(memoryEntries.updatedAt, since)))
      .orderBy(desc(memoryEntries.updatedAt))
      .limit(8),
    db
      .select({
        severity: agentSignalReviewItems.severity,
        title: agentSignalReviewItems.title,
        recommendation: agentSignalReviewItems.recommendation,
        createdAt: agentSignalReviewItems.createdAt,
      })
      .from(agentSignalReviewItems)
      .where(
        and(
          eq(agentSignalReviewItems.userId, userId),
          eq(agentSignalReviewItems.status, "open"),
          gte(agentSignalReviewItems.createdAt, since),
        ),
      )
      .orderBy(desc(agentSignalReviewItems.createdAt))
      .limit(8),
  ]);

  const taskItems = tasks.map((task) => {
    const detail = task.status === "success" ? excerpt(task.output, 90) : excerpt(task.error || task.output, 90);
    return `${task.status}: ${task.title}${detail ? ` - ${detail}` : ""}`;
  });

  const automationItems = [
    ...automationDefs.map((automation) => {
      const state = automation.isActive ? "Active" : "Paused";
      const runText = automation.lastRunAt
        ? `last ran ${automation.lastRunAt.toISOString().slice(0, 10)}`
        : "not run yet";
      const pauseText = automation.pausedAt ? `, ${automation.pauseReason ?? "paused"}` : "";
      return `${state}: ${automation.name} (${runText}, ${automation.executionCount} run${automation.executionCount === 1 ? "" : "s"}${pauseText})`;
    }),
    ...runRows
      .slice(0, 4)
      .map((run) => `${run.status}: ${run.automationName}${run.output ? ` - ${excerpt(run.output, 90)}` : ""}`),
  ].slice(0, 10);

  const memoryItems = memories.map((memory) => {
    return `${memory.status}: ${memory.category}/${memory.key} - ${excerpt(memory.value, 120)}`;
  });

  const alerts = [
    ...tasks
      .filter((task) => task.status === "error" || task.status === "cancelled")
      .map((task) => `Task ${task.status}: ${task.title}${task.error ? ` - ${excerpt(task.error, 100)}` : ""}`),
    ...runRows
      .filter((run) => run.status === "error" || run.notificationStatus === "error")
      .map((run) => {
        const detail = run.error || run.notificationError || run.output;
        return `Automation alert: ${run.automationName}${detail ? ` - ${excerpt(detail, 100)}` : ""}`;
      }),
  ];

  const scheduledSummaries = runRows
    .filter((run) => Boolean(run.output))
    .map((run) => `${run.automationName}: ${excerpt(run.output, 160)}`)
    .slice(0, 6);

  const agentSignalFindings = signalItems.map((item) => {
    return `${item.severity}: ${item.title} - ${excerpt(item.recommendation, 140)}`;
  });

  return { taskItems, automationItems, memoryItems, alerts, scheduledSummaries, agentSignalFindings };
}

function buildDailyBriefPayload(sources: DailyBriefSources, windowHours: number) {
  const sourceCounts: DailyBriefSourceCounts = {
    tasks: sources.taskItems.length,
    automations: sources.automationItems.length,
    memoryChanges: sources.memoryItems.length,
    alerts: sources.alerts.length,
    scheduledSummaries: sources.scheduledSummaries.length,
    agentSignalFindings: sources.agentSignalFindings.length,
  };

  const highlights = [
    ...sources.alerts.slice(0, 2),
    ...sources.taskItems.slice(0, 2),
    ...sources.agentSignalFindings.slice(0, 2),
    ...sources.scheduledSummaries.slice(0, 1),
    ...sources.memoryItems.slice(0, 1),
  ].slice(0, 6);

  const sections: DailyBriefSection[] = [
    section("alerts", "Alerts", sources.alerts),
    section("tasks", "Agent Tasks", sources.taskItems),
    section("agentSignal", "Agent Signal", sources.agentSignalFindings),
    section("automations", "Automations", sources.automationItems),
    section("memory", "Memory Changes", sources.memoryItems),
    section("scheduledSummaries", "Scheduled Summaries", sources.scheduledSummaries),
  ];

  const total =
    sourceCounts.tasks +
    sourceCounts.automations +
    sourceCounts.memoryChanges +
    sourceCounts.scheduledSummaries +
    sourceCounts.agentSignalFindings;
  const summary =
    total === 0 && sourceCounts.alerts === 0
      ? `No new task, automation, memory, alert, Agent Signal, or scheduled-summary activity was found in the last ${windowHours} hours.`
      : `${sourceCounts.alerts > 0 ? plural(sourceCounts.alerts, "alert") : "No active alerts"} across ${plural(sourceCounts.tasks, "task update")}, ${plural(sourceCounts.automations, "automation update")}, ${plural(sourceCounts.memoryChanges, "memory change")}, ${plural(sourceCounts.agentSignalFindings, "Agent Signal finding")}, and ${plural(sourceCounts.scheduledSummaries, "scheduled summary", "scheduled summaries")} in the last ${windowHours} hours.`;

  return {
    summary,
    highlights: highlights.length ? highlights : ["No high-priority changes detected."],
    sections,
    sourceCounts,
  };
}

export async function createDailyBriefForUser(
  userId: string,
  options: {
    generatedBy?: DailyBriefTrigger;
    now?: Date;
    scheduledFor?: Date | null;
    generatedForDate?: string;
    windowHours?: number;
  } = {},
) {
  const now = options.now ?? new Date();
  const windowHours = options.windowHours ?? DEFAULT_DAILY_BRIEF_WINDOW_HOURS;
  const sourceWindowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  const generatedForDate = options.generatedForDate ?? briefDate(now);
  const sources = await collectDailyBriefSources(userId, sourceWindowStart);
  const payload = buildDailyBriefPayload(sources, windowHours);

  const [brief] = await db
    .insert(dailyBriefs)
    .values({
      userId,
      generatedForDate,
      generatedBy: options.generatedBy ?? "manual",
      status: "ready",
      title: `Daily Brief - ${generatedForDate}`,
      summary: payload.summary,
      highlights: payload.highlights,
      sections: payload.sections,
      sourceCounts: payload.sourceCounts,
      sourceWindowStart,
      sourceWindowEnd: now,
      scheduledFor: options.scheduledFor ?? null,
      generatedAt: now,
    })
    .returning();

  return brief;
}

export async function latestDailyBriefForUser(userId: string) {
  const [brief] = await db
    .select()
    .from(dailyBriefs)
    .where(eq(dailyBriefs.userId, userId))
    .orderBy(desc(dailyBriefs.generatedAt))
    .limit(1);
  return brief ?? null;
}

export async function generateScheduledDailyBriefs(now = new Date()) {
  const generatedForDate = briefDate(now);
  const rows = await db.select({ id: users.id }).from(users);
  const generated = [];

  for (const user of rows) {
    const [existing] = await db
      .select({ id: dailyBriefs.id })
      .from(dailyBriefs)
      .where(
        and(
          eq(dailyBriefs.userId, user.id),
          eq(dailyBriefs.generatedForDate, generatedForDate),
          eq(dailyBriefs.generatedBy, "schedule"),
        ),
      )
      .limit(1);
    if (existing) continue;
    generated.push(
      await createDailyBriefForUser(user.id, {
        generatedBy: "schedule",
        generatedForDate,
        now,
        scheduledFor: now,
      }),
    );
  }

  return generated;
}

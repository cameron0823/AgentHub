import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { userQuotas, type UserQuota } from "./db/schema";

export type QuotaAction = "message" | "token" | "storage" | "api";

export type QuotaDelta = Partial<{
  messagesSent: number;
  tokensUsed: number;
  storageUsed: number;
  apiCalls: number;
}>;

export type QuotaCheckResult =
  | {
      allowed: true;
      quota: UserQuota;
      action: QuotaAction;
      current: number;
      limit: number;
      requested: number;
      resetAt: Date;
    }
  | {
      allowed: false;
      quota: UserQuota;
      action: QuotaAction;
      current: number;
      limit: number;
      requested: number;
      resetAt: Date;
      reason: string;
    };

export function nextMonthlyReset(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

export function quotaUsagePercent(current: number, limit: number) {
  if (limit <= 0) return current > 0 ? 100 : 0;
  return Math.min(100, Math.round((current / limit) * 100));
}

function normalizeDeltaValue(value: number | undefined) {
  if (!Number.isFinite(value ?? 0)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
}

function actionMetric(quota: UserQuota, action: QuotaAction) {
  switch (action) {
    case "message":
      return {
        label: "monthly message quota",
        current: quota.messagesSent,
        limit: quota.maxMessages,
      };
    case "token":
      return {
        label: "monthly token quota",
        current: quota.tokensUsed,
        limit: quota.maxTokens,
      };
    case "storage":
      return {
        label: "storage quota",
        current: quota.storageUsed,
        limit: quota.maxStorage,
      };
    case "api":
      return {
        label: "monthly API quota",
        current: quota.apiCalls,
        limit: quota.maxApiCalls,
      };
  }
}

export async function resetQuotaIfNeeded(quota: UserQuota, now = new Date()) {
  if (quota.resetAt > now) return quota;

  const [resetQuota] = await db
    .update(userQuotas)
    .set({
      messagesSent: 0,
      tokensUsed: 0,
      apiCalls: 0,
      resetAt: nextMonthlyReset(now),
      updatedAt: now,
    })
    .where(eq(userQuotas.id, quota.id))
    .returning();

  return resetQuota ?? quota;
}

export async function ensureUserQuota(userId: string, now = new Date()) {
  await db
    .insert(userQuotas)
    .values({
      userId,
      resetAt: nextMonthlyReset(now),
    })
    .onConflictDoNothing({ target: userQuotas.userId });

  const [quota] = await db.select().from(userQuotas).where(eq(userQuotas.userId, userId)).limit(1);
  if (!quota) throw new Error("Unable to create user quota");
  return resetQuotaIfNeeded(quota, now);
}

export async function checkQuota(userId: string, action: QuotaAction, requested = 1): Promise<QuotaCheckResult> {
  const quota = await ensureUserQuota(userId);
  const amount = Math.max(1, Math.floor(requested));
  const metric = actionMetric(quota, action);
  const allowed = metric.current + amount <= metric.limit;
  const result = {
    quota,
    action,
    current: metric.current,
    limit: metric.limit,
    requested: amount,
    resetAt: quota.resetAt,
  };

  if (allowed) return { allowed: true, ...result };
  return {
    allowed: false,
    ...result,
    reason: `Your ${metric.label} is exhausted. It resets on ${quota.resetAt.toISOString().slice(0, 10)}.`,
  };
}

export async function incrementQuota(userId: string, delta: QuotaDelta) {
  await ensureUserQuota(userId);
  const messagesSent = normalizeDeltaValue(delta.messagesSent);
  const tokensUsed = normalizeDeltaValue(delta.tokensUsed);
  const storageUsed = normalizeDeltaValue(delta.storageUsed);
  const apiCalls = normalizeDeltaValue(delta.apiCalls);

  const [quota] = await db
    .update(userQuotas)
    .set({
      messagesSent: sql<number>`${userQuotas.messagesSent} + ${messagesSent}`,
      tokensUsed: sql<number>`${userQuotas.tokensUsed} + ${tokensUsed}`,
      storageUsed: sql<number>`${userQuotas.storageUsed} + ${storageUsed}`,
      apiCalls: sql<number>`${userQuotas.apiCalls} + ${apiCalls}`,
      updatedAt: new Date(),
    })
    .where(eq(userQuotas.userId, userId))
    .returning();

  return quota;
}

export function quotaSummary(quota: UserQuota) {
  return {
    ...quota,
    usage: {
      messages: quotaUsagePercent(quota.messagesSent, quota.maxMessages),
      tokens: quotaUsagePercent(quota.tokensUsed, quota.maxTokens),
      storage: quotaUsagePercent(quota.storageUsed, quota.maxStorage),
      api: quotaUsagePercent(quota.apiCalls, quota.maxApiCalls),
    },
  };
}

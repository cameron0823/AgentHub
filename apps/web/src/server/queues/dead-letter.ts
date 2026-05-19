import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { deadLetterEntries } from "../db/schema";

export type DeadLetterFailureCategory = "llm_error" | "tool_error" | "timeout" | "halt" | "unknown";

export interface DeadLetterEntry {
  id: string;
  queueName: string;
  jobId: string;
  graphId?: string;
  threadId?: string;
  failedNode?: string;
  errorMessage: string;
  finalState?: unknown;
  checkpointId?: string;
  failureCategory: DeadLetterFailureCategory;
  retryCount: number;
  createdAt: string;
}

export class DeadLetterQueue {
  private readonly entries = new Map<string, DeadLetterEntry>();

  async record(input: Omit<DeadLetterEntry, "id" | "createdAt">) {
    const entry: DeadLetterEntry = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
    };
    this.entries.set(entry.id, entry);
    try {
      await db
        .insert(deadLetterEntries)
        .values({
          id: entry.id,
          queueName: entry.queueName,
          jobId: entry.jobId,
          graphId: entry.graphId,
          threadId: entry.threadId,
          failedNode: entry.failedNode,
          errorMessage: entry.errorMessage,
          finalState: entry.finalState,
          checkpointId: entry.checkpointId,
          failureCategory: entry.failureCategory,
          retryCount: entry.retryCount,
          createdAt: new Date(entry.createdAt),
        })
        .onConflictDoNothing();
    } catch {
      // Queue failure recording must never mask the original job failure; keep the in-memory copy as a fallback.
    }
    return entry;
  }

  async list(filter: { queueName?: string; threadId?: string } = {}) {
    try {
      const conditions = [
        filter.queueName ? eq(deadLetterEntries.queueName, filter.queueName) : undefined,
        filter.threadId ? eq(deadLetterEntries.threadId, filter.threadId) : undefined,
      ].filter(Boolean);
      const rows = await db
        .select()
        .from(deadLetterEntries)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      return rows.map(
        (row): DeadLetterEntry => ({
          id: row.id,
          queueName: row.queueName,
          jobId: row.jobId,
          graphId: row.graphId ?? undefined,
          threadId: row.threadId ?? undefined,
          failedNode: row.failedNode ?? undefined,
          errorMessage: row.errorMessage,
          finalState: row.finalState,
          checkpointId: row.checkpointId ?? undefined,
          failureCategory: row.failureCategory,
          retryCount: row.retryCount,
          createdAt: row.createdAt.toISOString(),
        }),
      );
    } catch {
      return [...this.entries.values()].filter(
        (entry) =>
          (!filter.queueName || entry.queueName === filter.queueName) &&
          (!filter.threadId || entry.threadId === filter.threadId),
      );
    }
  }

  async listMemory(filter: { queueName?: string; threadId?: string } = {}) {
    return [...this.entries.values()].filter(
      (entry) =>
        (!filter.queueName || entry.queueName === filter.queueName) &&
        (!filter.threadId || entry.threadId === filter.threadId),
    );
  }

  async remove(id: string) {
    const removed = this.entries.delete(id);
    try {
      await db.delete(deadLetterEntries).where(eq(deadLetterEntries.id, id));
      return true;
    } catch {
      return removed;
    }
  }
}

export const deadLetterQueue = new DeadLetterQueue();

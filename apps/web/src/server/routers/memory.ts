import { z } from "zod";
import { eq, desc, and, or, ilike, sql } from "drizzle-orm";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { memoryEntries } from "../db/schema";

const memoryStatus = z.enum(["accepted", "proposed", "rejected", "archived"]);

const memoryEntryInput = z.object({
  agentId: z.string().uuid().nullable().optional(),
  category: z.string().trim().min(1),
  key: z.string().trim().min(1),
  value: z.string().trim().min(1),
  confidence: z.number().optional(),
  sourceMessageId: z.string().uuid().nullable().optional(),
  status: memoryStatus.optional(),
});

function clampConfidence(confidence: number | undefined) {
  if (confidence === undefined || Number.isNaN(confidence)) return 1;
  return Math.min(1, Math.max(0, confidence));
}

export const memoryEntriesRouter = router({
  list: authedProcedure
    .input(z.object({ agentId: z.string().uuid().optional(), category: z.string().optional(), status: memoryStatus.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const filters = [eq(memoryEntries.userId, ctx.user.id)];
      if (input?.agentId) filters.push(eq(memoryEntries.agentId, input.agentId));
      if (input?.category) filters.push(eq(memoryEntries.category, input.category));
      if (input?.status) filters.push(eq(memoryEntries.status, input.status));
      return db.select().from(memoryEntries).where(and(...filters)).orderBy(desc(memoryEntries.updatedAt));
    }),

  create: authedProcedure
    .input(memoryEntryInput)
    .mutation(async ({ ctx, input }) => {
      const [entry] = await db.insert(memoryEntries).values({
        userId: ctx.user.id,
        agentId: input.agentId || null,
        category: input.category,
        key: input.key,
        value: input.value,
        confidence: clampConfidence(input.confidence),
        sourceMessageId: input.sourceMessageId || null,
        status: input.status || "accepted",
        isEdited: true,
      }).returning();
      return entry;
    }),

  update: authedProcedure
    .input(memoryEntryInput.partial().extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(memoryEntries).set({
        ...(input.agentId !== undefined && { agentId: input.agentId || null }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.key !== undefined && { key: input.key }),
        ...(input.value !== undefined && { value: input.value }),
        ...(input.confidence !== undefined && { confidence: clampConfidence(input.confidence) }),
        ...(input.sourceMessageId !== undefined && { sourceMessageId: input.sourceMessageId || null }),
        ...(input.status !== undefined && { status: input.status }),
        isEdited: true,
        updatedAt: new Date(),
      }).where(and(eq(memoryEntries.id, input.id), eq(memoryEntries.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(memoryEntries).where(and(eq(memoryEntries.id, input.id), eq(memoryEntries.userId, ctx.user.id)));
      return { success: true };
    }),

  search: authedProcedure
    .input(z.object({ query: z.string().min(1), agentId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const pattern = `%${input.query}%`;
      const filters = [
        eq(memoryEntries.userId, ctx.user.id),
        or(ilike(memoryEntries.key, pattern), ilike(memoryEntries.value, pattern))!,
      ];
      if (input.agentId) filters.push(eq(memoryEntries.agentId, input.agentId));
      return db.select().from(memoryEntries)
        .where(and(...filters))
        .orderBy(desc(memoryEntries.updatedAt))
        .limit(20);
    }),

  semanticSearch: authedProcedure
    .input(z.object({ query: z.string().min(1), agentId: z.string().uuid().optional(), limit: z.number().int().min(1).max(20).default(5) }))
    .query(async ({ ctx, input }) => {
      const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
      let queryVector: number[] | null = null;
      try {
        const res = await fetch(`${ollamaUrl}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "nomic-embed-text", prompt: input.query }),
        });
        if (res.ok) {
          const data = await res.json();
          const emb = data.embedding;
          if (Array.isArray(emb) && emb.every((v: unknown) => typeof v === "number" && isFinite(v as number))) {
            queryVector = emb as number[];
          }
        }
      } catch {
        // fall through to keyword search
      }

      if (!queryVector) {
        // Fallback to keyword search when embedding fails
        const pattern = `%${input.query}%`;
        const filters = [
          eq(memoryEntries.userId, ctx.user.id),
          eq(memoryEntries.status, "accepted"),
          or(ilike(memoryEntries.key, pattern), ilike(memoryEntries.value, pattern))!,
        ];
        if (input.agentId) filters.push(eq(memoryEntries.agentId, input.agentId));
        return db.select().from(memoryEntries)
          .where(and(...filters))
          .orderBy(desc(memoryEntries.updatedAt))
          .limit(input.limit);
      }

      const agentFilter = input.agentId ? sql`AND agent_id = ${input.agentId}::uuid` : sql``;
      const rows = await db.execute<{
        id: string; category: string; key: string; value: string; similarity: number;
      }>(sql`
        SELECT id, category, key, value,
          1 - (embedding <=> ${JSON.stringify(queryVector)}::vector) AS similarity
        FROM memory_entries
        WHERE user_id = ${ctx.user.id}::uuid
          AND status = 'accepted'
          AND embedding IS NOT NULL
          ${agentFilter}
        ORDER BY embedding <=> ${JSON.stringify(queryVector)}::vector
        LIMIT ${input.limit}
      `);

      return rows;
    }),
});

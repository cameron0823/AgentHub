import { z } from "zod";
import { eq, desc, and, ilike, or, sql } from "drizzle-orm";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { promptLibrary } from "../db/schema";

const promptInput = z.object({
  title: z.string().trim().min(1).max(100),
  content: z.string().trim().min(1),
  tags: z.array(z.string()).default([]),
  isPinned: z.boolean().default(false),
});

export const promptLibraryRouter = router({
  list: authedProcedure
    .input(z.object({ search: z.string().optional(), tag: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const filters = [eq(promptLibrary.userId, ctx.user.id)];
      if (input.search) {
        const pattern = `%${input.search}%`;
        filters.push(or(ilike(promptLibrary.title, pattern), ilike(promptLibrary.content, pattern))!);
      }
      if (input.tag) {
        filters.push(sql`${input.tag} = ANY(${promptLibrary.tags})`);
      }
      return db
        .select()
        .from(promptLibrary)
        .where(and(...filters))
        .orderBy(desc(promptLibrary.isPinned), desc(promptLibrary.useCount), desc(promptLibrary.createdAt));
    }),

  create: authedProcedure.input(promptInput).mutation(async ({ ctx, input }) => {
    const [created] = await db
      .insert(promptLibrary)
      .values({
        userId: ctx.user.id,
        ...input,
      })
      .returning();
    return created;
  }),

  update: authedProcedure
    .input(z.object({ id: z.string().uuid() }).merge(promptInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [updated] = await db
        .update(promptLibrary)
        .set({ ...rest, updatedAt: new Date() })
        .where(and(eq(promptLibrary.id, id), eq(promptLibrary.userId, ctx.user.id)))
        .returning();
      return updated;
    }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db.delete(promptLibrary).where(and(eq(promptLibrary.id, input.id), eq(promptLibrary.userId, ctx.user.id)));
  }),

  incrementUse: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db
      .update(promptLibrary)
      .set({ useCount: sql`${promptLibrary.useCount} + 1` })
      .where(and(eq(promptLibrary.id, input.id), eq(promptLibrary.userId, ctx.user.id)));
  }),
});

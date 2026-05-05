import { initTRPC } from "@trpc/server";
import { z } from "zod";
import superjson from "superjson";
import { db } from "../db";
import { sessions, messages } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { providerRegistry } from "@agenthub/ai-providers";
import { v4 as uuidv4 } from "uuid";

const t = initTRPC.create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: "ok" })),

  providers: router({
    list: publicProcedure.query(async () => {
      return providerRegistry.healthCheckAll();
    }),
    models: publicProcedure.query(async () => {
      return providerRegistry.listAllModels();
    }),
  }),

  sessions: router({
    list: publicProcedure.query(async () => {
      return db.select().from(sessions).orderBy(desc(sessions.updatedAt));
    }),

    create: publicProcedure
      .input(z.object({ title: z.string().optional(), model: z.string().optional() }))
      .mutation(async ({ input }) => {
        const id = uuidv4();
        await db.insert(sessions).values({
          id,
          title: input.title || "New Chat",
          model: input.model || "qwen2.5:7b",
        });
        return { id };
      }),

    update: publicProcedure
      .input(z.object({ id: z.string(), title: z.string().optional(), model: z.string().optional() }))
      .mutation(async ({ input }) => {
        await db
          .update(sessions)
          .set({
            ...(input.title && { title: input.title }),
            ...(input.model && { model: input.model }),
            updatedAt: new Date(),
          })
          .where(eq(sessions.id, input.id));
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.delete(sessions).where(eq(sessions.id, input.id));
        return { success: true };
      }),
  }),

  messages: router({
    list: publicProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(async ({ input }) => {
        return db
          .select()
          .from(messages)
          .where(eq(messages.sessionId, input.sessionId))
          .orderBy(messages.createdAt);
      }),

    create: publicProcedure
      .input(
        z.object({
          sessionId: z.string(),
          role: z.enum(["user", "assistant", "system", "tool"]),
          content: z.string(),
          parentId: z.string().optional(),
          reasoning: z.string().optional(),
          model: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const id = uuidv4();
        await db.insert(messages).values({
          id,
          sessionId: input.sessionId,
          parentId: input.parentId || null,
          role: input.role,
          content: input.content,
          reasoning: input.reasoning || null,
          model: input.model || null,
        });
        await db
          .update(sessions)
          .set({ updatedAt: new Date() })
          .where(eq(sessions.id, input.sessionId));
        return { id };
      }),
  }),
});

export type AppRouter = typeof appRouter;

import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { knowledgeBases, documents, files } from "../db/schema";
import { hybridKbSearch } from "../kb-search";

export const kbRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.userId, ctx.user.id))
      .orderBy(desc(knowledgeBases.updatedAt));
  }),

  create: authedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        embeddingModel: z.string().optional(),
        chunkSize: z.number().optional(),
        chunkOverlap: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [kb] = await db
        .insert(knowledgeBases)
        .values({
          userId: ctx.user.id,
          name: input.name,
          description: input.description || null,
          embeddingModel: input.embeddingModel || "nomic-embed-text",
          chunkSize: input.chunkSize || 1000,
          chunkOverlap: input.chunkOverlap || 200,
        })
        .returning();
      return kb;
    }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db.delete(knowledgeBases).where(and(eq(knowledgeBases.id, input.id), eq(knowledgeBases.userId, ctx.user.id)));
    return { success: true };
  }),

  documents: authedProcedure.input(z.object({ knowledgeBaseId: z.string().uuid() })).query(async ({ ctx, input }) => {
    return db
      .select()
      .from(documents)
      .where(and(eq(documents.knowledgeBaseId, input.knowledgeBaseId), eq(documents.userId, ctx.user.id)))
      .orderBy(desc(documents.createdAt));
  }),

  query: authedProcedure
    .input(
      z.object({
        knowledgeBaseId: z.string().uuid(),
        query: z.string().min(1),
        limit: z.number().min(1).max(20).default(5),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const kb = await db
        .select()
        .from(knowledgeBases)
        .where(and(eq(knowledgeBases.id, input.knowledgeBaseId), eq(knowledgeBases.userId, ctx.user.id)))
        .limit(1);
      if (!kb[0]) throw new Error("Knowledge base not found");

      return hybridKbSearch({
        query: input.query,
        knowledgeBaseId: input.knowledgeBaseId,
        limit: input.limit,
        embeddingModel: kb[0].embeddingModel || "nomic-embed-text",
      });
    }),

  createDocument: authedProcedure
    .input(
      z.object({
        knowledgeBaseId: z.string().uuid(),
        name: z.string().min(1),
        mimeType: z.string(),
        size: z.number().int(),
        s3Key: z.string(),
        s3Url: z.string(),
        content: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const kb = await db
        .select()
        .from(knowledgeBases)
        .where(and(eq(knowledgeBases.id, input.knowledgeBaseId), eq(knowledgeBases.userId, ctx.user.id)))
        .limit(1);
      if (!kb[0]) throw new Error("Knowledge base not found");
      const [doc] = await db
        .insert(documents)
        .values({
          userId: ctx.user.id,
          knowledgeBaseId: input.knowledgeBaseId,
          name: input.name,
          mimeType: input.mimeType,
          size: input.size,
          s3Key: input.s3Key,
          s3Url: input.s3Url,
          content: input.content || null,
          status: "pending",
        })
        .returning();
      return doc;
    }),

  ingestDocument: authedProcedure
    .input(z.object({ documentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [doc] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, input.documentId), eq(documents.userId, ctx.user.id)))
        .limit(1);
      if (!doc) throw new Error("Document not found");
      const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const res = await fetch(`${origin}/api/kb/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id }),
      });
      if (!res.ok) throw new Error(`Ingest failed: ${await res.text()}`);
      return res.json();
    }),

  deleteDocument: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db.delete(documents).where(and(eq(documents.id, input.id), eq(documents.userId, ctx.user.id)));
    return { success: true };
  }),
});

export const filesRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.select().from(files).where(eq(files.userId, ctx.user.id)).orderBy(desc(files.createdAt));
  }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, input.id), eq(files.userId, ctx.user.id)))
      .limit(1);
    if (!file) throw new Error("File not found");
    const { deleteObject } = await import("@/lib/s3");
    await deleteObject(file.s3Key);
    await db.delete(files).where(eq(files.id, input.id));
    return { success: true };
  }),
});

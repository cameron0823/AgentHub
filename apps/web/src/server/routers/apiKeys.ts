import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { apiKeys } from "../db/schema";

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function generateKey(): { raw: string; prefix: string; hash: string } {
  const raw = `ah_${randomBytes(24).toString("base64url")}`;
  const prefix = raw.slice(0, 12);
  const hash = hashKey(raw);
  return { raw, prefix, hash };
}

export const apiKeysRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        isEnabled: apiKeys.isEnabled,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, ctx.user.id))
      .orderBy(desc(apiKeys.createdAt));
  }),

  create: authedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(100),
        expiresAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { raw, prefix, hash } = generateKey();
      const [entry] = await db
        .insert(apiKeys)
        .values({
          userId: ctx.user.id,
          name: input.name,
          keyHash: hash,
          keyPrefix: prefix,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        })
        .returning({ id: apiKeys.id, name: apiKeys.name, keyPrefix: apiKeys.keyPrefix, createdAt: apiKeys.createdAt });
      // Return raw key only once — never stored in plaintext
      return { ...entry, key: raw };
    }),

  revoke: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db
      .update(apiKeys)
      .set({ isEnabled: false })
      .where(and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.user.id)));
    return { success: true };
  }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db.delete(apiKeys).where(and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.user.id)));
    return { success: true };
  }),
});

/** Validate a raw API key against the DB. Returns the userId if valid, null otherwise. */
export async function validateApiKey(rawKey: string): Promise<string | null> {
  if (!rawKey.startsWith("ah_")) return null;
  const hash = hashKey(rawKey);
  const [entry] = await db
    .select({ userId: apiKeys.userId, isEnabled: apiKeys.isEnabled, expiresAt: apiKeys.expiresAt })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);
  if (!entry || !entry.isEnabled) return null;
  if (entry.expiresAt && entry.expiresAt < new Date()) return null;
  // Update lastUsedAt without blocking the caller
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.keyHash, hash));
  return entry.userId;
}

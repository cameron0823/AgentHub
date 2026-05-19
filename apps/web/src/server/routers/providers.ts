import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { providerCredentials } from "../db/schema";
import {
  decryptProviderCredential,
  decryptProviderCredentials,
  encryptProviderCredentialValues,
  redactProviderCredential,
} from "../provider-credentials";
import {
  checkProviderPlanAccess,
  createCloudProvider,
  getProviderCatalogEntry,
  providerCatalog,
  providerRegistry,
  type ProviderRegistry,
} from "@agenthub/ai-providers";
import { validateProviderBaseUrl } from "../security/outbound";
import { ensureUserQuota } from "../quotas";

type ProviderCred = typeof providerCredentials.$inferSelect;

function credentialsAllowedForPlan(creds: ProviderCred[], plan: string) {
  return creds.filter((cred) => checkProviderPlanAccess(cred.providerId, plan).allowed);
}

function assertProviderPlanAccess(providerId: string, plan: string) {
  const gate = checkProviderPlanAccess(providerId, plan);
  if (gate.allowed) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `Provider requires ${gate.requiredPlan} plan or higher.`,
  });
}

function registryForUser(creds: ProviderCred[], plan: string): ProviderRegistry {
  const allowedCreds = credentialsAllowedForPlan(creds, plan);
  if (allowedCreds.length === 0) return providerRegistry;
  return providerRegistry.forUser(
    allowedCreds.map((c) => ({
      providerId: c.providerId,
      authType: c.authType as "api_key" | "oauth",
      apiKey: c.apiKey || undefined,
      baseUrl: c.baseUrl ? validateProviderBaseUrl(c.baseUrl, c.baseUrl) : undefined,
      accessToken: c.accessToken || undefined,
      expiresAt: c.expiresAt,
    })),
  );
}

async function getUserCreds(userId: string) {
  const creds = await db
    .select()
    .from(providerCredentials)
    .where(and(eq(providerCredentials.userId, userId), eq(providerCredentials.isEnabled, true)));
  return decryptProviderCredentials(creds);
}

async function fetchModelsForCredential(cred: ProviderCred): Promise<string[]> {
  const pid = cred.providerId;

  const cloudProvider = createCloudProvider({
    providerId: cred.providerId,
    authType: cred.authType as "api_key" | "oauth",
    apiKey: cred.apiKey || undefined,
    baseUrl: cred.baseUrl || undefined,
    accessToken: cred.accessToken || undefined,
  });

  if (cloudProvider) {
    try {
      const models = await cloudProvider.listModels();
      return Array.from(new Set(models.map((model) => model.id)));
    } catch {
      return [];
    }
  }

  try {
    if (pid === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${cred.apiKey}` },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { data: { id: string }[] };
      return data.data
        .map((m) => m.id)
        .filter((id) => id.startsWith("gpt-") || id.startsWith("o1") || id.startsWith("o3"));
    }

    if (pid === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": cred.apiKey ?? "", "anthropic-version": "2023-06-01" },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { data: { id: string }[] };
      return data.data.map((m) => m.id);
    }

    if (pid === "gemini") {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cred.apiKey}`);
      if (!res.ok) return [];
      const data = (await res.json()) as { models: { name: string }[] };
      return data.models.map((m) => m.name.replace("models/", "")).filter((id) => id.startsWith("gemini"));
    }

    if (pid === "ollama") {
      const base = validateProviderBaseUrl(cred.baseUrl, "http://localhost:11434");
      const res = await fetch(`${base}/api/tags`);
      if (!res.ok) return [];
      const data = (await res.json()) as { models: { name: string }[] };
      return data.models.map((m) => m.name);
    }

    if (pid === "lm-studio") {
      const base = validateProviderBaseUrl(cred.baseUrl, "http://localhost:1234");
      const res = await fetch(`${base}/v1/models`);
      if (!res.ok) return [];
      const data = (await res.json()) as { data: { id: string }[] };
      return data.data.map((m) => m.id);
    }
  } catch {
    return [];
  }

  return [];
}

export const providersRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const [creds, quota] = await Promise.all([getUserCreds(ctx.user.id), ensureUserQuota(ctx.user.id)]);
    return registryForUser(creds, quota.plan).healthCheckAll();
  }),

  models: authedProcedure.query(async ({ ctx }) => {
    const [creds, quota] = await Promise.all([getUserCreds(ctx.user.id), ensureUserQuota(ctx.user.id)]);
    return registryForUser(creds, quota.plan).listAllModels();
  }),

  catalog: authedProcedure.query(async ({ ctx }) => {
    const [creds, quota] = await Promise.all([getUserCreds(ctx.user.id), ensureUserQuota(ctx.user.id)]);
    const registry = registryForUser(creds, quota.plan);
    const [providerHealth, providerModels] = await Promise.all([registry.healthCheckAll(), registry.listAllModels()]);
    const healthByProvider = new Map(providerHealth.map((p) => [p.id, p]));
    return {
      catalog: providerCatalog.map((entry) => {
        const gate = checkProviderPlanAccess(entry.id, quota.plan);
        return {
          ...entry,
          ...gate,
          planAccessible: gate.allowed,
        };
      }),
      providers: providerHealth.map((p) => ({
        ...p,
        metadata: getProviderCatalogEntry(p.id),
        models: providerModels.filter((m) => m.providerId === p.id),
      })),
      models: providerModels.map((m) => {
        const health = healthByProvider.get(m.providerId);
        return {
          ...m,
          providerMetadata: getProviderCatalogEntry(m.providerId),
          providerStatus: health?.status || "unhealthy",
          providerLatency: health?.latency ?? -1,
        };
      }),
    };
  }),
});

export const providerCredentialsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const creds = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.userId, ctx.user.id))
      .orderBy(desc(providerCredentials.updatedAt));
    return creds.map(redactProviderCredential);
  }),

  create: authedProcedure
    .input(
      z.object({
        providerId: z.string().min(1),
        providerName: z.string().min(1),
        authType: z.enum(["api_key", "oauth"]).default("api_key"),
        apiKey: z.string().optional(),
        baseUrl: z.string().optional(),
        accessToken: z.string().optional(),
        refreshToken: z.string().optional(),
        scope: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const quota = await ensureUserQuota(ctx.user.id);
      assertProviderPlanAccess(input.providerId, quota.plan);
      const [cred] = await db
        .insert(providerCredentials)
        .values({ userId: ctx.user.id, ...encryptProviderCredentialValues(input) })
        .returning();
      return redactProviderCredential(cred);
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        apiKey: z.string().optional(),
        baseUrl: z.string().optional(),
        accessToken: z.string().optional(),
        refreshToken: z.string().optional(),
        scope: z.string().optional(),
        isEnabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [cred] = await db
        .select()
        .from(providerCredentials)
        .where(and(eq(providerCredentials.id, id), eq(providerCredentials.userId, ctx.user.id)))
        .limit(1);
      if (!cred) throw new TRPCError({ code: "NOT_FOUND", message: "Credential not found" });
      const quota = await ensureUserQuota(ctx.user.id);
      assertProviderPlanAccess(cred.providerId, quota.plan);
      await db
        .update(providerCredentials)
        .set({ ...encryptProviderCredentialValues(updates), updatedAt: new Date() })
        .where(and(eq(providerCredentials.id, id), eq(providerCredentials.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db
      .delete(providerCredentials)
      .where(and(eq(providerCredentials.id, input.id), eq(providerCredentials.userId, ctx.user.id)));
    return { success: true };
  }),

  test: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [cred] = await db
      .select()
      .from(providerCredentials)
      .where(and(eq(providerCredentials.id, input.id), eq(providerCredentials.userId, ctx.user.id)))
      .limit(1);
    if (!cred) throw new TRPCError({ code: "NOT_FOUND", message: "Credential not found" });
    const decryptedCred = decryptProviderCredential(cred);
    const quota = await ensureUserQuota(ctx.user.id);
    assertProviderPlanAccess(decryptedCred.providerId, quota.plan);
    const { createCloudProvider } = await import("@agenthub/ai-providers");
    const provider = createCloudProvider({
      providerId: decryptedCred.providerId,
      authType: decryptedCred.authType as "api_key" | "oauth",
      apiKey: decryptedCred.apiKey || undefined,
      baseUrl: decryptedCred.baseUrl || undefined,
      accessToken: decryptedCred.accessToken || undefined,
    });
    if (!provider) throw new TRPCError({ code: "BAD_REQUEST", message: "Provider not supported" });
    return provider.healthCheck();
  }),

  fetchModels: authedProcedure.input(z.object({ credentialId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [cred] = await db
      .select()
      .from(providerCredentials)
      .where(and(eq(providerCredentials.id, input.credentialId), eq(providerCredentials.userId, ctx.user.id)))
      .limit(1);
    if (!cred) throw new TRPCError({ code: "NOT_FOUND", message: "Credential not found" });
    const decryptedCred = decryptProviderCredential(cred);
    const quota = await ensureUserQuota(ctx.user.id);
    assertProviderPlanAccess(decryptedCred.providerId, quota.plan);
    return fetchModelsForCredential(decryptedCred);
  }),
});

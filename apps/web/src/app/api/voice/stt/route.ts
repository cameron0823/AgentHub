import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { checkProviderPlanAccess, providerRegistry, type ProviderRegistry } from "@agenthub/ai-providers";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { providerCredentials } from "@/server/db/schema";
import { decryptProviderCredentials } from "@/server/provider-credentials";
import { ensureUserQuota } from "@/server/quotas";

export const runtime = "nodejs";

async function loadUserProviders(userId: string): Promise<ProviderRegistry> {
  const encryptedUserCreds = await db
    .select()
    .from(providerCredentials)
    .where(and(eq(providerCredentials.userId, userId), eq(providerCredentials.isEnabled, true)));
  const quota = await ensureUserQuota(userId);
  const userCreds = decryptProviderCredentials(encryptedUserCreds).filter(
    (credential) => checkProviderPlanAccess(credential.providerId, quota.plan).allowed,
  );
  if (userCreds.length === 0) return providerRegistry;
  return providerRegistry.forUser(
    userCreds.map((c) => ({
      providerId: c.providerId,
      authType: c.authType as "api_key" | "oauth",
      apiKey: c.apiKey || undefined,
      baseUrl: c.baseUrl || undefined,
      accessToken: c.accessToken || undefined,
      expiresAt: c.expiresAt,
    })),
  );
}

function formString(formData: FormData, key: string, fallback?: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value : fallback;
}

export async function POST(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const providerId = formString(formData, "providerId", "openai") ?? "openai";
  if (providerId === "browser") {
    return NextResponse.json({ error: "Browser STT fallback requested", fallback: "browser" }, { status: 409 });
  }

  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
  }

  const userRegistry = await loadUserProviders(session.user.id);
  const provider = userRegistry.get(providerId);
  if (!provider?.speechToText) {
    return NextResponse.json({ error: "Provider does not support speechToText", fallback: "browser" }, { status: 422 });
  }

  const result = await provider.speechToText({
    audio: await audio.arrayBuffer(),
    fileName: audio.name || "voice-input.webm",
    mimeType: audio.type || "audio/webm",
    model: formString(formData, "model"),
    language: formString(formData, "language"),
    prompt: formString(formData, "prompt"),
    signal: req.signal,
  });

  return NextResponse.json(result);
}

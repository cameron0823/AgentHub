import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { providerRegistry, type ProviderRegistry } from "@agenthub/ai-providers";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { providerCredentials } from "@/server/db/schema";

export const runtime = "nodejs";

async function loadUserProviders(userId: string): Promise<ProviderRegistry> {
  const userCreds = await db.select().from(providerCredentials)
    .where(and(eq(providerCredentials.userId, userId), eq(providerCredentials.isEnabled, true)));
  if (userCreds.length === 0) return providerRegistry;
  return providerRegistry.forUser(userCreds.map((c) => ({
    providerId: c.providerId,
    authType: c.authType as "api_key" | "oauth",
    apiKey: c.apiKey || undefined,
    baseUrl: c.baseUrl || undefined,
    accessToken: c.accessToken || undefined,
    expiresAt: c.expiresAt,
  })));
}

function clampSpeed(value: unknown) {
  const speed = Number(value);
  if (!Number.isFinite(speed)) return 1;
  return Math.min(4, Math.max(0.25, speed));
}

export async function POST(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text, providerId = "openai", model, voice = "alloy", speed = 1 } = await req.json();
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  if (providerId === "browser") {
    return NextResponse.json({ error: "Browser TTS fallback requested", fallback: "browser" }, { status: 409 });
  }

  const userRegistry = await loadUserProviders(session.user.id);
  const provider = userRegistry.get(providerId);
  if (!provider?.textToSpeech) {
    return NextResponse.json({ error: "Provider does not support textToSpeech", fallback: "browser" }, { status: 422 });
  }

  const result = await provider.textToSpeech({
    text: text.slice(0, 8000),
    model,
    voice,
    speed: clampSpeed(speed),
    format: "mp3",
    signal: req.signal,
  });

  return new Response(result.audio, {
    headers: {
      "Content-Type": result.mimeType || "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
      "X-Voice-Provider": provider.id,
      "X-Voice-Model": result.model,
      "X-Voice-Id": result.voice,
    },
  });
}

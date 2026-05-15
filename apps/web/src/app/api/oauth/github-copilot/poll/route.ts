import { NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { providerCredentials } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

const CLIENT_ID = process.env.GITHUB_COPILOT_CLIENT_ID ?? "Iv1.b507a08c87ecfe98";

export async function POST(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { device_code } = (await req.json()) as { device_code: string };

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });

  if (!res.ok) {
    return Response.json({ status: "error", error: "GitHub poll request failed" }, { status: 502 });
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (data.access_token) {
    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null;

    // Upsert: delete existing copilot cred then insert fresh
    await db.delete(providerCredentials).where(
      and(
        eq(providerCredentials.userId, session.user.id),
        eq(providerCredentials.providerId, "github-copilot")
      )
    );

    await db.insert(providerCredentials).values({
      userId: session.user.id,
      providerId: "github-copilot",
      providerName: "GitHub Copilot",
      authType: "oauth",
      accessToken: data.access_token,
      expiresAt: expiresAt ?? undefined,
      isEnabled: true,
    });

    return Response.json({ status: "authorized" });
  }

  return Response.json({ status: data.error ?? "error" });
}

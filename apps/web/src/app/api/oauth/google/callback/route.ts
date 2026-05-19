import { type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { providerCredentials } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { encryptProviderCredentialValues } from "@/server/provider-credentials";
import { checkProviderPlanAccess } from "@agenthub/ai-providers";
import { ensureUserQuota } from "@/server/quotas";

export const runtime = "nodejs";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

function getCookie(req: NextRequest, name: string): string | undefined {
  return req.cookies.get(name)?.value;
}

export async function GET(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const quota = await ensureUserQuota(session.user.id);
  const gate = checkProviderPlanAccess("gemini", quota.plan);
  if (!gate.allowed) {
    return Response.json({ error: `Requires ${gate.requiredPlan} plan or higher` }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return new Response(`<script>window.close()</script><p>Authorization denied: ${error}</p>`, {
      headers: { "Content-Type": "text/html" },
    });
  }

  if (!code) {
    return Response.json({ error: "Missing code" }, { status: 400 });
  }

  const storedState = getCookie(req, "google_oauth_state");
  const codeVerifier = getCookie(req, "google_oauth_verifier");

  if (!storedState || storedState !== state) {
    return Response.json({ error: "State mismatch" }, { status: 400 });
  }
  if (!codeVerifier) {
    return Response.json({ error: "Missing PKCE verifier" }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json({ error: "Google OAuth not configured" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const redirectUri = `${appUrl}/api/oauth/google/callback`;

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    return Response.json({ error: "Token exchange failed", detail: body }, { status: 502 });
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;

  await db
    .delete(providerCredentials)
    .where(and(eq(providerCredentials.userId, session.user.id), eq(providerCredentials.providerId, "gemini")));

  await db.insert(providerCredentials).values({
    userId: session.user.id,
    providerId: "gemini",
    providerName: "Google Gemini",
    authType: "oauth",
    ...encryptProviderCredentialValues({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
    }),
    scope: tokenData.scope ?? undefined,
    expiresAt: expiresAt ?? undefined,
    isEnabled: true,
  });

  // Clear PKCE cookies and redirect back to settings
  const clearCookie = "HttpOnly; Path=/; Max-Age=0; SameSite=Lax";
  const settingsUrl = `${appUrl}/settings?tab=providers&oauth=google_success`;
  const res = new Response(null, { status: 302, headers: { Location: settingsUrl } });
  res.headers.append("Set-Cookie", `google_oauth_verifier=; ${clearCookie}`);
  res.headers.append("Set-Cookie", `google_oauth_state=; ${clearCookie}`);
  return res;
}

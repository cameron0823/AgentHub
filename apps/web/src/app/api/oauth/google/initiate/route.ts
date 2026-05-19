import { type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { randomBytes, createHash } from "crypto";
import { checkProviderPlanAccess } from "@agenthub/ai-providers";
import { ensureUserQuota } from "@/server/quotas";

export const runtime = "nodejs";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPE = "https://www.googleapis.com/auth/generative-language";

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
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

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return Response.json({ error: "GOOGLE_CLIENT_ID not configured" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const redirectUri = `${appUrl}/api/oauth/google/callback`;

  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  const state = base64url(randomBytes(16));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    access_type: "offline",
    prompt: "consent",
  });

  const res = new Response(null, {
    status: 302,
    headers: { Location: `${GOOGLE_AUTH_URL}?${params.toString()}` },
  });

  // Store PKCE verifier and state in httpOnly cookies (5-minute TTL)
  const cookieOpts = "HttpOnly; Path=/; Max-Age=300; SameSite=Lax";
  res.headers.append("Set-Cookie", `google_oauth_verifier=${codeVerifier}; ${cookieOpts}`);
  res.headers.append("Set-Cookie", `google_oauth_state=${state}; ${cookieOpts}`);
  return res;
}

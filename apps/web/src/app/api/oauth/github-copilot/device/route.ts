import { NextRequest } from "next/server";
import { checkProviderPlanAccess } from "@agenthub/ai-providers";
import { auth } from "@/server/auth";
import { ensureUserQuota } from "@/server/quotas";

export const runtime = "nodejs";

const CLIENT_ID = process.env.GITHUB_COPILOT_CLIENT_ID ?? "Iv1.b507a08c87ecfe98";

export async function POST(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const quota = await ensureUserQuota(session.user.id);
  const gate = checkProviderPlanAccess("github-copilot", quota.plan);
  if (!gate.allowed) {
    return Response.json({ error: `Requires ${gate.requiredPlan} plan or higher` }, { status: 403 });
  }

  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: "read:user" }),
  });

  if (!res.ok) {
    return Response.json({ error: "GitHub device code request failed" }, { status: 502 });
  }

  const data = await res.json();
  return Response.json(data);
}

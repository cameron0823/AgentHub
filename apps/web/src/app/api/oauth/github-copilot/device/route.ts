import { NextRequest } from "next/server";

export const runtime = "nodejs";

const CLIENT_ID = process.env.GITHUB_COPILOT_CLIENT_ID ?? "Iv1.b507a08c87ecfe98";

export async function POST(_req: NextRequest) {
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

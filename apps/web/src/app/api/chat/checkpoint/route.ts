import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { resolveApproval, resolveCheckpoint } from "@/server/checkpoint-registry";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { checkpointId, approvalId, approved } = await req.json();
  if ((!checkpointId && !approvalId) || typeof approved !== "boolean") {
    return NextResponse.json({ error: "Missing checkpointId/approvalId or approved" }, { status: 400 });
  }
  const resolved = checkpointId ? resolveCheckpoint(checkpointId, approved) : resolveApproval(approvalId, approved);
  return NextResponse.json({ ok: resolved });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { resolveCheckpoint } from "@/server/checkpoint-registry";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { checkpointId, approved } = await req.json();
  if (!checkpointId || typeof approved !== "boolean") {
    return NextResponse.json({ error: "Missing checkpointId or approved" }, { status: 400 });
  }
  const resolved = resolveCheckpoint(checkpointId, approved);
  return NextResponse.json({ ok: resolved });
}

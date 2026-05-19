import { NextRequest, NextResponse } from "next/server";
import { resolveApproval, resolveCheckpoint } from "@/server/checkpoint-registry";
import { validateApiKey } from "@/server/routers/apiKeys";

export const runtime = "nodejs";

async function resolveUserId(req: NextRequest) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return validateApiKey(auth.slice("Bearer ".length).trim());
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { checkpointId, approvalId, approved } = body as {
    checkpointId?: unknown;
    approvalId?: unknown;
    approved?: unknown;
  };
  if ((typeof checkpointId !== "string" && typeof approvalId !== "string") || typeof approved !== "boolean") {
    return NextResponse.json({ error: "checkpointId/approvalId and approved are required" }, { status: 400 });
  }

  return NextResponse.json({
    ok:
      typeof checkpointId === "string"
        ? resolveCheckpoint(checkpointId, approved)
        : resolveApproval(approvalId as string, approved),
  });
}

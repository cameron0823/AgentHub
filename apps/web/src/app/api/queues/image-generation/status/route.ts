import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { imageGenerationQueue } from "@/server/queues";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const counts = await imageGenerationQueue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused",
    );
    return NextResponse.json({
      queue: "image-generation",
      counts,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        queue: "image-generation",
        degraded: true,
        error: error instanceof Error ? error.message : "Queue status unavailable",
        counts: null,
        updatedAt: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}

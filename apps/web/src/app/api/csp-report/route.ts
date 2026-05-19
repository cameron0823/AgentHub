import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/server/observability/logger";

export async function POST(req: NextRequest) {
  let report: unknown = null;
  try {
    report = await req.json();
  } catch {
    report = await req.text().catch(() => null);
  }
  logger.warn({ report }, "Content Security Policy violation");
  return new NextResponse(null, { status: 204 });
}

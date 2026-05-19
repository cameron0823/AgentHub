import { NextRequest } from "next/server";
import { buildAgentCard } from "@/server/a2a";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return Response.json(buildAgentCard(new URL(req.url).origin), {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/server/public-api";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!auth.ok) return auth.response;

  const headers = req.headers;
  if (headers.get("upgrade")?.toLowerCase() === "websocket") {
    return NextResponse.json(
      {
        error: {
          code: "websocket_gateway_unavailable",
          message:
            "The Next.js route runtime cannot host raw WebSocket upgrades here. Use the SSE fallback or /api/v1/chat/completions with stream=true.",
          fallback: "/api/v1/ws",
        },
      },
      { status: 426 },
    );
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`event: gateway.ready\ndata: ${JSON.stringify({ ok: true, transport: "sse" })}\n\n`),
      );
      controller.enqueue(
        encoder.encode(
          `event: gateway.fallback\ndata: ${JSON.stringify({ chatCompletions: "/api/v1/chat/completions", stream: true })}\n\n`,
        ),
      );
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

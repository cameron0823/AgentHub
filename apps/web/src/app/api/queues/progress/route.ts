import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { jobProgressPublisher, type JobProgressEvent } from "@/server/queues";

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, payload: unknown) => controller.enqueue(encoder.encode(sse(event, payload)));
      const unsubscribe = jobProgressPublisher.subscribe(session.user.id, (event: JobProgressEvent) => {
        send("progress", event);
      });
      const heartbeat = setInterval(() => send("heartbeat", { ok: true, ts: Date.now() }), 25_000);
      const close = () => {
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      };

      send("ready", { ok: true, userId: session.user.id });
      req.signal.addEventListener("abort", close, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { providerCredentials } from "@/server/db/schema";
import { validateProviderBaseUrl } from "@/server/security/outbound";

export const runtime = "nodejs";

async function resolveOllamaBaseUrl(userId: string) {
  const [cred] = await db
    .select({ baseUrl: providerCredentials.baseUrl })
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.userId, userId),
        eq(providerCredentials.providerId, "ollama"),
        eq(providerCredentials.isEnabled, true),
      ),
    )
    .limit(1);
  return validateProviderBaseUrl(cred?.baseUrl, process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
}

function normalizePullProgress(data: Record<string, unknown>) {
  const completed = typeof data.completed === "number" ? data.completed : 0;
  const total = typeof data.total === "number" ? data.total : 0;
  return {
    type: data.status === "success" ? "done" : "progress",
    status: typeof data.status === "string" ? data.status : "pulling",
    digest: typeof data.digest === "string" ? data.digest : null,
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : null,
  };
}

export async function POST(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!/^[A-Za-z0-9._:/-]{1,120}$/.test(model)) {
    return new Response(JSON.stringify({ error: "A valid Ollama model name is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const baseUrl = await resolveOllamaBaseUrl(session.user.id);
  const upstream = await fetch(`${baseUrl}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model, stream: true }),
    signal: req.signal,
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(JSON.stringify({ error: detail || "Unable to start Ollama pull" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line) as Record<string, unknown>;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(normalizePullProgress(data))}\n\n`));
            } catch {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "progress", status: line.trim() })}\n\n`),
              );
            }
          }
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done", status: "complete", percent: 100 })}\n\n`),
        );
      } catch (error) {
        if (!req.signal.aborted) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "Pull failed" })}\n\n`,
            ),
          );
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

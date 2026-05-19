import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { executeLocalA2ATask } from "@/server/a2a";

export const runtime = "nodejs";

const MAX_TASK_LENGTH = 10_000;

export async function POST(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { agentId, task } = body as { agentId?: unknown; task?: unknown };

  if (typeof agentId !== "string" || !agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }
  if (typeof task !== "string" || !task.trim()) {
    return NextResponse.json({ error: "task is required" }, { status: 400 });
  }
  if (task.length > MAX_TASK_LENGTH) {
    return NextResponse.json(
      { error: `task exceeds maximum length of ${MAX_TASK_LENGTH} characters` },
      { status: 400 },
    );
  }

  try {
    const result = await executeLocalA2ATask({
      userId: session.user.id,
      agentId,
      task: task.trim(),
      signal: req.signal,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent delegation failed";
    const status = message === "Agent not found" ? 404 : message.includes("quota") ? 429 : 500;
    return NextResponse.json({ error: status === 500 ? "Agent delegation failed" : message }, { status });
  }
}

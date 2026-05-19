import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  runHeterogeneousAgent,
  type HeterogeneousAgentProfile,
  type HeterogeneousRunStatus,
} from "@agenthub/agent-runtime";
import { db } from "@/server/db";
import { validateApiKey } from "@/server/routers/apiKeys";
import {
  chatSessions,
  heterogeneousAgentProfiles,
  heterogeneousAgentRuns,
  messages as messagesTable,
} from "@/server/db/schema";

export const runtime = "nodejs";

const AUTHORIZATION_HEADER = "Authorization";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface HeteroExecBody {
  agentId?: string;
  input?: string;
  inputFileName?: string;
  args?: string[];
  sessionId?: string;
  stream?: boolean;
}

interface ValidHeteroExecBody {
  agentId: string;
  input: string;
  inputFileName?: string;
  args?: string[];
  sessionId?: string;
  stream?: boolean;
}

async function resolveUserId(req: NextRequest) {
  const auth = req.headers.get(AUTHORIZATION_HEADER) ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return validateApiKey(auth.slice("Bearer ".length).trim());
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function parseStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function toRuntimeProfile(row: typeof heterogeneousAgentProfiles.$inferSelect): HeterogeneousAgentProfile {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    kind: row.kind,
    command: row.command,
    args: parseStringArray(row.args),
    workingDirectory: row.workingDirectory,
    env: parseStringRecord(row.env),
    isEnabled: row.isEnabled,
  };
}

function sse(event: unknown) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function validateBody(body: unknown): ValidHeteroExecBody | NextResponse {
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const input = body as HeteroExecBody;
  if (!input.agentId || !UUID_RE.test(input.agentId)) {
    return NextResponse.json({ error: "agentId is required and must be a UUID" }, { status: 400 });
  }
  if (typeof input.input !== "string" || input.input.length === 0) {
    return NextResponse.json({ error: "input is required" }, { status: 400 });
  }
  if (input.sessionId && !UUID_RE.test(input.sessionId)) {
    return NextResponse.json({ error: "sessionId must be a UUID" }, { status: 400 });
  }
  if (input.args && (!Array.isArray(input.args) || input.args.some((arg) => typeof arg !== "string"))) {
    return NextResponse.json({ error: "args must be a string array" }, { status: 400 });
  }
  return {
    agentId: input.agentId,
    input: input.input,
    inputFileName: input.inputFileName,
    args: input.args,
    sessionId: input.sessionId,
    stream: input.stream,
  };
}

async function resolveSession(userId: string, body: ValidHeteroExecBody, profileName: string) {
  if (body.sessionId) {
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, body.sessionId), eq(chatSessions.userId, userId)))
      .limit(1);
    return session ?? null;
  }

  const [session] = await db
    .insert(chatSessions)
    .values({
      userId,
      title: `CLI hetero: ${profileName}`,
      model: "heterogeneous:cli",
      metadata: {
        source: "agenthub-cli",
        inputFileName: body.inputFileName ?? null,
      },
    })
    .returning();
  return session;
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = validateBody(json);
  if (body instanceof NextResponse) return body;

  const [profileRow] = await db
    .select()
    .from(heterogeneousAgentProfiles)
    .where(and(eq(heterogeneousAgentProfiles.id, body.agentId), eq(heterogeneousAgentProfiles.userId, userId)))
    .limit(1);
  if (!profileRow) {
    return NextResponse.json({ error: "Heterogeneous agent profile not found" }, { status: 404 });
  }

  const session = await resolveSession(userId, body, profileRow.name);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const [run] = await db
    .insert(heterogeneousAgentRuns)
    .values({
      userId,
      profileId: profileRow.id,
      sessionId: session.id,
      status: "running",
      input: body.input,
      startedAt: new Date(),
      metadata: {
        source: "agenthub-cli",
        inputFileName: body.inputFileName ?? null,
        args: body.args ?? [],
      },
    })
    .returning();

  await db.insert(messagesTable).values({
    sessionId: session.id,
    role: "user",
    content: body.input,
    metadata: {
      source: "agenthub-cli",
      inputFileName: body.inputFileName ?? null,
      heterogeneousRunId: run.id,
    },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let output = "";
      let error = "";
      let exitCode: number | null = null;
      let finalStatus: HeterogeneousRunStatus = "success";
      const events: unknown[] = [];

      const emit = (event: unknown) => controller.enqueue(encoder.encode(sse(event)));
      emit({ type: "session", sessionId: session.id, runId: run.id });

      try {
        for await (const event of runHeterogeneousAgent(toRuntimeProfile(profileRow), {
          prompt: body.input,
          args: body.args,
        })) {
          events.push(event);
          emit(event);
          if (event.type === "stdout") output += event.content;
          if (event.type === "stderr") error += event.content;
          if (event.type === "status" && event.status === "feature_disabled") {
            finalStatus = "feature_disabled";
            error = event.message || "Heterogeneous runtime is disabled.";
          }
          if (event.type === "status" && event.status === "error") {
            finalStatus = "error";
            error = event.message || error;
          }
          if (event.type === "exit") {
            exitCode = event.exitCode;
            if (event.exitCode !== 0) finalStatus = "error";
          }
        }
      } catch (err) {
        finalStatus = "error";
        error = err instanceof Error ? err.message : String(err);
        emit({ type: "status", status: "error", message: error });
      }

      await db
        .update(heterogeneousAgentRuns)
        .set({
          status: finalStatus,
          output: output || null,
          error: error || null,
          exitCode,
          metadata: {
            source: "agenthub-cli",
            inputFileName: body.inputFileName ?? null,
            args: body.args ?? [],
            events,
          },
          completedAt: new Date(),
        })
        .where(and(eq(heterogeneousAgentRuns.id, run.id), eq(heterogeneousAgentRuns.userId, userId)));

      await db.insert(messagesTable).values({
        sessionId: session.id,
        role: "assistant",
        content: output || error || `Heterogeneous run finished with status ${finalStatus}.`,
        model: `heterogeneous:${profileRow.kind}`,
        metadata: {
          source: "agenthub-cli",
          heterogeneousRunId: run.id,
          status: finalStatus,
          exitCode,
        },
      });

      await db
        .update(chatSessions)
        .set({ updatedAt: new Date() })
        .where(and(eq(chatSessions.id, session.id), eq(chatSessions.userId, userId)));

      emit({ type: "done", sessionId: session.id, runId: run.id, status: finalStatus, output, error });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

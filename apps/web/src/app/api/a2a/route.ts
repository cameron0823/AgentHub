import { NextRequest } from "next/server";
import { auth } from "@/server/auth";
import {
  buildAgentCard,
  createTaskRecord,
  executeLocalA2ATask,
  getTaskRecord,
  negotiateCapabilities,
  updateTaskRecord,
} from "@/server/a2a";

export const runtime = "nodejs";

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function jsonRpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string, status = 400) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
}

function getTaskText(params: Record<string, unknown> | undefined) {
  const message = params?.message ?? params?.task ?? params?.text;
  if (typeof message === "string") return message.trim();
  if (message && typeof message === "object" && typeof (message as { text?: unknown }).text === "string") {
    return (message as { text: string }).text.trim();
  }
  return "";
}

function getAgentId(params: Record<string, unknown> | undefined) {
  return typeof params?.agentId === "string" ? params.agentId : "";
}

export async function POST(req: NextRequest) {
  const rpc = (await req.json().catch(() => null)) as JsonRpcRequest | null;
  if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
    return jsonRpcError(null, -32600, "Invalid JSON-RPC request");
  }

  if (rpc.method === "agent/card") {
    const card = buildAgentCard(new URL(req.url).origin);
    const clientCapabilities =
      rpc.params?.capabilities && typeof rpc.params.capabilities === "object"
        ? (rpc.params.capabilities as Partial<typeof card.capabilities>)
        : {};
    return jsonRpcResult(rpc.id, {
      card,
      negotiated: negotiateCapabilities(clientCapabilities, card),
    });
  }

  const session = await auth(req.headers);
  if (!session?.user) {
    return jsonRpcError(rpc.id, -32001, "Unauthorized", 401);
  }

  if (rpc.method === "tasks/get") {
    const taskId = typeof rpc.params?.taskId === "string" ? rpc.params.taskId : "";
    const record = taskId ? getTaskRecord(taskId, session.user.id) : null;
    if (!record) return jsonRpcError(rpc.id, -32004, "Task not found", 404);
    return jsonRpcResult(rpc.id, record);
  }

  if (rpc.method === "tasks/cancel") {
    const taskId = typeof rpc.params?.taskId === "string" ? rpc.params.taskId : "";
    const record = taskId ? updateTaskRecord(taskId, session.user.id, { status: "cancelled" }) : null;
    if (!record) return jsonRpcError(rpc.id, -32004, "Task not found", 404);
    return jsonRpcResult(rpc.id, record);
  }

  if (rpc.method === "tasks/send") {
    const agentId = getAgentId(rpc.params);
    const task = getTaskText(rpc.params);
    if (!agentId || !task) return jsonRpcError(rpc.id, -32602, "agentId and task are required");
    const record = createTaskRecord(session.user.id, agentId, task);
    updateTaskRecord(record.id, session.user.id, { status: "working" });
    try {
      const result = await executeLocalA2ATask({ userId: session.user.id, agentId, task, signal: req.signal });
      const completed = updateTaskRecord(record.id, session.user.id, { status: "completed", output: result.output });
      return jsonRpcResult(rpc.id, {
        task: completed,
        artifacts: [{ type: "text", text: result.output }],
        usage: { tokensUsed: result.tokensUsed, latencyMs: result.latencyMs },
      });
    } catch (error) {
      const failed = updateTaskRecord(record.id, session.user.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Task failed",
      });
      return jsonRpcError(rpc.id, -32000, failed?.error ?? "Task failed", 500);
    }
  }

  if (rpc.method === "tasks/sendSubscribe") {
    const agentId = getAgentId(rpc.params);
    const task = getTaskText(rpc.params);
    if (!agentId || !task) return jsonRpcError(rpc.id, -32602, "agentId and task are required");
    const encoder = new TextEncoder();
    const record = createTaskRecord(session.user.id, agentId, task);
    const stream = new ReadableStream({
      async start(controller) {
        const send = (result: unknown) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ jsonrpc: "2.0", id: rpc.id ?? null, result })}\n\n`),
          );
        send({ task: record });
        try {
          send({ task: updateTaskRecord(record.id, session.user.id, { status: "working" }) });
          const result = await executeLocalA2ATask({ userId: session.user.id, agentId, task, signal: req.signal });
          const completed = updateTaskRecord(record.id, session.user.id, {
            status: "completed",
            output: result.output,
          });
          send({
            task: completed,
            artifacts: [{ type: "text", text: result.output }],
            usage: { tokensUsed: result.tokensUsed, latencyMs: result.latencyMs },
          });
        } catch (error) {
          const failed = updateTaskRecord(record.id, session.user.id, {
            status: "failed",
            error: error instanceof Error ? error.message : "Task failed",
          });
          send({ task: failed, error: failed?.error });
        } finally {
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

  return jsonRpcError(rpc.id, -32601, "Method not found", 404);
}

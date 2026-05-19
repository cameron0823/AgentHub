import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { executeMcpToolForUser, McpExecutionError } from "@/server/mcp-execution";

export const runtime = "nodejs";

const callMcpToolSchema = z.object({
  serverId: z.string().uuid(),
  toolName: z.string().min(1),
  args: z.record(z.unknown()).default({}),
});

export async function POST(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = callMcpToolSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid MCP tool request", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const result = await executeMcpToolForUser({
      userId: session.user.id,
      agentId: null,
      serverId: parsed.data.serverId,
      toolName: parsed.data.toolName,
      args: parsed.data.args,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof McpExecutionError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json(
      { error: { code: "mcp_tool_failed", message: "MCP tool execution failed" } },
      { status: 500 },
    );
  }
}

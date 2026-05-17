import { NextRequest, NextResponse } from "next/server";
import { AgentRuntime } from "@agenthub/agent-runtime";
import { db } from "@/server/db";
import { agents, providerCredentials } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/server/auth";
import { providerRegistry, type ProviderRegistry } from "@agenthub/ai-providers";
import { fetchAcceptedMemoriesForAgent, formatMemoryBlock, appendMemoryBlockToSystemPrompt } from "@/server/memory";

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
    return NextResponse.json({ error: `task exceeds maximum length of ${MAX_TASK_LENGTH} characters` }, { status: 400 });
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, session.user.id)))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const userCreds = await db
    .select()
    .from(providerCredentials)
    .where(and(eq(providerCredentials.userId, session.user.id), eq(providerCredentials.isEnabled, true)));
  const registry: ProviderRegistry = userCreds.length > 0
    ? providerRegistry.forUser(userCreds.map((c) => ({
        providerId: c.providerId,
        authType: c.authType as "api_key" | "oauth",
        apiKey: c.apiKey || undefined,
        baseUrl: c.baseUrl || undefined,
        accessToken: c.accessToken || undefined,
        expiresAt: c.expiresAt,
      })))
    : providerRegistry;

  // Memory injection
  let systemPrompt = agent.systemPrompt;
  if (agent.memoryEnabled) {
    const memories = await fetchAcceptedMemoriesForAgent(agent.id);
    const memoryBlock = formatMemoryBlock(memories);
    systemPrompt = appendMemoryBlockToSystemPrompt(systemPrompt, memoryBlock) ?? systemPrompt;
  }

  const runtime = new AgentRuntime({
    model: agent.model ?? "ollama:qwen2.5:7b",
    systemPrompt,
    temperature: agent.temperature ?? 0.7,
    maxTokens: agent.maxTokens ?? 4096,
    registry,
  });

  const startMs = Date.now();
  let output = "";

  try {
    for await (const chunk of runtime.run({
      sessionId: `a2a-${session.user.id}`,
      messages: [{ role: "user", content: task.trim() }],
      tools: [],
    })) {
      if (chunk.type === "content" && chunk.content) {
        output += chunk.content;
      }
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const latencyMs = Date.now() - startMs;
  const tokensUsed = Math.ceil(output.length / 4);

  return NextResponse.json({
    agentId: agent.id,
    agentName: agent.name,
    output,
    tokensUsed,
    latencyMs,
  });
}

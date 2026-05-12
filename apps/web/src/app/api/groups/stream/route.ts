import { NextRequest } from "next/server";
import { ParallelOrchestrator, SequentialOrchestrator, SupervisorOrchestrator, DebateOrchestrator, GroupChatOrchestrator, type OrchestratorEvent } from "@agenthub/agent-runtime";
import { db } from "@/server/db";
import { agentGroups, agents, groupMembers, messages as messagesTable, chatSessions } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/server/auth";

export const runtime = "nodejs";

function parseAgentTools(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tool): tool is string => typeof tool === "string") : [];
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { groupId, sessionId, task } = await req.json();

  if (!groupId || !sessionId || !task) {
    return new Response(JSON.stringify({ error: "groupId, sessionId, and task are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [chatSession] = await db.select({ id: chatSessions.id })
    .from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, session.user.id)))
    .limit(1);
  if (!chatSession) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [group] = await db.select().from(agentGroups)
    .where(and(eq(agentGroups.id, groupId), eq(agentGroups.userId, session.user.id)))
    .limit(1);
  if (!group) {
    return new Response(JSON.stringify({ error: "Agent group not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const memberRows = await db
    .select({ member: groupMembers, agent: agents })
    .from(groupMembers)
    .innerJoin(agents, eq(groupMembers.agentId, agents.id))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(groupMembers.sortOrder);

  if (memberRows.length === 0) {
    return new Response(JSON.stringify({ error: "Agent group has no members" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  await db.insert(messagesTable).values({
    sessionId,
    role: "user",
    content: task,
  });

  // Select orchestrator based on group pattern
  function getOrchestrator(pattern: string) {
    switch (pattern) {
      case "parallel": return new ParallelOrchestrator();
      case "supervisor": return new SupervisorOrchestrator();
      case "debate": return new DebateOrchestrator();
      case "groupchat": return new GroupChatOrchestrator();
      case "sequential":
      default: return new SequentialOrchestrator();
    }
  }

  const orchestrator = getOrchestrator(group.pattern);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let finalEvent: Extract<OrchestratorEvent, { type: "group_complete" }> | null = null;
      try {
        const events = orchestrator.run({
          sessionId,
          task,
          group: {
            id: group.id,
            name: group.name,
            description: group.description,
            pattern: group.pattern,
          },
          agents: memberRows.map(({ member, agent }) => ({
            id: agent.id,
            name: agent.name,
            role: member.role,
            sortOrder: member.sortOrder,
            tools: parseAgentTools(agent.tools),
            runtimeOptions: {
              model: agent.model || "ollama:qwen2.5:7b",
              systemPrompt: agent.systemPrompt,
              temperature: agent.temperature ?? undefined,
              maxTokens: agent.maxTokens ?? undefined,
            },
          })),
          signal: req.signal,
        });

        for await (const event of events) {
          if (event.type === "group_complete") {
            finalEvent = event;
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }

        if (req.signal.aborted) {
          controller.close();
          return;
        }

        if (finalEvent) {
          const msgId = crypto.randomUUID();
          await db.insert(messagesTable).values({
            id: msgId,
            sessionId,
            role: "assistant",
            content: finalEvent.synthesis,
            toolCalls: JSON.stringify(finalEvent.outputs.map((output) => ({
              agentId: output.agentId,
              agentName: output.agentName,
              output: output.output,
            }))),
          });
          await db.update(chatSessions).set({ groupId, updatedAt: new Date() }).where(eq(chatSessions.id, sessionId));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "persisted", messageId: msgId })}\n\n`));
        }

        controller.close();
      } catch (err) {
        if (req.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
          controller.close();
          return;
        }
        const error = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error })}\n\n`));
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

import { NextRequest } from "next/server";
import { AgentRuntime, MCPClient, SequentialOrchestrator, ParallelOrchestrator, SupervisorOrchestrator, DebateOrchestrator, GroupChatOrchestrator } from "@agenthub/agent-runtime";
import { db } from "@/server/db";
import { agents, messages as messagesTable, chatSessions, providerCredentials, mcpServers, agentGroups, groupMembers } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/server/auth";
import { providerRegistry } from "@agenthub/ai-providers";
import { fetchAcceptedMemoriesForAgent, formatMemoryBlock, appendMemoryBlockToSystemPrompt, extractMemories, storePendingMemories } from "@/server/memory";
import { substituteVariables } from "@/server/prompt-variables";
import { sql } from "drizzle-orm";
import { documentChunks, documents, knowledgeBases } from "@/server/db/schema";

export const runtime = "nodejs";

const DEFAULT_MODEL_ID = "ollama:qwen2.5:7b";

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

  // Load user's cloud provider credentials into registry
  const userCreds = await db.select().from(providerCredentials)
    .where(and(eq(providerCredentials.userId, session.user.id), eq(providerCredentials.isEnabled, true)));
  if (userCreds.length > 0) {
    providerRegistry.loadUserCredentials(userCreds.map((c) => ({
      providerId: c.providerId,
      authType: c.authType as "api_key" | "oauth",
      apiKey: c.apiKey || undefined,
      baseUrl: c.baseUrl || undefined,
      accessToken: c.accessToken || undefined,
      expiresAt: c.expiresAt,
    })));
  }

  const { sessionId, model, messages: chatMessages, temperature, maxTokens, tools } = await req.json();

  const [chatSession] = await db.select({ id: chatSessions.id, agentId: chatSessions.agentId, groupId: chatSessions.groupId, model: chatSessions.model })
    .from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, session.user.id)))
    .limit(1);

  if (!chatSession) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [sessionAgent] = chatSession.agentId
    ? await db.select().from(agents).where(eq(agents.id, chatSession.agentId)).limit(1)
    : [];

  const effectiveModel = sessionAgent?.model || model || chatSession.model || DEFAULT_MODEL_ID;
  const effectiveTools = sessionAgent ? parseAgentTools(sessionAgent.tools) : (tools || ["calculator", "datetime"]);

  // White-box memory injection
  let memoryBlock = "";
  if (sessionAgent?.memoryEnabled && sessionAgent?.id) {
    const memories = await fetchAcceptedMemoriesForAgent(sessionAgent.id);
    memoryBlock = formatMemoryBlock(memories);
  }
  const systemPrompt = appendMemoryBlockToSystemPrompt(sessionAgent?.systemPrompt, memoryBlock);

  // RAG: Knowledge Base retrieval (appends to resolvedPrompt, providing grounded context)
  let ragSourcesForStream: Array<{ id: string; documentId: string; content: string; similarity: number }> = [];
  let resolvedPrompt = substituteVariables(systemPrompt || "", {
    userName: session.user.name ?? undefined,
    date: new Date(),
    agentName: sessionAgent?.name ?? undefined,
  });
  if (sessionAgent?.knowledgeBaseId) {
    const kb = await db.select().from(knowledgeBases)
      .where(and(eq(knowledgeBases.id, sessionAgent.knowledgeBaseId), eq(knowledgeBases.userId, session.user.id)))
      .limit(1);

    if (kb[0]) {
      const lastUserMessage = [...chatMessages].reverse().find((m) => m.role === "user");
      if (lastUserMessage?.content) {
        // Validate OLLAMA_URL to prevent SSRF to internal services
        const rawOllamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
        const ollamaUrl = (() => {
          try {
            const parsed = new URL(rawOllamaUrl);
            if (!["http:", "https:"].includes(parsed.protocol)) return "http://localhost:11434";
            return rawOllamaUrl;
          } catch {
            return "http://localhost:11434";
          }
        })();

        let embedData: { embedding?: unknown[] } | undefined;
        try {
          const embedRes = await fetch(`${ollamaUrl}/api/embeddings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: kb[0].embeddingModel || "nomic-embed-text", prompt: lastUserMessage.content }),
          });
          if (embedRes.ok) {
            embedData = (await embedRes.json()) as { embedding?: unknown[] };
          }
        } catch (e) {
          console.error("Ollama embedding request failed (non-fatal):", e);
        }

        if (embedData?.embedding) {
          // Validate all entries are finite numbers — prevents injection if Ollama API is compromised
          const rawEmb = embedData.embedding;
          if (!Array.isArray(rawEmb) || !rawEmb.every((v) => typeof v === "number" && isFinite(v))) {
            console.error("Invalid embedding from Ollama: non-numeric values, skipping RAG");
          } else {
            const safeEmbedding = rawEmb as number[];
            const embStr = `[${safeEmbedding.join(",")}]`;
            // Use sql.param() to bind embStr as a SQL parameter — prevents raw string injection
            const ragResults = await db.select({
              id: documentChunks.id,
              content: documentChunks.content,
              documentId: documentChunks.documentId,
              similarity: sql<number>`1 - (${documentChunks.embedding} <=> ${sql.param(embStr)}::vector)`,
            })
              .from(documentChunks)
              .innerJoin(documents, eq(documentChunks.documentId, documents.id))
              .where(and(
                eq(documents.knowledgeBaseId, kb[0].id),
                eq(documents.status, "indexed")
              ))
              .orderBy(sql`${documentChunks.embedding} <=> ${sql.param(embStr)}::vector`)
              .limit(5);

            if (ragResults.length > 0) {
              ragSourcesForStream = ragResults.map((r) => ({ id: r.id, documentId: r.documentId, content: r.content.slice(0, 200), similarity: r.similarity }));
              const ragContext = [
                "## Relevant Knowledge Base Context",
                ...ragResults.map((r, i) => `[${i + 1}] ${r.content}`),
                "\nUse the above context to answer the user's question. Cite sources using [1], [2], etc. when referencing specific information.",
              ].join("\n\n");
              resolvedPrompt = resolvedPrompt ? `${resolvedPrompt}\n\n${ragContext}` : ragContext;
            }
          }
        }
      }
    }
  }

  // Load and connect enabled MCP servers for this user
  const userMcpServers = await db.select().from(mcpServers)
    .where(and(eq(mcpServers.userId, session.user.id), eq(mcpServers.enabled, true)));

  const mcpClients: MCPClient[] = [];
  const extraTools: Array<{ name: string; description: string; parameters: Record<string, unknown>; execute: (args: Record<string, unknown>) => Promise<unknown> }> = [];

  await Promise.allSettled(userMcpServers.map(async (srv) => {
    const config = srv.transport === "stdio"
      ? { transport: "stdio" as const, command: srv.command!, args: srv.args ? JSON.parse(srv.args) : [], env: srv.env ? JSON.parse(srv.env) : {} }
      : { transport: "http" as const, url: srv.url! };
    const client = new MCPClient(config);
    try {
      await client.connect();
      mcpClients.push(client);
      for (const tool of client.getTools()) {
        extraTools.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema as Record<string, unknown>,
          execute: (args) => client.callTool(tool.name, args) as Promise<unknown>,
        });
      }
    } catch {
      // Skip unavailable MCP servers silently
    }
  }));

  // Fetch group config if session has a groupId
  let groupConfig: { id: string; name: string; pattern: string; members: { agentId: string; role: string | null; sortOrder: number | null }[] } | null = null;
  if (chatSession.groupId) {
    const [grp] = await db.select().from(agentGroups).where(eq(agentGroups.id, chatSession.groupId)).limit(1);
    if (grp) {
      const members = await db
        .select({ agentId: groupMembers.agentId, role: groupMembers.role, sortOrder: groupMembers.sortOrder })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, grp.id));
      groupConfig = { id: grp.id, name: grp.name, pattern: grp.pattern, members };
    }
  }

  const agent = new AgentRuntime({
    model: effectiveModel,
    systemPrompt: resolvedPrompt,
    temperature: sessionAgent?.temperature ?? temperature,
    maxTokens: sessionAgent?.maxTokens ?? maxTokens,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = "";
      let fullReasoning = "";
      let toolCalls: any[] = [];

      try {
        if (ragSourcesForStream.length > 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "rag_sources", sources: ragSourcesForStream })}\n\n`));
        }

        // Group orchestration path
        if (groupConfig) {
          const groupAgents = await Promise.all(
            groupConfig.members.map(async (m) => {
              const [a] = await db.select().from(agents).where(eq(agents.id, m.agentId)).limit(1);
              if (!a) return null;
              return {
                id: a.id,
                name: a.name,
                role: m.role,
                sortOrder: m.sortOrder,
                tools: parseAgentTools(a.tools),
                runtimeOptions: {
                  model: a.model ?? effectiveModel,
                  systemPrompt: a.systemPrompt,
                  temperature: a.temperature ?? 0.7,
                  maxTokens: a.maxTokens ?? 4096,
                },
              };
            })
          );
          const validAgents = groupAgents.filter(Boolean) as NonNullable<typeof groupAgents[number]>[];
          const lastUserMsg = [...chatMessages].reverse().find((m: any) => m.role === "user");
          const task = lastUserMsg?.content ?? "";

          const orchestratorMap: Record<string, new () => { run: (opts: any) => AsyncGenerator<any> }> = {
            sequential: SequentialOrchestrator,
            parallel: ParallelOrchestrator,
            supervisor: SupervisorOrchestrator,
            debate: DebateOrchestrator,
            groupchat: GroupChatOrchestrator,
          };
          const OrchestratorClass = orchestratorMap[groupConfig.pattern] ?? SequentialOrchestrator;
          const orchestrator = new OrchestratorClass();
          const orchStream = orchestrator.run({
            group: { id: groupConfig.id, name: groupConfig.name, pattern: groupConfig.pattern as any },
            agents: validAgents,
            task,
            sessionId,
            messages: chatMessages,
            signal: req.signal,
          });

          const startMs = Date.now();
          for await (const event of orchStream) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "orchestrator_event", event })}\n\n`));
            if (event.type === "agent_output" && event.chunk.type === "content") {
              fullContent += event.chunk.content ?? "";
            }
            if (event.type === "group_complete") {
              fullContent = event.synthesis;
            }
          }
          const latencyMs = Date.now() - startMs;
          const approxTokens = Math.ceil(fullContent.length / 4);
          if (fullContent) {
            await db.insert(messagesTable).values({
              sessionId,
              role: "assistant",
              content: fullContent,
              tokensUsed: approxTokens,
              latencyMs,
            });
            const extracted = await extractMemories(task, fullContent, effectiveModel);
            if (sessionAgent?.id && session.user.id && extracted.length > 0) {
              await storePendingMemories(sessionAgent.id, session.user.id, extracted);
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        const agentStream = agent.run({
          sessionId,
          messages: chatMessages,
          tools: effectiveTools,
          extraTools,
          signal: req.signal,
        });

        const streamStartMs = Date.now();
        for await (const chunk of agentStream) {
          const data = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(encoder.encode(data));

          if (chunk.type === "content" && chunk.content) {
            fullContent += chunk.content;
          }
          if (chunk.type === "reasoning" && chunk.content) {
            fullReasoning += chunk.content;
          }
          if (chunk.type === "tool_call" && chunk.toolCall) {
            toolCalls.push(chunk.toolCall);
          }
        }
        const latencyMs = Date.now() - streamStartMs;
        const approxTokens = Math.ceil(fullContent.length / 4);

        if (!fullContent && !fullReasoning && toolCalls.length === 0) {
          // nothing to persist
        } else {
          const [savedMsg] = await db.insert(messagesTable).values({
            sessionId,
            role: "assistant",
            content: fullContent,
            reasoning: fullReasoning || null,
            model: effectiveModel,
            toolCalls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
            metadata: ragSourcesForStream.length > 0 ? { ragSources: ragSourcesForStream } : null,
            tokensUsed: approxTokens,
            latencyMs,
          }).returning();

          await db.update(chatSessions)
            .set({ updatedAt: new Date() })
            .where(eq(chatSessions.id, sessionId));

          // Fire-and-forget memory extraction — doesn't block the stream close
          if (sessionAgent?.memoryEnabled && sessionAgent?.id && fullContent) {
            const lastUser = [...chatMessages].reverse().find((m: { role: string }) => m.role === "user");
            if (lastUser?.content) {
              const agentIdSnapshot = sessionAgent.id;
              const userIdSnapshot = session.user.id;
              const msgIdSnapshot = savedMsg?.id;
              void (async () => {
                try {
                  const extracted = await extractMemories(lastUser.content, fullContent, effectiveModel);
                  if (extracted.length > 0) {
                    await storePendingMemories(agentIdSnapshot, userIdSnapshot, extracted, msgIdSnapshot);
                  }
                } catch (e) {
                  console.error("Memory extraction failed (non-fatal):", e);
                }
              })();
            }
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      } catch (err) {
        const errorMsg = (err as Error).message;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`));
      } finally {
        mcpClients.forEach(c => { try { c.disconnect(); } catch { /* ignore */ } });
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

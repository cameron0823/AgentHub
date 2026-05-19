import { NextRequest } from "next/server";
import {
  AgentRuntime,
  MCPClient,
  SequentialOrchestrator,
  ParallelOrchestrator,
  SupervisorOrchestrator,
  IterativeOrchestrator,
  DebateOrchestrator,
  GroupChatOrchestrator,
  globalToolRegistry,
  visualUnderstandingTool,
  imageGenerationTool,
  type ApprovalRequest,
  type GeneratedImageToolResource,
  type GeneratedImageToolResult,
} from "@agenthub/agent-runtime";
import { db } from "@/server/db";
import {
  agents,
  messages as messagesTable,
  chatSessions,
  providerCredentials,
  mcpServers,
  agentGroups,
  groupMembers,
  resources,
  installedSkills,
  skillResources,
  files as filesTable,
  projectChats,
  projectNotebookDocuments,
} from "@/server/db/schema";
import { eq, and, inArray, ilike, desc } from "drizzle-orm";
import { auth } from "@/server/auth";
import {
  modelSupportsCapability,
  providerRegistry,
  checkProviderPlanAccess,
  resolveRoute,
  type Message,
  type ProviderHealth,
  type ProviderRegistry,
  type ReasoningTimelineEvent,
  type RouteDecision,
  type RouteStrategy,
} from "@agenthub/ai-providers";
import {
  fetchAcceptedMemoriesForAgent,
  formatMemoryBlock,
  appendMemoryBlockToSystemPrompt,
  extractMemories,
  storePendingMemories,
} from "@/server/memory";
import { substituteVariables } from "@/server/prompt-variables";
import { knowledgeBases, documents, documentChunks } from "@/server/db/schema";
import { hybridKbSearch } from "@/server/kb-search";
import { truncateToContextWindow } from "@/server/context-window";
import { registerActionApproval, registerCheckpoint } from "@/server/checkpoint-registry";
import { validateMessageMedia } from "@/server/media-safety";
import { buildMcpClientConfig } from "@/server/mcp-config";
import { createInstalledOpenApiPlugin, createOpenApiRuntimeTools } from "@/server/marketplace/openapi";
import { createSkillRuntimeRecords, createSkillRuntimeTools } from "@/server/skills/runtime";
import { recordApprovalAuditEvent, recordToolProfileAuditEvent } from "@/server/routers/trust";
import { resolveCredential } from "@/server/trust-engine";
import {
  createSandboxSessionFromToolResult,
  persistSandboxOutputs,
  sandboxResourcesFromSession,
  type SandboxSession,
} from "@/server/sandbox";
import { enforceMcpGovernance } from "@/server/mcp-governance";
import { compileToolProfile, isToolAllowedByProfile } from "@/server/tool-profiles";
import { validateProviderBaseUrl } from "@/server/security/outbound";
import { decryptProviderCredentials } from "@/server/provider-credentials";
import { extractArtifactsFromContent } from "@/server/artifacts";
import { checkQuota, ensureUserQuota, incrementQuota } from "@/server/quotas";
import { buildMentionedAgentSystemBlock, extractAgentMentions, type MentionableAgent } from "@/lib/agent-mentions";
import {
  buildFileSnapshotSystemBlock,
  getUploadedFileSnapshotIds,
  mergeFileSnapshots,
  normalizeFileSnapshots,
  type FileSnapshot,
} from "@/lib/file-snapshots";

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

function parseStringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function parseEnabledSkillSlugs(enabledTools: string[]) {
  return [
    ...new Set(
      enabledTools
        .filter((tool) => tool.startsWith("skill:"))
        .map((tool) => tool.slice("skill:".length).trim())
        .filter(Boolean),
    ),
  ];
}

function parseFallbackModelIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((modelId): modelId is string => typeof modelId === "string" && modelId.trim().length > 0);
  }
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((modelId): modelId is string => typeof modelId === "string" && modelId.trim().length > 0);
    }
  } catch {
    // Fall through to comma/newline parsing.
  }

  return value
    .split(/[\n,]/)
    .map((modelId) => modelId.trim())
    .filter(Boolean);
}

async function collectProviderHealth(registry: ProviderRegistry = providerRegistry): Promise<ProviderHealth[]> {
  const list = registry.list();
  const results = await Promise.allSettled(list.map((provider) => provider.healthCheck()));
  return results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const provider = list[index];
    return {
      id: provider?.id ?? "unknown",
      name: provider?.name ?? "Unknown provider",
      status: "unhealthy",
      latency: -1,
    };
  });
}

type RagStreamSource = {
  id: string;
  documentId: string;
  content: string;
  similarity: number;
  sourceName?: string;
  sourceType?: string;
  mimeType?: string;
  sourceUrl?: string;
  citation?: string;
  metadata?: Record<string, unknown>;
};

function buildMessageMetadata(
  routeDecision: RouteDecision,
  ragSources: RagStreamSource[],
  mentionedAgents: MentionableAgent[] = [],
) {
  const metadata: Record<string, unknown> = { routeDecision };
  if (ragSources.length > 0) metadata.ragSources = ragSources;
  if (mentionedAgents.length > 0) {
    metadata.agent_mentions = mentionedAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      avatar: agent.avatar,
      model: agent.model,
    }));
  }
  return metadata;
}

async function fetchProjectNotebookContext(userId: string, sessionId: string, query: string) {
  const [projectLink] = await db
    .select({ projectId: projectChats.projectId })
    .from(projectChats)
    .where(and(eq(projectChats.sessionId, sessionId), eq(projectChats.userId, userId)))
    .limit(1);
  if (!projectLink) return "";

  const trimmedQuery = query.trim();
  const docs = trimmedQuery
    ? await db
        .select()
        .from(projectNotebookDocuments)
        .where(
          and(
            eq(projectNotebookDocuments.projectId, projectLink.projectId),
            ilike(projectNotebookDocuments.content, `%${trimmedQuery}%`),
          ),
        )
        .orderBy(desc(projectNotebookDocuments.updatedAt))
        .limit(4)
    : [];
  const fallbackDocs =
    docs.length > 0
      ? docs
      : await db
          .select()
          .from(projectNotebookDocuments)
          .where(eq(projectNotebookDocuments.projectId, projectLink.projectId))
          .orderBy(desc(projectNotebookDocuments.updatedAt))
          .limit(4);
  if (fallbackDocs.length === 0) return "";

  return [
    "## Project Notebook Context",
    ...fallbackDocs.map((doc, index) => `[P${index + 1}] ${doc.title}\n${doc.content.slice(0, 1200)}`),
    "Use project notebook context when it is relevant to the user's request.",
  ].join("\n\n");
}

function getTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        Boolean(part) &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function collectMentionedAgentIds(messages: Message[], requestedIds: unknown) {
  const ids = new Set<string>();
  for (const message of messages) {
    for (const mention of extractAgentMentions(getTextContent(message.content))) {
      ids.add(mention.id);
    }
  }
  if (Array.isArray(requestedIds)) {
    for (const id of requestedIds) {
      if (typeof id === "string" && /^[0-9a-fA-F-]{36}$/.test(id)) ids.add(id);
    }
  }
  return [...ids];
}

async function resolveFileSnapshotsForUser(
  rawSnapshots: unknown,
  userId: string,
): Promise<{ ok: true; snapshots: FileSnapshot[] } | { ok: false; response: Response }> {
  const snapshots = mergeFileSnapshots(normalizeFileSnapshots(rawSnapshots));
  const uploadedIds = getUploadedFileSnapshotIds(snapshots);
  if (uploadedIds.length === 0) return { ok: true, snapshots };

  const fileRows = await db
    .select()
    .from(filesTable)
    .where(and(inArray(filesTable.id, uploadedIds), eq(filesTable.userId, userId)));
  if (fileRows.length !== uploadedIds.length) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "File snapshot not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  const unvalidated = fileRows.find((file) => {
    const metadata = file.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
    return (metadata as { uploadStatus?: unknown }).uploadStatus !== "validated";
  });
  if (unvalidated) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "File upload has not passed validation" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  const byId = new Map(fileRows.map((file) => [file.id, file]));
  return {
    ok: true,
    snapshots: snapshots.map((snapshot) => {
      const file = byId.get(snapshot.id);
      if (!file) return snapshot;
      return {
        ...snapshot,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        s3Key: file.s3Key,
        url: file.s3Url,
        source: "browser_upload" as const,
      };
    }),
  };
}

function hasImageContent(messages: Message[]): boolean {
  return messages.some(
    (message) => Array.isArray(message.content) && message.content.some((part) => part.type === "image_url"),
  );
}

function prepareVisionFallbackMessages(messages: Message[]): Message[] {
  return messages.map((message) => {
    if (!Array.isArray(message.content) || !message.content.some((part) => part.type === "image_url")) {
      return message;
    }

    const text = getTextContent(message.content);
    const imageUrls = message.content
      .filter((part): part is { type: "image_url"; url: string } => part.type === "image_url")
      .map((part) => part.url);
    const imageList = imageUrls.map((url, index) => `${index + 1}. ${url}`).join("\n");
    const fallbackInstruction = [
      text,
      "The selected model cannot inspect image_url content directly. Use the visual_understanding tool before answering any visual question.",
      "Image URLs:",
      imageList,
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      ...message,
      content: fallbackInstruction,
    };
  });
}

function isImageGenerationRequest(messages: Message[]): boolean {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const text = getTextContent(lastUserMessage?.content).toLowerCase();
  if (!text) return false;

  return (
    /\b(generate|create|draw|make|render|design)\b[\s\S]{0,80}\b(image|picture|illustration|poster|wallpaper|logo|icon|artwork)\b/.test(
      text,
    ) ||
    /\b(image|picture|illustration|poster|wallpaper|logo|icon|artwork)\b[\s\S]{0,80}\b(generate|create|draw|make|render|design)\b/.test(
      text,
    ) ||
    /\btext[- ]to[- ]image\b/.test(text)
  );
}

function shouldInjectImageGenerationTool(messages: Message[], routedModel: string, enabledTools: string[]): boolean {
  return (
    !enabledTools.includes(imageGenerationTool.name) &&
    modelSupportsCapability(routedModel, "tools") &&
    isImageGenerationRequest(messages)
  );
}

function isGeneratedImageToolResult(result: unknown): result is GeneratedImageToolResult {
  return (
    Boolean(result) &&
    typeof result === "object" &&
    (result as { type?: unknown }).type === "generated_image" &&
    Array.isArray((result as { images?: unknown }).images)
  );
}

function generatedResourcesFromToolResult(
  result: unknown,
  toolCallId?: string,
): Array<GeneratedImageToolResource & { toolCallId?: string }> {
  if (!isGeneratedImageToolResult(result)) return [];
  return result.images
    .filter((image) => typeof image.url === "string" && image.url.length > 0)
    .map((image) => ({ ...image, toolCallId }));
}

function toolProfileDenialDetail(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const error = (result as { error?: unknown }).error;
  if (typeof error !== "string") return null;
  return /blocked by tool profile deny list|not exposed by the active tool profile/.test(error) ? error : null;
}

function quotaExceededResponse(quota: {
  reason: string;
  action: string;
  current: number;
  limit: number;
  requested: number;
  resetAt: Date;
}) {
  return new Response(
    JSON.stringify({
      error: quota.reason,
      quota: {
        action: quota.action,
        current: quota.current,
        limit: quota.limit,
        requested: quota.requested,
        resetAt: quota.resetAt.toISOString(),
      },
    }),
    {
      status: 429,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export async function POST(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const quota = await ensureUserQuota(session.user.id);
  const encryptedUserCreds = await db
    .select()
    .from(providerCredentials)
    .where(and(eq(providerCredentials.userId, session.user.id), eq(providerCredentials.isEnabled, true)));
  const userCreds = decryptProviderCredentials(encryptedUserCreds).filter(
    (credential) => checkProviderPlanAccess(credential.providerId, quota.plan).allowed,
  );
  const userRegistry: ProviderRegistry =
    userCreds.length > 0
      ? providerRegistry.forUser(
          userCreds.map((c) => ({
            providerId: c.providerId,
            authType: c.authType as "api_key" | "oauth",
            apiKey: c.apiKey || undefined,
            baseUrl: c.baseUrl ? validateProviderBaseUrl(c.baseUrl, c.baseUrl) : undefined,
            accessToken: c.accessToken || undefined,
            expiresAt: c.expiresAt,
          })),
        )
      : providerRegistry;

  const body = await req.json();
  const {
    sessionId,
    model,
    messages: rawChatMessages,
    temperature,
    maxTokens,
    tools,
    mentionedAgentIds: requestedMentionedAgentIds,
    fileSnapshots: requestedFileSnapshots,
  } = body;
  const messageQuota = await checkQuota(session.user.id, "message");
  if (!messageQuota.allowed) return quotaExceededResponse(messageQuota);
  const apiQuota = await checkQuota(session.user.id, "api");
  if (!apiQuota.allowed) return quotaExceededResponse(apiQuota);

  const chatMessages = validateMessageMedia(Array.isArray(rawChatMessages) ? rawChatMessages : []);

  const [chatSession] = await db
    .select({
      id: chatSessions.id,
      agentId: chatSessions.agentId,
      groupId: chatSessions.groupId,
      model: chatSessions.model,
    })
    .from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, session.user.id)))
    .limit(1);

  if (!chatSession) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fileSnapshotResult = await resolveFileSnapshotsForUser(requestedFileSnapshots, session.user.id);
  if (!fileSnapshotResult.ok) return fileSnapshotResult.response;
  const fileSnapshots = fileSnapshotResult.snapshots;

  const [sessionAgent] = chatSession.agentId
    ? await db.select().from(agents).where(eq(agents.id, chatSession.agentId)).limit(1)
    : [];

  const mentionedAgentIds = collectMentionedAgentIds(chatMessages, requestedMentionedAgentIds);
  const mentionedAgentRows =
    mentionedAgentIds.length > 0
      ? await db
          .select()
          .from(agents)
          .where(and(inArray(agents.id, mentionedAgentIds), eq(agents.userId, session.user.id)))
      : [];
  if (mentionedAgentRows.length !== mentionedAgentIds.length) {
    return new Response(JSON.stringify({ error: "Mentioned agent not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const mentionedAgentById = new Map(mentionedAgentRows.map((agent) => [agent.id, agent]));
  const mentionedAgents = mentionedAgentIds
    .map((id) => mentionedAgentById.get(id))
    .filter(Boolean) as typeof mentionedAgentRows;
  const runtimeAgent = chatSession.groupId ? sessionAgent : (mentionedAgents[0] ?? sessionAgent);

  const effectiveModel = runtimeAgent?.model || model || chatSession.model || DEFAULT_MODEL_ID;
  const effectiveTools = runtimeAgent ? parseAgentTools(runtimeAgent.tools) : tools || ["calculator", "datetime"];
  const compiledToolAccess = compileToolProfile({
    selectedTools: effectiveTools,
    profile: runtimeAgent?.toolProfile,
    deniedTools: parseStringArrayValue(runtimeAgent?.deniedTools),
  });
  const runtimeTools = compiledToolAccess.allowedTools;
  const enabledSkillSlugs = parseEnabledSkillSlugs(runtimeTools);
  const fallbackModelIds = parseFallbackModelIds(runtimeAgent?.fallbackModelIds);
  const routeStrategy = (runtimeAgent?.routeStrategy || "fixed") as RouteStrategy;
  const providerHealth = routeStrategy === "fixed" ? [] : await collectProviderHealth(userRegistry);
  const routeDecision = resolveRoute({
    requestedModel: effectiveModel,
    agent: runtimeAgent
      ? {
          model: runtimeAgent.model,
          routeStrategy,
          fallbackModelIds,
        }
      : null,
    providerHealth,
    policy: {
      strategy: routeStrategy,
      fallbackModelIds,
    },
  });
  const routedModel = routeDecision.modelId;
  const shouldInjectVisionFallback =
    hasImageContent(chatMessages) &&
    !modelSupportsCapability(routedModel, "vision") &&
    modelSupportsCapability(routedModel, "tools") &&
    isToolAllowedByProfile(visualUnderstandingTool.name, compiledToolAccess);
  const shouldInjectImageTool =
    shouldInjectImageGenerationTool(chatMessages, routedModel, runtimeTools) &&
    isToolAllowedByProfile(imageGenerationTool.name, compiledToolAccess);
  const runtimeMessages = shouldInjectVisionFallback ? prepareVisionFallbackMessages(chatMessages) : chatMessages;

  // White-box memory injection
  let memoryBlock = "";
  if (runtimeAgent?.memoryEnabled && runtimeAgent?.id) {
    const memories = await fetchAcceptedMemoriesForAgent(runtimeAgent.id, session.user.id);
    memoryBlock = formatMemoryBlock(memories);
  }
  const systemPrompt = appendMemoryBlockToSystemPrompt(runtimeAgent?.systemPrompt, memoryBlock);

  // RAG: Knowledge Base retrieval (appends to resolvedPrompt, providing grounded context)
  let ragSourcesForStream: RagStreamSource[] = [];
  let kbForVfs: { id: string; name: string } | null = null;
  let resolvedPrompt = substituteVariables(systemPrompt || "", {
    userName: session.user.name ?? undefined,
    date: new Date(),
    agentName: runtimeAgent?.name ?? undefined,
  });
  const mentionedAgentSystemBlock = buildMentionedAgentSystemBlock(mentionedAgents);
  if (mentionedAgentSystemBlock) {
    resolvedPrompt = [resolvedPrompt, mentionedAgentSystemBlock].filter(Boolean).join("\n\n");
  }
  const fileSnapshotSystemBlock = buildFileSnapshotSystemBlock(fileSnapshots);
  if (fileSnapshotSystemBlock) {
    resolvedPrompt = [resolvedPrompt, fileSnapshotSystemBlock].filter(Boolean).join("\n\n");
  }
  const lastUserMessageForContext = [...chatMessages]
    .reverse()
    .find((m: { role: string; content?: unknown }) => m.role === "user");
  const lastUserTextForContext = getTextContent(lastUserMessageForContext?.content);
  const projectNotebookContext = await fetchProjectNotebookContext(session.user.id, sessionId, lastUserTextForContext);
  if (projectNotebookContext) {
    resolvedPrompt = [resolvedPrompt, projectNotebookContext].filter(Boolean).join("\n\n");
  }

  if (runtimeAgent?.knowledgeBaseId) {
    const kb = await db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.id, runtimeAgent.knowledgeBaseId), eq(knowledgeBases.userId, session.user.id)))
      .limit(1);

    if (kb[0]) {
      kbForVfs = { id: kb[0].id, name: kb[0].name };
      const lastUserText = lastUserTextForContext;
      if (lastUserText) {
        try {
          const ragResults = await hybridKbSearch({
            query: lastUserText,
            knowledgeBaseId: kb[0].id,
            limit: 5,
            embeddingModel: kb[0].embeddingModel || "nomic-embed-text",
          });
          if (ragResults.length > 0) {
            ragSourcesForStream = ragResults.map((r) => ({
              id: r.id,
              documentId: r.documentId,
              content: r.content.slice(0, 200),
              similarity: r.similarity,
              sourceName: r.sourceName,
              sourceType: r.sourceType,
              mimeType: r.mimeType,
              sourceUrl: r.sourceUrl,
              citation: r.citation,
              metadata: r.metadata,
            }));
            const ragContext = [
              "## Relevant Knowledge Base Context",
              ...ragResults.map((r, i) => `[${i + 1}] ${r.content}`),
              "\nUse the above context to answer the user's question. Cite sources using [1], [2], etc. when referencing specific information.",
            ].join("\n\n");
            resolvedPrompt = resolvedPrompt ? `${resolvedPrompt}\n\n${ragContext}` : ragContext;
          }
        } catch (e) {
          console.error("Hybrid KB search failed (non-fatal):", e);
        }
      }
    }
  }

  // Load and connect enabled MCP servers for this user across stdio, http, streamable-http, and sse transports.
  // buildMcpClientConfig also preserves remote headers for cloud MCP servers.
  const userMcpServers = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.userId, session.user.id), eq(mcpServers.enabled, true)));

  const mcpClients: MCPClient[] = [];
  const extraTools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
  }> = [];

  if (enabledSkillSlugs.length > 0) {
    const installedSkillRows = await db
      .select()
      .from(installedSkills)
      .where(and(eq(installedSkills.userId, session.user.id), inArray(installedSkills.slug, enabledSkillSlugs)));
    const installedSkillResourceRows =
      installedSkillRows.length > 0
        ? await db
            .select()
            .from(skillResources)
            .where(
              inArray(
                skillResources.skillId,
                installedSkillRows.map((skill) => skill.id),
              ),
            )
        : [];
    const installedSkillRecords = createSkillRuntimeRecords(installedSkillRows, installedSkillResourceRows);
    if (installedSkillRecords.length > 0) {
      extraTools.push(
        ...createSkillRuntimeTools(installedSkillRecords).filter((tool) =>
          isToolAllowedByProfile(tool.name, compiledToolAccess),
        ),
      );
    }
  }

  const openApiPluginRows = await db
    .select()
    .from(installedSkills)
    .where(and(eq(installedSkills.userId, session.user.id), eq(installedSkills.source, "openapi")));
  if (openApiPluginRows.length > 0) {
    const openApiResourceRows = await db
      .select()
      .from(skillResources)
      .where(
        inArray(
          skillResources.skillId,
          openApiPluginRows.map((plugin) => plugin.id),
        ),
      );
    const openApiPlugins = openApiPluginRows.map((plugin) =>
      createInstalledOpenApiPlugin(
        plugin,
        openApiResourceRows.filter((resource) => resource.skillId === plugin.id),
      ),
    );
    extraTools.push(
      ...createOpenApiRuntimeTools(openApiPlugins, runtimeTools).filter((tool) =>
        isToolAllowedByProfile(tool.name, compiledToolAccess),
      ),
    );
  }

  await Promise.allSettled(
    userMcpServers.map(async (srv) => {
      const config = buildMcpClientConfig(srv);
      const client = new MCPClient(config);
      try {
        await client.connect();
        mcpClients.push(client);
        for (const tool of client.getTools()) {
          if (
            !isToolAllowedByProfile(tool.name, compiledToolAccess) ||
            !isToolAllowedByProfile(`mcp:${tool.name}`, compiledToolAccess)
          )
            continue;
          extraTools.push({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema as Record<string, unknown>,
            execute: (args) =>
              enforceMcpGovernance({
                userId: session.user.id,
                agentId: runtimeAgent?.id ?? null,
                server: srv,
                toolName: tool.name,
                args,
                callTool: () => client.callTool(tool.name, args) as Promise<unknown>,
              }),
          });
        }
      } catch {
        // Skip unavailable MCP servers silently
      }
    }),
  );

  if (shouldInjectVisionFallback) {
    extraTools.push({
      name: "visual_understanding",
      description: visualUnderstandingTool.description,
      parameters: globalToolRegistry.zodToJSONSchema(visualUnderstandingTool.parameters),
      execute: visualUnderstandingTool.execute,
    });
  }

  if (shouldInjectImageTool) {
    extraTools.push({
      name: imageGenerationTool.name,
      description: imageGenerationTool.description,
      parameters: globalToolRegistry.zodToJSONSchema(imageGenerationTool.parameters),
      execute: imageGenerationTool.execute,
    });
  }

  // VFS: inject a read_file overlay for the agent's attached KB
  if (kbForVfs && runtimeTools.includes("read_file")) {
    const kbId = kbForVfs.id;
    const kbSlug = kbForVfs.name.toLowerCase().replace(/\s+/g, "-");
    const prefix = `docs/${kbSlug}/`;
    extraTools.unshift({
      name: "read_file",
      description: `Read documents from the attached knowledge base. Use path "${prefix}<document-name>" to read a document, or "docs/${kbSlug}" to list all indexed documents.`,
      parameters: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: `Path within the KB, e.g. "${prefix}intro.pdf" or "docs/${kbSlug}" to list.`,
          },
        },
        required: ["path"],
      },
      execute: async (args: Record<string, unknown>) => {
        const reqPath = String(args.path ?? "");
        if (reqPath === `docs/${kbSlug}` || reqPath === `docs/${kbSlug}/`) {
          const docs = await db
            .select({ id: documents.id, name: documents.name })
            .from(documents)
            .where(and(eq(documents.knowledgeBaseId, kbId), eq(documents.status, "indexed")));
          return { path: reqPath, documents: docs.map((d) => `${prefix}${d.name}`) };
        }
        if (!reqPath.startsWith(prefix)) {
          return { error: `Path must start with "${prefix}" or be "docs/${kbSlug}" to list.` };
        }
        const docName = reqPath.slice(prefix.length);
        const [doc] = await db
          .select()
          .from(documents)
          .where(and(eq(documents.knowledgeBaseId, kbId), eq(documents.name, docName), eq(documents.status, "indexed")))
          .limit(1);
        if (!doc) return { error: `Document "${docName}" not found in knowledge base.` };
        const chunks = await db
          .select({ content: documentChunks.content })
          .from(documentChunks)
          .where(eq(documentChunks.documentId, doc.id))
          .orderBy(documentChunks.createdAt);
        return {
          path: reqPath,
          document: doc.name,
          content: chunks.map((c) => c.content).join("\n"),
          chunks: chunks.length,
        };
      },
    });
  }

  // Fetch group config if session has a groupId
  let groupConfig: {
    id: string;
    name: string;
    pattern: string;
    members: { agentId: string; role: string | null; sortOrder: number | null }[];
  } | null = null;
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
    model: routedModel,
    systemPrompt: resolvedPrompt,
    temperature: runtimeAgent?.temperature ?? temperature,
    maxTokens: runtimeAgent?.maxTokens ?? maxTokens,
    registry: userRegistry,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = "";
      let fullReasoning = "";
      let toolCalls: any[] = [];
      const reasoningTimeline: ReasoningTimelineEvent[] = [];
      const generatedResources: Array<GeneratedImageToolResource & { toolCallId?: string }> = [];
      const sandboxSessions: SandboxSession[] = [];
      const messageMetadata = buildMessageMetadata(routeDecision, ragSourcesForStream, mentionedAgents);

      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "route_decision", routeDecision })}\n\n`));

        if (ragSourcesForStream.length > 0) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "rag_sources", sources: ragSourcesForStream })}\n\n`),
          );
        }

        // Group orchestration path
        if (groupConfig) {
          const groupAgents = await Promise.all(
            groupConfig.members.map(async (m) => {
              const [a] = await db.select().from(agents).where(eq(agents.id, m.agentId)).limit(1);
              if (!a) return null;
              const memberToolAccess = compileToolProfile({
                selectedTools: parseAgentTools(a.tools),
                profile: a.toolProfile,
                deniedTools: parseStringArrayValue(a.deniedTools),
              });
              return {
                id: a.id,
                name: a.name,
                role: m.role,
                sortOrder: m.sortOrder,
                tools: memberToolAccess.allowedTools,
                deniedTools: memberToolAccess.deniedTools,
                runtimeOptions: {
                  model: a.model ?? routedModel,
                  systemPrompt: a.systemPrompt,
                  temperature: a.temperature ?? 0.7,
                  maxTokens: a.maxTokens ?? 4096,
                },
              };
            }),
          );
          const validAgents = groupAgents.filter(Boolean) as NonNullable<(typeof groupAgents)[number]>[];
          const lastUserMsg = [...runtimeMessages].reverse().find((m: Message) => m.role === "user");
          const task = getTextContent(lastUserMsg?.content);

          const orchestratorMap: Record<string, new () => { run: (opts: any) => AsyncGenerator<any> }> = {
            sequential: SequentialOrchestrator,
            parallel: ParallelOrchestrator,
            supervisor: SupervisorOrchestrator,
            iterative: IterativeOrchestrator,
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
            messages: runtimeMessages,
            signal: req.signal,
            checkpoint: async (checkpointId: string, title: string, plan: string) => {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "hitl_checkpoint", checkpointId, title, plan })}\n\n`),
              );
              return registerCheckpoint(checkpointId);
            },
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
            const contentArtifacts = extractArtifactsFromContent(fullContent);
            const groupMetadata = {
              ...messageMetadata,
              ...(contentArtifacts.length > 0 ? { artifacts: contentArtifacts } : {}),
            };
            await db.insert(messagesTable).values({
              sessionId,
              role: "assistant",
              content: fullContent,
              model: routedModel,
              artifacts: contentArtifacts.length > 0 ? contentArtifacts : null,
              metadata: groupMetadata,
              tokensUsed: approxTokens,
              latencyMs,
            });
            const extracted = await extractMemories(task, fullContent, routedModel);
            if (runtimeAgent?.id && session.user.id && extracted.length > 0) {
              await storePendingMemories(runtimeAgent.id, session.user.id, extracted);
            }
          }
          await incrementQuota(session.user.id, { messagesSent: 1, tokensUsed: approxTokens, apiCalls: 1 });
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done", tokensUsed: approxTokens, latencyMs })}\n\n`),
          );
          controller.close();
          return;
        }

        const truncatedMessages = (await truncateToContextWindow(runtimeMessages, {
          model: routedModel,
          maxTokens: runtimeAgent?.maxTokens ?? undefined,
        })) as import("@agenthub/ai-providers").Message[];

        const agentStream = agent.run({
          sessionId,
          messages: truncatedMessages,
          tools: runtimeTools,
          extraTools,
          deniedTools: compiledToolAccess.deniedTools,
          toolContext: {
            desktopRuntime: process.env.AGENTHUB_DESKTOP_RUNTIME === "true",
            getCredential: (toolName: string) =>
              resolveCredential({
                userId: session.user.id,
                agentId: runtimeAgent?.id ?? null,
                tool: toolName,
              }),
          },
          approvalPolicy: {
            sensitiveTools: ["execute_code", "exec_skill_script", "export_skill_file", "local_system"],
          },
          approval: async (request: ApprovalRequest) => {
            const approved = await registerActionApproval(request.id);
            await recordApprovalAuditEvent({
              userId: session.user.id,
              agentId: runtimeAgent?.id ?? null,
              tool: request.toolName ?? request.actionName ?? "unknown",
              approved,
              detail: `${request.title}: ${request.policyReason}`,
            });
            return { approved };
          },
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
          if (chunk.type === "reasoning_event" && chunk.event) {
            reasoningTimeline.push(chunk.event);
          }
          if (chunk.type === "tool_call" && chunk.toolCall) {
            toolCalls.push(chunk.toolCall);
          }
          if (chunk.type === "tool_result") {
            generatedResources.push(...generatedResourcesFromToolResult(chunk.result, chunk.toolCallId));
            const profileDenialDetail = toolProfileDenialDetail(chunk.result);
            if (profileDenialDetail) {
              await recordToolProfileAuditEvent({
                userId: session.user.id,
                agentId: runtimeAgent?.id ?? null,
                tool: chunk.toolName,
                detail: profileDenialDetail,
              });
            }
            const sandboxSession = createSandboxSessionFromToolResult(chunk.result);
            if (sandboxSession) {
              sandboxSessions.push({
                ...sandboxSession,
                outputs: sandboxSession.outputs.map((output) => ({ ...output, toolCallId: chunk.toolCallId })),
                charts: sandboxSession.charts.map((output) => ({ ...output, toolCallId: chunk.toolCallId })),
              });
            }
          }
          if (chunk.type === "approval_request") {
            // The approval_request chunk is forwarded as SSE above; the runtime waits on registerActionApproval.
          }
        }
        const latencyMs = Date.now() - streamStartMs;
        const approxTokens = Math.ceil(fullContent.length / 4);

        if (!fullContent && !fullReasoning && toolCalls.length === 0) {
          // nothing to persist
        } else {
          const sandboxResources = sandboxSessions.flatMap((sandboxSession) =>
            sandboxResourcesFromSession(sandboxSession),
          );
          const contentArtifacts = extractArtifactsFromContent(fullContent);
          const savedMetadata = {
            ...messageMetadata,
            ...(reasoningTimeline.length > 0 ? { reasoningTimeline: reasoningTimeline } : {}),
            ...(contentArtifacts.length > 0 ? { artifacts: contentArtifacts } : {}),
            ...(generatedResources.length > 0 ? { generatedResources } : {}),
            ...(sandboxResources.length > 0 ? { sandboxResources } : {}),
          };
          const artifacts = [...contentArtifacts, ...generatedResources, ...sandboxResources];
          const [savedMsg] = await db
            .insert(messagesTable)
            .values({
              sessionId,
              role: "assistant",
              content: fullContent,
              reasoning: fullReasoning || null,
              model: routedModel,
              toolCalls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
              artifacts: artifacts.length > 0 ? artifacts : null,
              metadata: savedMetadata,
              tokensUsed: approxTokens,
              latencyMs,
            })
            .returning();

          if (savedMsg && generatedResources.length > 0) {
            await db.insert(resources).values(
              generatedResources.map((resource) => ({
                id: resource.id,
                userId: session.user.id,
                sessionId,
                sourceMessageId: savedMsg.id,
                type: "image" as const,
                source: resource.source,
                uri: resource.url,
                mimeType: resource.mimeType,
                prompt: resource.prompt,
                revisedPrompt: resource.revisedPrompt ?? null,
                providerId: resource.providerId,
                model: resource.model,
                metadata: {
                  toolCallId: resource.toolCallId,
                  providerImageId: resource.providerImageId,
                  size: resource.size,
                },
              })),
            );
          }

          if (savedMsg && sandboxSessions.length > 0) {
            const persistedSandboxResources = [];
            for (const sandboxSession of sandboxSessions) {
              persistedSandboxResources.push(
                ...(await persistSandboxOutputs({
                  userId: session.user.id,
                  sessionId,
                  sourceMessageId: savedMsg.id,
                  sandboxSession,
                })),
              );
            }

            if (persistedSandboxResources.length > 0) {
              const persistedMetadata = {
                ...savedMetadata,
                sandboxResources: persistedSandboxResources,
              };
              await db
                .update(messagesTable)
                .set({
                  metadata: persistedMetadata,
                  artifacts: [...contentArtifacts, ...generatedResources, ...persistedSandboxResources],
                })
                .where(eq(messagesTable.id, savedMsg.id));
            }
          }

          await db.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, sessionId));

          // Fire-and-forget memory extraction — doesn't block the stream close
          if (runtimeAgent?.memoryEnabled && runtimeAgent?.id && fullContent) {
            const lastUser = [...chatMessages]
              .reverse()
              .find((m: { role: string; content?: unknown }) => m.role === "user");
            const lastUserText = getTextContent(lastUser?.content);
            if (lastUserText) {
              const agentIdSnapshot = runtimeAgent.id;
              const userIdSnapshot = session.user.id;
              const msgIdSnapshot = savedMsg?.id;
              void (async () => {
                try {
                  const extracted = await extractMemories(lastUserText, fullContent, routedModel);
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

        await incrementQuota(session.user.id, { messagesSent: 1, tokensUsed: approxTokens, apiCalls: 1 });
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done", tokensUsed: approxTokens, latencyMs })}\n\n`),
        );
      } catch (err) {
        const rawMsg = (err as Error).message;
        // Extract the human-readable part from JSON error blobs like "Ollama error: {...}"
        let errorMsg = rawMsg;
        const jsonStart = rawMsg.indexOf("{");
        if (jsonStart !== -1) {
          try {
            const parsed = JSON.parse(rawMsg.slice(jsonStart));
            if (typeof parsed.error === "string") {
              errorMsg = parsed.error.split("\n")[0].trim();
            }
          } catch {
            /* keep rawMsg */
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`));
        // Persist the error as an assistant message so conversation history and share pages show it
        await db
          .insert(messagesTable)
          .values({
            sessionId,
            role: "assistant",
            content: `⚠️ ${errorMsg}`,
            model: routedModel,
            metadata: messageMetadata,
          })
          .catch(() => {
            /* non-fatal — don't mask the original error */
          });
      } finally {
        mcpClients.forEach((c) => {
          try {
            c.disconnect();
          } catch {
            /* ignore */
          }
        });
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

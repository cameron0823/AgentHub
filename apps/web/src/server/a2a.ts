import { randomUUID } from "node:crypto";
import { AgentRuntime } from "@agenthub/agent-runtime";
import { and, eq } from "drizzle-orm";
import { checkProviderPlanAccess, providerRegistry, type ProviderRegistry } from "@agenthub/ai-providers";
import { db } from "./db";
import { agents, providerCredentials } from "./db/schema";
import { appendMemoryBlockToSystemPrompt, fetchAcceptedMemoriesForAgent, formatMemoryBlock } from "./memory";
import { decryptProviderCredentials } from "./provider-credentials";
import { validateProviderBaseUrl } from "./security/outbound";
import { checkQuota, ensureUserQuota, incrementQuota } from "./quotas";

export type A2ATaskStatus = "submitted" | "working" | "input-required" | "completed" | "failed" | "cancelled";

export interface A2ATaskRecord {
  id: string;
  userId: string;
  agentId: string;
  status: A2ATaskStatus;
  task: string;
  output?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  provider: { organization: string; url: string };
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  authentication: {
    schemes: Array<"none" | "apiKey" | "oauth2" | "openIdConnect">;
  };
  skills: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    inputModes: string[];
    outputModes: string[];
  }>;
  defaultInputModes: string[];
  defaultOutputModes: string[];
}

const a2aTasks = new Map<string, A2ATaskRecord>();

export function buildAgentCard(baseUrl: string): AgentCard {
  return {
    name: "AgentHub",
    description: "AgentHub local agent gateway with authenticated task delegation.",
    url: `${baseUrl.replace(/\/$/, "")}/api/a2a`,
    version: "0.1.0",
    provider: {
      organization: "AgentHub",
      url: baseUrl,
    },
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    authentication: {
      schemes: ["apiKey", "oauth2"],
    },
    skills: [
      {
        id: "agenthub.task-delegation",
        name: "Task Delegation",
        description: "Send a task to an authenticated AgentHub agent and receive a text artifact.",
        tags: ["chat", "delegation", "agent"],
        inputModes: ["text/plain", "application/json"],
        outputModes: ["text/plain", "application/json"],
      },
    ],
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
  };
}

export function negotiateCapabilities(client: Partial<AgentCard["capabilities"]>, agent: AgentCard) {
  return {
    streaming: Boolean(client.streaming && agent.capabilities.streaming),
    pushNotifications: Boolean(client.pushNotifications && agent.capabilities.pushNotifications),
    stateTransitionHistory: Boolean(client.stateTransitionHistory && agent.capabilities.stateTransitionHistory),
    authenticationScheme: agent.authentication.schemes.includes("apiKey") ? "apiKey" : agent.authentication.schemes[0],
  };
}

export function createTaskRecord(userId: string, agentId: string, task: string) {
  const now = new Date().toISOString();
  const record: A2ATaskRecord = {
    id: randomUUID(),
    userId,
    agentId,
    task,
    status: "submitted",
    createdAt: now,
    updatedAt: now,
  };
  a2aTasks.set(record.id, record);
  return record;
}

export function getTaskRecord(taskId: string, userId: string) {
  const record = a2aTasks.get(taskId);
  return record?.userId === userId ? record : null;
}

export function updateTaskRecord(taskId: string, userId: string, patch: Partial<A2ATaskRecord>) {
  const current = getTaskRecord(taskId, userId);
  if (!current) return null;
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  a2aTasks.set(taskId, updated);
  return updated;
}

async function registryForUser(userId: string): Promise<ProviderRegistry> {
  const encryptedUserCreds = await db
    .select()
    .from(providerCredentials)
    .where(and(eq(providerCredentials.userId, userId), eq(providerCredentials.isEnabled, true)));
  const quota = await ensureUserQuota(userId);
  const userCreds = decryptProviderCredentials(encryptedUserCreds).filter(
    (credential) => checkProviderPlanAccess(credential.providerId, quota.plan).allowed,
  );
  return userCreds.length > 0
    ? providerRegistry.forUser(
        userCreds.map((credential) => ({
          providerId: credential.providerId,
          authType: credential.authType as "api_key" | "oauth",
          apiKey: credential.apiKey || undefined,
          baseUrl: credential.baseUrl ? validateProviderBaseUrl(credential.baseUrl, credential.baseUrl) : undefined,
          accessToken: credential.accessToken || undefined,
          expiresAt: credential.expiresAt,
        })),
      )
    : providerRegistry;
}

export async function executeLocalA2ATask(input: {
  userId: string;
  agentId: string;
  task: string;
  signal?: AbortSignal;
}) {
  const messageQuota = await checkQuota(input.userId, "message");
  if (!messageQuota.allowed) throw new Error(messageQuota.reason);
  const apiQuota = await checkQuota(input.userId, "api");
  if (!apiQuota.allowed) throw new Error(apiQuota.reason);

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, input.agentId), eq(agents.userId, input.userId)))
    .limit(1);

  if (!agent) throw new Error("Agent not found");

  let systemPrompt = agent.systemPrompt;
  if (agent.memoryEnabled) {
    const memories = await fetchAcceptedMemoriesForAgent(agent.id, input.userId);
    const memoryBlock = formatMemoryBlock(memories);
    systemPrompt = appendMemoryBlockToSystemPrompt(systemPrompt, memoryBlock) ?? systemPrompt;
  }

  const runtime = new AgentRuntime({
    model: agent.model ?? "ollama:qwen2.5:7b",
    systemPrompt,
    temperature: agent.temperature ?? 0.7,
    maxTokens: agent.maxTokens ?? 4096,
    registry: await registryForUser(input.userId),
  });

  const startMs = Date.now();
  let output = "";
  for await (const chunk of runtime.run({
    sessionId: `a2a-${input.userId}`,
    messages: [{ role: "user", content: input.task.trim() }],
    tools: [],
    signal: input.signal,
  })) {
    if (chunk.type === "content" && chunk.content) output += chunk.content;
  }

  const latencyMs = Date.now() - startMs;
  const tokensUsed = Math.ceil(output.length / 4);
  await incrementQuota(input.userId, { messagesSent: 1, tokensUsed, apiCalls: 1 });

  return {
    agentId: agent.id,
    agentName: agent.name,
    output,
    tokensUsed,
    latencyMs,
  };
}

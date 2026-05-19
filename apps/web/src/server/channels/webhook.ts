import { NextRequest, NextResponse } from "next/server";
import { AgentRuntime } from "@agenthub/agent-runtime";
import { checkProviderPlanAccess, providerRegistry, type ProviderRegistry } from "@agenthub/ai-providers";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { agents, channelAccounts, channelAuditLog, channelSenderPolicies, providerCredentials } from "../db/schema";
import { decrypt } from "../trust-engine";
import { decryptProviderCredentials } from "../provider-credentials";
import { ensureUserQuota } from "../quotas";
import { appendMemoryBlockToSystemPrompt, fetchAcceptedMemoriesForAgent, formatMemoryBlock } from "../memory";
import {
  evaluateChannelSenderPolicy,
  parseChannelToolList,
  resolveChannelToolIds,
  type ChannelProvider,
  type NormalizedChannelCommand,
} from "./types";

type ChannelWebhookResponse = (message: string, command: NormalizedChannelCommand) => NextResponse;

interface HandleChannelWebhookOptions {
  req: NextRequest;
  rawBody: string;
  provider: ChannelProvider;
  verifyRequest: (input: { rawBody: string; headers: Headers; verificationSecret: string }) => boolean;
  parseCommand: (rawBody: string) => NormalizedChannelCommand;
  successResponse: ChannelWebhookResponse;
  deniedResponse: ChannelWebhookResponse;
  pingResponse?: () => NextResponse;
}

function getChannelAccountId(req: NextRequest): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("accountId") || req.headers.get("x-agenthub-channel-account");
}

async function loadProviderCredentials(userId: string): Promise<ProviderRegistry> {
  const encryptedUserCreds = await db
    .select()
    .from(providerCredentials)
    .where(and(eq(providerCredentials.userId, userId), eq(providerCredentials.isEnabled, true)));
  const quota = await ensureUserQuota(userId);
  const userCreds = decryptProviderCredentials(encryptedUserCreds).filter(
    (credential) => checkProviderPlanAccess(credential.providerId, quota.plan).allowed,
  );

  if (userCreds.length === 0) return providerRegistry;

  return providerRegistry.forUser(
    userCreds.map((credential) => ({
      providerId: credential.providerId,
      authType: credential.authType as "api_key" | "oauth",
      apiKey: credential.apiKey || undefined,
      baseUrl: credential.baseUrl || undefined,
      accessToken: credential.accessToken || undefined,
      expiresAt: credential.expiresAt,
    })),
  );
}

async function buildSystemPrompt(agent: typeof agents.$inferSelect) {
  let systemPrompt = agent.systemPrompt;
  if (agent.memoryEnabled && agent.userId) {
    const memories = await fetchAcceptedMemoriesForAgent(agent.id, agent.userId);
    const memoryBlock = formatMemoryBlock(memories);
    systemPrompt = appendMemoryBlockToSystemPrompt(systemPrompt, memoryBlock) ?? systemPrompt;
  }
  return systemPrompt;
}

function resolveRuntimeToolIds(
  accountAllowedTools: unknown,
  senderAllowedTools: unknown,
  agent: typeof agents.$inferSelect,
) {
  const channelToolIds = resolveChannelToolIds(accountAllowedTools, senderAllowedTools);
  const agentToolIds = new Set(parseChannelToolList(agent.tools));
  const deniedToolIds = new Set(parseChannelToolList(agent.deniedTools));
  return channelToolIds.filter((toolId) => agentToolIds.has(toolId) && !deniedToolIds.has(toolId));
}

async function recordChannelAudit(input: {
  channelAccountId?: string;
  userId?: string | null;
  agentId?: string | null;
  provider: ChannelProvider;
  command?: NormalizedChannelCommand;
  eventType: string;
  outcome: "success" | "denied" | "error";
  reason?: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(channelAuditLog).values({
    channelAccountId: input.channelAccountId,
    userId: input.userId ?? undefined,
    agentId: input.agentId ?? undefined,
    provider: input.provider,
    externalSenderId: input.command?.externalSenderId,
    externalChannelId: input.command?.externalChannelId,
    eventType: input.eventType,
    outcome: input.outcome,
    reason: input.reason,
    metadata: input.metadata ?? {},
  });
}

export async function handleChannelWebhook(options: HandleChannelWebhookOptions) {
  const { req, rawBody, provider, verifyRequest, parseCommand, successResponse, deniedResponse, pingResponse } =
    options;
  const accountId = getChannelAccountId(req);

  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  const [record] = await db
    .select({ account: channelAccounts, agent: agents })
    .from(channelAccounts)
    .innerJoin(agents, eq(channelAccounts.agentId, agents.id))
    .where(
      and(
        eq(channelAccounts.id, accountId),
        eq(channelAccounts.provider, provider),
        eq(channelAccounts.isEnabled, true),
      ),
    )
    .limit(1);

  if (!record) {
    return NextResponse.json({ error: "Channel account not found" }, { status: 404 });
  }

  const { account, agent } = record;
  const verificationSecret = decrypt(
    account.verificationSecretEncrypted,
    account.verificationSecretIv,
    account.verificationSecretAuthTag,
  );

  if (!verifyRequest({ rawBody, headers: req.headers, verificationSecret })) {
    await recordChannelAudit({
      channelAccountId: account.id,
      userId: account.userId,
      agentId: account.agentId,
      provider,
      eventType: "webhook.verify",
      outcome: "denied",
      reason: "invalid_signature",
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let command: NormalizedChannelCommand;
  try {
    command = parseCommand(rawBody);
  } catch (err) {
    await recordChannelAudit({
      channelAccountId: account.id,
      userId: account.userId,
      agentId: account.agentId,
      provider,
      eventType: "message.parse",
      outcome: "error",
      reason: err instanceof Error ? err.message : "parse_failed",
    });
    return NextResponse.json({ error: "Invalid channel payload" }, { status: 400 });
  }

  if (command.isPing) {
    return pingResponse ? pingResponse() : NextResponse.json({ ok: true });
  }

  if (!command.externalSenderId) {
    await recordChannelAudit({
      channelAccountId: account.id,
      userId: account.userId,
      agentId: account.agentId,
      provider,
      command,
      eventType: "message.authorize",
      outcome: "denied",
      reason: "missing_sender",
    });
    return deniedResponse("Sender identity is required.", command);
  }

  const [senderPolicy] = await db
    .select()
    .from(channelSenderPolicies)
    .where(
      and(
        eq(channelSenderPolicies.channelAccountId, account.id),
        eq(channelSenderPolicies.externalSenderId, command.externalSenderId),
      ),
    )
    .limit(1);

  const decision = evaluateChannelSenderPolicy(account, senderPolicy, command);
  if (!decision.allowed) {
    await recordChannelAudit({
      channelAccountId: account.id,
      userId: account.userId,
      agentId: account.agentId,
      provider,
      command,
      eventType: "message.authorize",
      outcome: "denied",
      reason: decision.reason,
    });
    return deniedResponse("This sender is not allowed to use this AgentHub channel.", command);
  }

  const task = command.text.trim();
  if (!task) {
    await recordChannelAudit({
      channelAccountId: account.id,
      userId: account.userId,
      agentId: account.agentId,
      provider,
      command,
      eventType: "message.authorize",
      outcome: "denied",
      reason: "empty_message",
    });
    return deniedResponse("Send a task after the command.", command);
  }

  const tools = resolveRuntimeToolIds(account.allowedTools, senderPolicy?.allowedTools ?? [], agent);

  try {
    const channelRegistry = await loadProviderCredentials(account.userId);
    const runtime = new AgentRuntime({
      model: agent.model ?? "ollama:qwen2.5:7b",
      systemPrompt: await buildSystemPrompt(agent),
      temperature: agent.temperature ?? 0.7,
      maxTokens: agent.maxTokens ?? 4096,
      registry: channelRegistry,
    });

    let output = "";
    for await (const chunk of runtime.run({
      sessionId: `channel-${provider}-${account.id}-${command.externalSenderId}`,
      messages: [{ role: "user", content: task }],
      tools,
      deniedTools: parseChannelToolList(agent.deniedTools),
    })) {
      if (chunk.type === "content" && chunk.content) output += chunk.content;
    }

    await recordChannelAudit({
      channelAccountId: account.id,
      userId: account.userId,
      agentId: account.agentId,
      provider,
      command,
      eventType: "message.respond",
      outcome: "success",
      metadata: {
        command: command.command,
        exposedTools: tools,
        outputLength: output.length,
      },
    });
    return successResponse(output || "AgentHub completed the request without text output.", command);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "runtime_failed";
    await recordChannelAudit({
      channelAccountId: account.id,
      userId: account.userId,
      agentId: account.agentId,
      provider,
      command,
      eventType: "message.respond",
      outcome: "error",
      reason,
    });
    return deniedResponse(`AgentHub could not complete the request: ${reason}`, command);
  }
}

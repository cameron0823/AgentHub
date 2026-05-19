import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { AgentCard } from "./a2a";
import { db } from "./db";
import { a2aCommunities, a2aCommunityMembers, a2aPeers, type A2ACommunity, type A2APeer } from "./db/schema";

export const A2A_MDNS_SERVICE = "_a2a._tcp.local";
export const AGENTHUB_MDNS_SERVICE = "_agenthub-a2a._tcp.local";
export const A2A_AGENT_CARD_PATH = "/.well-known/agent-card.json";
export const A2A_JSON_RPC_PATH = "/api/a2a";

export const A2A_FRAMEWORKS = [
  "agenthub",
  "a2a",
  "langgraph",
  "crewai",
  "autogen",
  "openai-assistants",
  "custom",
] as const;
export const A2A_DISCOVERY_SOURCES = ["manual", "registry", "mdns", "local", "well-known"] as const;
export const A2A_PEER_STATUSES = ["online", "offline", "unknown"] as const;
export const A2A_COMMUNITY_ROLES = ["coordinator", "worker", "observer"] as const;

export type A2AFramework = (typeof A2A_FRAMEWORKS)[number];
export type A2ADiscoverySource = (typeof A2A_DISCOVERY_SOURCES)[number];
export type A2APeerStatus = (typeof A2A_PEER_STATUSES)[number];
export type A2ACommunityRole = (typeof A2A_COMMUNITY_ROLES)[number];

export interface A2AFrameworkAdapterContract {
  id: A2AFramework;
  label: string;
  agentCardPath: string;
  taskSendMethod: "tasks/send";
  streamingMethod: "tasks/sendSubscribe";
  authSchemes: AgentCard["authentication"]["schemes"];
  inputShape: "a2a-json-rpc" | "agenthub-json-rpc" | "adapter-json-rpc";
  outputShape: "a2a-task-response";
}

export const A2A_FRAMEWORK_ADAPTERS: Record<A2AFramework, A2AFrameworkAdapterContract> = {
  agenthub: {
    id: "agenthub",
    label: "AgentHub",
    agentCardPath: A2A_AGENT_CARD_PATH,
    taskSendMethod: "tasks/send",
    streamingMethod: "tasks/sendSubscribe",
    authSchemes: ["apiKey", "oauth2"],
    inputShape: "agenthub-json-rpc",
    outputShape: "a2a-task-response",
  },
  a2a: {
    id: "a2a",
    label: "Generic A2A",
    agentCardPath: A2A_AGENT_CARD_PATH,
    taskSendMethod: "tasks/send",
    streamingMethod: "tasks/sendSubscribe",
    authSchemes: ["none", "apiKey", "oauth2"],
    inputShape: "a2a-json-rpc",
    outputShape: "a2a-task-response",
  },
  langgraph: {
    id: "langgraph",
    label: "LangGraph",
    agentCardPath: A2A_AGENT_CARD_PATH,
    taskSendMethod: "tasks/send",
    streamingMethod: "tasks/sendSubscribe",
    authSchemes: ["none", "apiKey", "oauth2"],
    inputShape: "adapter-json-rpc",
    outputShape: "a2a-task-response",
  },
  crewai: {
    id: "crewai",
    label: "CrewAI",
    agentCardPath: A2A_AGENT_CARD_PATH,
    taskSendMethod: "tasks/send",
    streamingMethod: "tasks/sendSubscribe",
    authSchemes: ["none", "apiKey"],
    inputShape: "adapter-json-rpc",
    outputShape: "a2a-task-response",
  },
  autogen: {
    id: "autogen",
    label: "AutoGen",
    agentCardPath: A2A_AGENT_CARD_PATH,
    taskSendMethod: "tasks/send",
    streamingMethod: "tasks/sendSubscribe",
    authSchemes: ["none", "apiKey"],
    inputShape: "adapter-json-rpc",
    outputShape: "a2a-task-response",
  },
  "openai-assistants": {
    id: "openai-assistants",
    label: "OpenAI Assistants",
    agentCardPath: A2A_AGENT_CARD_PATH,
    taskSendMethod: "tasks/send",
    streamingMethod: "tasks/sendSubscribe",
    authSchemes: ["apiKey", "oauth2"],
    inputShape: "adapter-json-rpc",
    outputShape: "a2a-task-response",
  },
  custom: {
    id: "custom",
    label: "Custom",
    agentCardPath: A2A_AGENT_CARD_PATH,
    taskSendMethod: "tasks/send",
    streamingMethod: "tasks/sendSubscribe",
    authSchemes: ["none", "apiKey", "oauth2", "openIdConnect"],
    inputShape: "adapter-json-rpc",
    outputShape: "a2a-task-response",
  },
};

export interface A2AMdnsDiscoveryQuery {
  service: typeof A2A_MDNS_SERVICE | typeof AGENTHUB_MDNS_SERVICE;
  protocol: "dns-sd";
  recordTypes: Array<"PTR" | "SRV" | "TXT" | "A" | "AAAA">;
  agentCardPath: string;
}

export interface A2ADiscoveredPeer {
  name: string;
  endpoint: string;
  framework: A2AFramework;
  source: A2ADiscoverySource;
  status: A2APeerStatus;
  agentCard: AgentCard;
  capabilities: AgentCard["capabilities"];
  authScheme: AgentCard["authentication"]["schemes"][number];
  metadata?: Record<string, unknown>;
}

export interface A2APeerUpsertInput {
  userId: string;
  workspaceId?: string | null;
  communityId?: string | null;
  name: string;
  endpoint: string;
  framework?: A2AFramework;
  agentCard?: AgentCard | Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  authScheme?: AgentCard["authentication"]["schemes"][number];
  discoverySource?: A2ADiscoverySource;
  status?: A2APeerStatus;
  metadata?: Record<string, unknown>;
}

export function getA2AMdnsDiscoveryQueries(): A2AMdnsDiscoveryQuery[] {
  return [
    {
      service: AGENTHUB_MDNS_SERVICE,
      protocol: "dns-sd",
      recordTypes: ["PTR", "SRV", "TXT", "A", "AAAA"],
      agentCardPath: A2A_AGENT_CARD_PATH,
    },
    {
      service: A2A_MDNS_SERVICE,
      protocol: "dns-sd",
      recordTypes: ["PTR", "SRV", "TXT", "A", "AAAA"],
      agentCardPath: A2A_AGENT_CARD_PATH,
    },
  ];
}

export function inferA2AFramework(card: Partial<AgentCard>, endpoint: string): A2AFramework {
  const haystack = `${card.provider?.organization ?? ""} ${card.name ?? ""} ${endpoint}`.toLowerCase();
  if (haystack.includes("agenthub")) return "agenthub";
  if (haystack.includes("langgraph")) return "langgraph";
  if (haystack.includes("crewai")) return "crewai";
  if (haystack.includes("autogen")) return "autogen";
  if (haystack.includes("openai")) return "openai-assistants";
  return "a2a";
}

export function normalizeA2AEndpoint(value: string) {
  const url = new URL(value);
  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = A2A_JSON_RPC_PATH;
  }
  url.hash = "";
  return url.toString();
}

export function parseConfiguredA2AEndpoints(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.AGENTHUB_A2A_LOCAL_PEERS || env.NEXT_PUBLIC_AGENTHUB_A2A_LOCAL_PEERS || "";
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    // Fall back to comma-delimited input for desktop-friendly configuration.
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildLoopbackA2AEndpoints(env: NodeJS.ProcessEnv = process.env) {
  const ports = (env.AGENTHUB_A2A_LOCAL_PORTS || "3000,3100,3210,8787")
    .split(",")
    .map((port) => Number(port.trim()))
    .filter((port) => Number.isInteger(port) && port > 0 && port < 65_536);

  return ports.flatMap((port) => [
    `http://127.0.0.1:${port}${A2A_JSON_RPC_PATH}`,
    `http://localhost:${port}${A2A_JSON_RPC_PATH}`,
  ]);
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isAgentCard(value: unknown): value is AgentCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<AgentCard>;
  return typeof card.name === "string" && typeof card.url === "string" && Array.isArray(card.skills);
}

function extractAgentCard(value: unknown): AgentCard | null {
  if (isAgentCard(value)) return value;
  if (value && typeof value === "object") {
    const maybeCard =
      (value as { card?: unknown; result?: { card?: unknown } }).card ??
      (value as { result?: { card?: unknown } }).result?.card;
    if (isAgentCard(maybeCard)) return maybeCard;
  }
  return null;
}

async function fetchJson(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number) {
  const response = await fetchWithTimeout(fetchImpl, url, init, timeoutMs);
  if (!response.ok) throw new Error(`A2A discovery failed for ${url}: ${response.status}`);
  return response.json() as Promise<unknown>;
}

export async function fetchAgentCardFromEndpoint(
  endpoint: string,
  opts: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<A2ADiscoveredPeer | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 900;
  const rpcEndpoint = normalizeA2AEndpoint(endpoint);
  const rpcUrl = new URL(rpcEndpoint);
  const wellKnownUrl = new URL(A2A_AGENT_CARD_PATH, rpcUrl.origin).toString();

  const attempts = [
    () => fetchJson(fetchImpl, wellKnownUrl, { method: "GET", headers: { Accept: "application/json" } }, timeoutMs),
    () =>
      fetchJson(
        fetchImpl,
        rpcEndpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: `discover-${randomUUID()}`,
            method: "agent/card",
            params: { capabilities: { streaming: true, stateTransitionHistory: true } },
          }),
        },
        timeoutMs,
      ),
  ];

  for (const attempt of attempts) {
    try {
      const card = extractAgentCard(await attempt());
      if (!card) continue;
      const authScheme = card.authentication.schemes[0] ?? "none";
      return {
        name: card.name,
        endpoint: card.url || rpcEndpoint,
        framework: inferA2AFramework(card, card.url || rpcEndpoint),
        source: card.url?.includes(A2A_AGENT_CARD_PATH) ? "well-known" : "local",
        status: "online",
        agentCard: card,
        capabilities: card.capabilities,
        authScheme,
        metadata: {
          discoveredAt: new Date().toISOString(),
          discoveryPaths: [wellKnownUrl, rpcEndpoint],
          mdnsServices: getA2AMdnsDiscoveryQueries().map((query) => query.service),
        },
      };
    } catch {
      // Try the next discovery method; callers get a null peer if no method works.
    }
  }
  return null;
}

export async function discoverLocalA2APeers(
  opts: {
    endpoints?: string[];
    fetchImpl?: typeof fetch;
    includeLoopback?: boolean;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<A2ADiscoveredPeer[]> {
  const env = opts.env ?? process.env;
  const endpoints = new Set([
    ...(opts.endpoints ?? parseConfiguredA2AEndpoints(env)),
    ...(opts.includeLoopback === false ? [] : buildLoopbackA2AEndpoints(env)),
  ]);

  const peers = await Promise.all(
    [...endpoints].map(async (endpoint) => {
      try {
        return await fetchAgentCardFromEndpoint(endpoint, {
          fetchImpl: opts.fetchImpl,
          timeoutMs: opts.timeoutMs,
        });
      } catch {
        return null;
      }
    }),
  );

  const byEndpoint = new Map<string, A2ADiscoveredPeer>();
  for (const peer of peers) {
    if (peer) byEndpoint.set(peer.endpoint, peer);
  }
  return [...byEndpoint.values()];
}

export async function ensureDefaultA2ACommunity(userId: string): Promise<A2ACommunity> {
  const [existing] = await db
    .select()
    .from(a2aCommunities)
    .where(and(eq(a2aCommunities.userId, userId), eq(a2aCommunities.isDefault, true)))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(a2aCommunities)
    .values({
      userId,
      name: "Default A2A Community",
      description: "Default workspace for discovered and manually registered A2A peers.",
      isDefault: true,
    })
    .returning();
  return created;
}

export async function listA2ACommunities(userId: string) {
  return db
    .select()
    .from(a2aCommunities)
    .where(eq(a2aCommunities.userId, userId))
    .orderBy(desc(a2aCommunities.isDefault), desc(a2aCommunities.updatedAt));
}

export async function listA2APeers(userId: string, communityId?: string | null) {
  const filter = communityId
    ? and(eq(a2aPeers.userId, userId), eq(a2aPeers.communityId, communityId))
    : eq(a2aPeers.userId, userId);
  return db.select().from(a2aPeers).where(filter).orderBy(desc(a2aPeers.updatedAt));
}

export async function upsertA2APeer(input: A2APeerUpsertInput): Promise<A2APeer> {
  const endpoint = normalizeA2AEndpoint(input.endpoint);
  const [peer] = await db
    .insert(a2aPeers)
    .values({
      userId: input.userId,
      workspaceId: input.workspaceId ?? null,
      communityId: input.communityId ?? null,
      name: input.name,
      endpoint,
      framework: input.framework ?? "a2a",
      agentCard: input.agentCard ?? {},
      capabilities: input.capabilities ?? {},
      authScheme: input.authScheme ?? "none",
      discoverySource: input.discoverySource ?? "manual",
      status: input.status ?? "unknown",
      metadata: input.metadata ?? {},
      lastSeenAt: input.status === "online" ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [a2aPeers.userId, a2aPeers.endpoint],
      set: {
        communityId: input.communityId ?? null,
        name: input.name,
        framework: input.framework ?? "a2a",
        agentCard: input.agentCard ?? {},
        capabilities: input.capabilities ?? {},
        authScheme: input.authScheme ?? "none",
        discoverySource: input.discoverySource ?? "manual",
        status: input.status ?? "unknown",
        metadata: input.metadata ?? {},
        lastSeenAt: input.status === "online" ? new Date() : null,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (input.communityId) {
    await db
      .insert(a2aCommunityMembers)
      .values({
        communityId: input.communityId,
        userId: input.userId,
        peerId: peer.id,
        role: "worker",
        permissions: ["delegate"],
      })
      .onConflictDoNothing();
  }

  return peer;
}

export function buildA2ADelegationPayload(input: {
  task: string;
  requestId?: string;
  agentId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const id = input.requestId ?? `delegate-${randomUUID()}`;
  return {
    jsonrpc: "2.0",
    id,
    method: "tasks/send",
    params: {
      id,
      agentId: input.agentId ?? undefined,
      task: input.task,
      text: input.task,
      message: {
        role: "user",
        parts: [{ kind: "text", text: input.task }],
      },
      metadata: input.metadata ?? {},
    },
  };
}

export async function delegateToA2APeer(input: {
  userId: string;
  peerId: string;
  task: string;
  agentId?: string | null;
  metadata?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const [peer] = await db
    .select()
    .from(a2aPeers)
    .where(and(eq(a2aPeers.id, input.peerId), eq(a2aPeers.userId, input.userId)))
    .limit(1);
  if (!peer) throw new Error("A2A peer not found");

  const payload = buildA2ADelegationPayload({
    task: input.task,
    agentId: input.agentId,
    metadata: {
      communityId: peer.communityId,
      framework: peer.framework,
      ...input.metadata,
    },
  });
  const response = await fetchWithTimeout(
    input.fetchImpl ?? fetch,
    peer.endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    },
    input.timeoutMs ?? 10_000,
  );

  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(`A2A delegation failed: ${response.status}`);
  }
  await db
    .update(a2aPeers)
    .set({
      status: "online",
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(a2aPeers.id, peer.id), eq(a2aPeers.userId, input.userId)));

  return {
    peer,
    payload,
    response: body,
  };
}

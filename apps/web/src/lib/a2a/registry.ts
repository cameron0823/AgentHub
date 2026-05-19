import type { AgentCard } from "@/server/a2a";

export interface A2ARegistryAgent {
  id: string;
  card: AgentCard;
  status: "online" | "offline" | "unknown";
  verified?: boolean;
  tags?: string[];
  updatedAt?: string;
}

export class A2ARegistryClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async register(card: AgentCard) {
    const res = await this.fetchImpl(new URL("/api/v1/agents", this.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });
    if (!res.ok) throw new Error(`A2A registry registration failed: ${await res.text()}`);
    return res.json() as Promise<A2ARegistryAgent>;
  }

  async heartbeat(agentId: string) {
    const res = await this.fetchImpl(new URL(`/api/v1/agents/${encodeURIComponent(agentId)}/heartbeat`, this.baseUrl), {
      method: "POST",
    });
    if (!res.ok) throw new Error(`A2A registry heartbeat failed: ${await res.text()}`);
    return res.json() as Promise<{ ok: true; updatedAt: string }>;
  }

  async search(query: { skill?: string; tag?: string; verified?: boolean } = {}) {
    const url = new URL("/api/v1/agents", this.baseUrl);
    if (query.skill) url.searchParams.set("skill", query.skill);
    if (query.tag) url.searchParams.set("tag", query.tag);
    if (query.verified !== undefined) url.searchParams.set("verified", String(query.verified));
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`A2A registry search failed: ${await res.text()}`);
    return res.json() as Promise<A2ARegistryAgent[]>;
  }

  poll(query: { skill?: string; tag?: string; verified?: boolean } = {}, intervalMs = 30_000) {
    let stopped = false;
    const listeners = new Set<(agents: A2ARegistryAgent[]) => void>();

    const tick = async () => {
      if (stopped) return;
      try {
        const agents = await this.search(query);
        for (const listener of listeners) listener(agents);
      } finally {
        if (!stopped) window.setTimeout(tick, intervalMs);
      }
    };

    void tick();
    return {
      subscribe(listener: (agents: A2ARegistryAgent[]) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      stop() {
        stopped = true;
        listeners.clear();
      },
    };
  }
}

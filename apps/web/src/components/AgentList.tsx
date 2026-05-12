"use client";

import { useMemo, useState } from "react";
import { Bot, MessageSquare, Search } from "lucide-react";
import type { Agent } from "@/stores/chatStore";

interface AgentListProps {
  agents: Agent[];
  activeAgentId: string | null;
  onEditAgent: (agentId: string) => void;
  onStartChat: (agentId: string) => void;
  isStartingChat?: boolean;
}

export function AgentList({ agents, activeAgentId, onEditAgent, onStartChat, isStartingChat }: AgentListProps) {
  const [query, setQuery] = useState("");
  const filteredAgents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return agents;
    return agents.filter((agent) =>
      [agent.name, agent.description || "", agent.model].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [agents, query]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search agents..."
          className="w-full rounded-lg border bg-background py-2 pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {filteredAgents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          No agents found.
        </div>
      ) : (
        <div className="space-y-1">
          {filteredAgents.map((agent) => (
            <div
              key={agent.id}
              className={`rounded-lg border p-2 text-xs transition-colors ${
                agent.id === activeAgentId ? "border-primary bg-primary/5" : "hover:bg-muted/60"
              }`}
            >
              <button
                type="button"
                onClick={() => onEditAgent(agent.id)}
                className="flex w-full items-start gap-2 text-left"
              >
                <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted text-sm">
                  {agent.avatar || <Bot className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{agent.name}</div>
                  <div className="truncate text-muted-foreground">{agent.description || agent.model}</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onStartChat(agent.id)}
                disabled={isStartingChat}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-md bg-muted px-2 py-1 text-xs hover:bg-muted/80 disabled:opacity-60"
              >
                <MessageSquare className="h-3 w-3" />
                Start chat
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

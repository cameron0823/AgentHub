"use client";

import { Edit3, MessageSquare, Users } from "lucide-react";
import type { Agent, AgentGroup } from "@/stores/chatStore";

interface AgentGroupListProps {
  groups: AgentGroup[];
  agents: Agent[];
  activeGroupId: string | null;
  onEditGroup: (groupId: string) => void;
  onStartChat: (groupId: string) => void;
  isStartingChat?: boolean;
}

export function AgentGroupList({
  groups,
  agents,
  activeGroupId,
  onEditGroup,
  onStartChat,
  isStartingChat,
}: AgentGroupListProps) {
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-3 text-xs text-muted-foreground">
        No groups yet.
      </div>
    );
  }

  return (
    <div className="space-y-1" data-testid="group-list">
      {groups.map((group) => (
        <div
          key={group.id}
          data-testid="group-card"
          className={`rounded-xl border p-2 text-xs transition-colors ${
            group.id === activeGroupId
              ? "border-primary/70 bg-primary/10"
              : "border-white/10 bg-white/5 hover:bg-white/10"
          }`}
        >
          <div className="flex items-start gap-2">
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/10">
              <Users className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{group.name}</div>
              <div className="truncate text-muted-foreground">
                {group.pattern} · {group.members.length} agents
              </div>
              <div className="mt-1 truncate text-muted-foreground">
                {group.members.map((member) => agentNames.get(member.agentId) || member.agentId).join(", ") ||
                  "No members"}
              </div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => onEditGroup(group.id)}
              className="flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
            >
              <Edit3 className="h-3 w-3" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => onStartChat(group.id)}
              disabled={isStartingChat}
              className="flex items-center justify-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/15 disabled:opacity-60"
            >
              <MessageSquare className="h-3 w-3" />
              Run
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

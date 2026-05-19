"use client";

import type { AgentGroup } from "@/stores/chatStore";

interface Props {
  group: AgentGroup;
  agentNames: Record<string, string>; // agentId -> name
  activeAgentId: string | null;
  isStreaming: boolean;
}

function NodeBadge({ name, active, role }: { name: string; active: boolean; role?: string | null }) {
  return (
    <div
      className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "border-white/10 bg-white/10 text-muted-foreground"
      }`}
    >
      <span className="font-medium truncate max-w-[80px]">{name}</span>
      {role && <span className="opacity-70 text-[10px] truncate max-w-[80px]">{role}</span>}
    </div>
  );
}

function Arrow({ vertical }: { vertical?: boolean }) {
  return <span className={`text-muted-foreground text-xs select-none ${vertical ? "rotate-90" : ""}`}>→</span>;
}

export function GroupPatternViz({ group, agentNames, activeAgentId, isStreaming }: Props) {
  const members = [...group.members].sort((a, b) => a.sortOrder - b.sortOrder);

  if (members.length === 0) return null;

  return (
    <div className="border-b border-white/10 bg-black/10 px-4 py-2">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide mr-1">{group.pattern}</span>

          {group.pattern === "sequential" && (
            <div className="flex items-center gap-1 flex-wrap">
              {members.map((m, i) => (
                <div key={m.agentId} className="flex items-center gap-1">
                  <NodeBadge
                    name={agentNames[m.agentId] ?? m.agentId.slice(0, 6)}
                    active={activeAgentId === m.agentId && isStreaming}
                    role={m.role}
                  />
                  {i < members.length - 1 && <Arrow />}
                </div>
              ))}
            </div>
          )}

          {group.pattern === "parallel" && (
            <div className="flex items-center gap-1 flex-wrap">
              {members.map((m) => (
                <NodeBadge
                  key={m.agentId}
                  name={agentNames[m.agentId] ?? m.agentId.slice(0, 6)}
                  active={activeAgentId === m.agentId && isStreaming}
                  role={m.role}
                />
              ))}
              <Arrow />
              <NodeBadge name="Synthesis" active={false} />
            </div>
          )}

          {group.pattern === "supervisor" &&
            (() => {
              const supervisor = members.find((m) => m.role === "supervisor") ?? members[0];
              const workers = members.filter((m) => m.agentId !== supervisor.agentId);
              return (
                <div className="flex items-center gap-1 flex-wrap">
                  <NodeBadge
                    name={agentNames[supervisor.agentId] ?? "Supervisor"}
                    active={activeAgentId === supervisor.agentId && isStreaming}
                    role="supervisor"
                  />
                  <Arrow />
                  {workers.map((m, i) => (
                    <div key={m.agentId} className="flex items-center gap-1">
                      <NodeBadge
                        name={agentNames[m.agentId] ?? m.agentId.slice(0, 6)}
                        active={activeAgentId === m.agentId && isStreaming}
                        role={m.role ?? "worker"}
                      />
                      {i < workers.length - 1 && <span className="text-muted-foreground text-xs">·</span>}
                    </div>
                  ))}
                </div>
              );
            })()}

          {group.pattern === "iterative" &&
            (() => {
              const author = members.find((m) => m.role?.toLowerCase().includes("author")) ?? members[0];
              const editor = members.find((m) => m.role?.toLowerCase().includes("editor")) ?? members[1] ?? author;
              const reviser = members.find((m) => m.role?.toLowerCase().includes("reviser")) ?? members[2] ?? author;
              return (
                <div className="flex items-center gap-1 flex-wrap">
                  {[author, editor, reviser].map((m, i) => (
                    <div key={`${m.agentId}-${i}`} className="flex items-center gap-1">
                      <NodeBadge
                        name={agentNames[m.agentId] ?? m.agentId.slice(0, 6)}
                        active={activeAgentId === m.agentId && isStreaming}
                        role={i === 0 ? "Author" : i === 1 ? "Editor" : "Reviser"}
                      />
                      {i < 2 && <Arrow />}
                    </div>
                  ))}
                  <Arrow />
                  <NodeBadge name="Final" active={false} />
                </div>
              );
            })()}

          {(group.pattern === "debate" || group.pattern === "groupchat") && (
            <div className="flex items-center gap-1 flex-wrap">
              {members.map((m, i) => (
                <div key={m.agentId} className="flex items-center gap-1">
                  <NodeBadge
                    name={agentNames[m.agentId] ?? m.agentId.slice(0, 6)}
                    active={activeAgentId === m.agentId && isStreaming}
                    role={m.role}
                  />
                  {i < members.length - 1 && <span className="text-muted-foreground text-xs">⇄</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

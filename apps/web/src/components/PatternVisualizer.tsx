"use client";

import { useMemo } from "react";
import { MermaidBlock } from "./MermaidBlock";
import type { AgentGroup } from "@/stores/chatStore";

interface Member {
  agentId: string;
  agentName: string;
  role?: string | null;
}

interface PatternVisualizerProps {
  pattern: AgentGroup["pattern"];
  members: Member[];
}

function nodeLabel(m: Member, index: number): string {
  const name = m.agentName.replace(/"/g, "'");
  const role = m.role?.trim() ? `\n${m.role}` : "";
  return `"${name}${role}"`;
}

function placeholder(index: number): string {
  return `"Agent ${index + 1}"`;
}

function buildDiagram(pattern: AgentGroup["pattern"], members: Member[]): string {
  const nodes: (Member | null)[] = members.length > 0 ? members : [null, null];

  switch (pattern) {
    case "sequential": {
      const labels = nodes.map((m, i) => (m ? nodeLabel(m, i) : placeholder(i)));
      const ids = labels.map((_, i) => `N${i}`);
      const defs = ids.map((id, i) => `  ${id}[${labels[i]}]`).join("\n");
      const edges = ids.slice(0, -1).map((id, i) => `  ${id} --> ${ids[i + 1]}`).join("\n");
      return `flowchart LR\n${defs}\n${edges}`;
    }

    case "parallel": {
      const labels = nodes.map((m, i) => (m ? nodeLabel(m, i) : placeholder(i)));
      const ids = labels.map((_, i) => `N${i}`);
      const defs = ids.map((id, i) => `  ${id}[${labels[i]}]`).join("\n");
      const inEdges = ids.map((id) => `  Input([Task]) --> ${id}`).join("\n");
      const outEdges = ids.map((id) => `  ${id} --> Syn([Synthesis])`).join("\n");
      return `flowchart LR\n${defs}\n${inEdges}\n${outEdges}`;
    }

    case "supervisor": {
      const supervisor = nodes.find((m) => m?.role?.toLowerCase().includes("supervisor")) ?? nodes[0];
      const workers = nodes.filter((m) => m !== supervisor);
      const supLabel = supervisor ? nodeLabel(supervisor, 0) : `"Supervisor"`;
      const workerLabels = workers.length > 0
        ? workers.map((m, i) => (m ? nodeLabel(m, i + 1) : placeholder(i + 1)))
        : [`"Worker 1"`, `"Worker 2"`];
      const workerIds = workerLabels.map((_, i) => `W${i}`);
      const workerDefs = workerIds.map((id, i) => `  ${id}[${workerLabels[i]}]`).join("\n");
      const supToWorker = workerIds.map((id) => `  S -->|delegate| ${id}`).join("\n");
      const workerToSup = workerIds.map((id) => `  ${id} -->|result| S`).join("\n");
      return `flowchart TD\n  S[${supLabel}]\n${workerDefs}\n${supToWorker}\n${workerToSup}`;
    }

    case "debate": {
      const moderator = nodes.find((m) => m?.role?.toLowerCase().includes("moderator")) ?? nodes[nodes.length - 1];
      const debaters = nodes.filter((m) => m !== moderator);
      const modLabel = moderator ? nodeLabel(moderator, nodes.indexOf(moderator)) : `"Moderator"`;
      const debaterLabels = debaters.length > 0
        ? debaters.map((m, i) => (m ? nodeLabel(m, i) : placeholder(i)))
        : [`"Debater 1"`, `"Debater 2"`];
      const debaterIds = debaterLabels.map((_, i) => `D${i}`);
      const debaterDefs = debaterIds.map((id, i) => `  ${id}[${debaterLabels[i]}]`).join("\n");
      const pairEdges = debaterIds.slice(0, -1).map((id, i) => `  ${id} <--> ${debaterIds[i + 1]}`).join("\n");
      const modEdges = debaterIds.map((id) => `  ${id} --> Mod`).join("\n");
      return `flowchart LR\n${debaterDefs}\n  Mod[${modLabel}]\n${pairEdges}\n${modEdges}`;
    }

    case "groupchat": {
      const labels = nodes.map((m, i) => (m ? nodeLabel(m, i) : placeholder(i)));
      const ids = labels.map((_, i) => `N${i}`);
      const defs = ids.map((id, i) => `  ${id}[${labels[i]}]`).join("\n");
      // Build a cycle: N0 → N1 → N2 → N0
      const cycleEdges = ids.map((id, i) => `  ${id} --> ${ids[(i + 1) % ids.length]}`).join("\n");
      return `flowchart LR\n${defs}\n${cycleEdges}`;
    }
  }
}

export function PatternVisualizer({ pattern, members }: PatternVisualizerProps) {
  const diagram = useMemo(() => buildDiagram(pattern, members), [pattern, members]);

  return (
    <div className="rounded-lg border bg-muted/20 p-3 overflow-x-auto">
      <div className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
        {pattern} flow
      </div>
      <MermaidBlock code={diagram} />
    </div>
  );
}

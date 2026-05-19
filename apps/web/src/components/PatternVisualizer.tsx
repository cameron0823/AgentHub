"use client";

import type { AgentGroup } from "@/stores/chatStore";

interface Member {
  agentId: string;
  agentName: string;
  role?: string | null;
}

type PatternNode = {
  id: string;
  label: string;
  role?: string | null;
};

type PatternEdge = {
  from: string;
  to: string;
  label?: string;
};

interface PatternGraph {
  nodes: PatternNode[];
  edges: PatternEdge[];
}

interface PatternVisualizerProps {
  pattern: AgentGroup["pattern"];
  members: Member[];
}

function memberNode(member: Member | null | undefined, index: number, fallback: string): PatternNode {
  return {
    id: member?.agentId ?? `placeholder-${index}`,
    label: member?.agentName ?? fallback,
    role: member?.role,
  };
}

function buildPatternGraph(pattern: AgentGroup["pattern"], members: Member[]): PatternGraph {
  const nodes: Array<Member | null> = members.length > 0 ? members : [null, null];

  switch (pattern) {
    case "sequential": {
      const graphNodes = nodes.map((member, index) => memberNode(member, index, `Agent ${index + 1}`));
      return {
        nodes: graphNodes,
        edges: graphNodes.slice(0, -1).map((node, index) => ({ from: node.id, to: graphNodes[index + 1].id })),
      };
    }

    case "parallel": {
      const graphNodes = [
        { id: "input", label: "Task" },
        ...nodes.map((member, index) => memberNode(member, index, `Agent ${index + 1}`)),
        { id: "synthesis", label: "Synthesis" },
      ];
      return {
        nodes: graphNodes,
        edges: [
          ...graphNodes.slice(1, -1).map((node) => ({ from: "input", to: node.id, label: "fan out" })),
          ...graphNodes.slice(1, -1).map((node) => ({ from: node.id, to: "synthesis", label: "merge" })),
        ],
      };
    }

    case "supervisor": {
      const supervisor = nodes.find((member) => member?.role?.toLowerCase().includes("supervisor")) ?? nodes[0];
      const workers = nodes.filter((member) => member !== supervisor);
      const supervisorNode = memberNode(supervisor, 0, "Supervisor");
      const workerNodes =
        workers.length > 0
          ? workers.map((member, index) => memberNode(member, index + 1, `Worker ${index + 1}`))
          : [memberNode(null, 1, "Worker 1"), memberNode(null, 2, "Worker 2")];
      return {
        nodes: [supervisorNode, ...workerNodes],
        edges: workerNodes.flatMap((worker) => [
          { from: supervisorNode.id, to: worker.id, label: "delegate" },
          { from: worker.id, to: supervisorNode.id, label: "result" },
        ]),
      };
    }

    case "iterative": {
      const author = nodes.find((member) => member?.role?.toLowerCase().includes("author")) ?? nodes[0];
      const editor = nodes.find((member) => member?.role?.toLowerCase().includes("editor")) ?? nodes[1];
      const reviser = nodes.find((member) => member?.role?.toLowerCase().includes("reviser")) ?? nodes[2];
      const authorNode = memberNode(author, 0, "Author");
      const editorNode = memberNode(editor, 1, "Editor");
      const reviserNode = memberNode(reviser, 2, "Reviser");
      const finalNode = { id: "final", label: "Final synthesis" };
      return {
        nodes: [authorNode, editorNode, reviserNode, finalNode],
        edges: [
          { from: authorNode.id, to: editorNode.id, label: "draft" },
          { from: editorNode.id, to: reviserNode.id, label: "review checkpoint" },
          { from: reviserNode.id, to: authorNode.id, label: "revision" },
          { from: reviserNode.id, to: finalNode.id, label: "complete" },
        ],
      };
    }

    case "debate": {
      const moderator =
        nodes.find((member) => member?.role?.toLowerCase().includes("moderator")) ?? nodes[nodes.length - 1];
      const debaters = nodes.filter((member) => member !== moderator);
      const moderatorNode = memberNode(moderator, nodes.indexOf(moderator), "Moderator");
      const debaterNodes =
        debaters.length > 0
          ? debaters.map((member, index) => memberNode(member, index, `Debater ${index + 1}`))
          : [memberNode(null, 0, "Debater 1"), memberNode(null, 1, "Debater 2")];
      return {
        nodes: [...debaterNodes, moderatorNode],
        edges: [
          ...debaterNodes.slice(0, -1).flatMap((node, index) => [
            { from: node.id, to: debaterNodes[index + 1].id, label: "debate" },
            { from: debaterNodes[index + 1].id, to: node.id, label: "counter" },
          ]),
          ...debaterNodes.map((node) => ({ from: node.id, to: moderatorNode.id, label: "synthesize" })),
        ],
      };
    }

    case "groupchat": {
      const graphNodes = nodes.map((member, index) => memberNode(member, index, `Agent ${index + 1}`));
      return {
        nodes: graphNodes,
        edges: graphNodes.map((node, index) => ({ from: node.id, to: graphNodes[(index + 1) % graphNodes.length].id })),
      };
    }
  }
}

function nodeById(nodes: PatternNode[], id: string) {
  return nodes.find((node) => node.id === id);
}

export function PatternVisualizer({ pattern, members }: PatternVisualizerProps) {
  const graph = buildPatternGraph(pattern, members);

  return (
    <div className="agenthub-glass-panel overflow-x-auto rounded-2xl p-4">
      <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{pattern} flow</div>
      <div className="flex min-w-max items-stretch gap-3" data-testid="pattern-visualizer">
        {graph.nodes.map((node) => (
          <div key={node.id} className="flex items-center gap-3">
            <div className="min-w-36 rounded-xl border border-white/10 bg-white/10 p-3 text-sm">
              <div className="font-medium">{node.label}</div>
              {node.role ? <div className="mt-1 text-xs text-muted-foreground">{node.role}</div> : null}
            </div>
            <div className="flex max-w-36 flex-col gap-1 text-[11px] text-muted-foreground">
              {graph.edges
                .filter((edge) => edge.from === node.id)
                .map((edge) => (
                  <span key={`${edge.from}-${edge.to}-${edge.label ?? "next"}`} className="whitespace-nowrap">
                    {edge.label ?? "next"} {"->"} {nodeById(graph.nodes, edge.to)?.label ?? edge.to}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

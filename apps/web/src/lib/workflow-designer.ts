export const WORKFLOW_NODE_TYPES = [
  "trigger",
  "agent",
  "tool",
  "condition",
  "human_gate",
  "parallel",
  "map",
  "output",
] as const;

export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

export interface WorkflowPosition {
  x: number;
  y: number;
}

export interface AutomationWorkflowNode {
  id: string;
  type: WorkflowNodeType;
  title: string;
  handler?: string;
  prompt?: string;
  interrupt?: boolean;
  position: WorkflowPosition;
}

export interface AutomationWorkflowEdge {
  id: string;
  from: string;
  to: string;
  condition?: string;
}

export interface AutomationWorkflowDefinition {
  version: "1";
  entryNodeId: string;
  nodes: AutomationWorkflowNode[];
  edges: AutomationWorkflowEdge[];
  updatedAt?: string;
}

const NODE_LABELS: Record<WorkflowNodeType, string> = {
  trigger: "Trigger",
  agent: "Agent",
  tool: "Tool",
  condition: "Condition",
  human_gate: "Human gate",
  parallel: "Parallel",
  map: "Map",
  output: "Output",
};

function asWorkflowNodeType(value: unknown): WorkflowNodeType {
  return WORKFLOW_NODE_TYPES.includes(value as WorkflowNodeType) ? (value as WorkflowNodeType) : "agent";
}

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function cleanPosition(value: unknown, fallback: WorkflowPosition): WorkflowPosition {
  if (!value || typeof value !== "object") return fallback;
  const record = value as { x?: unknown; y?: unknown };
  const x = typeof record.x === "number" && Number.isFinite(record.x) ? record.x : fallback.x;
  const y = typeof record.y === "number" && Number.isFinite(record.y) ? record.y : fallback.y;
  return {
    x: Math.max(0, Math.min(1200, Math.round(x))),
    y: Math.max(0, Math.min(720, Math.round(y))),
  };
}

export function createDefaultAutomationWorkflow(prompt: string): AutomationWorkflowDefinition {
  return {
    version: "1",
    entryNodeId: "trigger",
    nodes: [
      {
        id: "trigger",
        type: "trigger",
        title: "Schedule trigger",
        handler: "cron.schedule",
        position: { x: 32, y: 112 },
      },
      {
        id: "agent",
        type: "agent",
        title: "Run agent prompt",
        handler: "agent.run",
        prompt,
        position: { x: 280, y: 112 },
      },
      {
        id: "output",
        type: "output",
        title: "Persist run output",
        handler: "automation.persist_output",
        position: { x: 528, y: 112 },
      },
    ],
    edges: [
      { id: "trigger-agent", from: "trigger", to: "agent" },
      { id: "agent-output", from: "agent", to: "output" },
    ],
  };
}

export function normalizeAutomationWorkflow(value: unknown, fallbackPrompt = ""): AutomationWorkflowDefinition {
  if (!value || typeof value !== "object") return createDefaultAutomationWorkflow(fallbackPrompt);
  const record = value as Partial<AutomationWorkflowDefinition>;
  const rawNodes = Array.isArray(record.nodes) ? record.nodes : [];
  const nodes = rawNodes.map((rawNode, index) => {
    const node = rawNode as Partial<AutomationWorkflowNode>;
    const type = asWorkflowNodeType(node.type);
    const id = cleanText(node.id, `${type}-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-");
    return {
      id,
      type,
      title: cleanText(node.title, NODE_LABELS[type]),
      handler: typeof node.handler === "string" ? node.handler.trim() || undefined : undefined,
      prompt: typeof node.prompt === "string" ? node.prompt : undefined,
      interrupt: Boolean(node.interrupt),
      position: cleanPosition(node.position, { x: 40 + index * 220, y: 112 }),
    };
  });

  if (nodes.length === 0) return createDefaultAutomationWorkflow(fallbackPrompt);

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(record.edges) ? record.edges : [])
    .map((rawEdge, index) => {
      const edge = rawEdge as Partial<AutomationWorkflowEdge>;
      return {
        id: cleanText(edge.id, `edge-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-"),
        from: cleanText(edge.from, ""),
        to: cleanText(edge.to, ""),
        condition: typeof edge.condition === "string" ? edge.condition.trim() || undefined : undefined,
      };
    })
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to);

  const entryNodeId = nodeIds.has(record.entryNodeId ?? "") ? record.entryNodeId! : nodes[0].id;
  return {
    version: "1",
    entryNodeId,
    nodes,
    edges,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
  };
}

export function workflowToSerializableGraph(workflow: AutomationWorkflowDefinition) {
  const normalized = normalizeAutomationWorkflow(workflow);
  return {
    entryNodeId: normalized.entryNodeId,
    nodes: normalized.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      title: node.title,
      handler: node.handler,
      interrupt: node.interrupt,
      edges: normalized.edges
        .filter((edge) => edge.from === node.id)
        .map((edge) => ({ to: edge.to, condition: edge.condition })),
    })),
  };
}

export function buildAutomationWorkflowPrompt(basePrompt: string, workflowValue: unknown) {
  const workflow = normalizeAutomationWorkflow(workflowValue, basePrompt);
  const graph = workflowToSerializableGraph(workflow);
  const orderedNodes = graph.nodes.map((node, index) => {
    const edgeTargets = (node.edges ?? []).map((edge) =>
      edge.condition ? `${edge.to} if ${edge.condition}` : edge.to,
    );
    const edgeText = edgeTargets.length > 0 ? ` -> ${edgeTargets.join(", ")}` : "";
    const original = workflow.nodes.find((candidate) => candidate.id === node.id);
    const nodePrompt = original?.prompt ? `\n   prompt: ${original.prompt}` : "";
    return `${index + 1}. ${node.title} [${node.type}]${edgeText}${nodePrompt}`;
  });

  return [basePrompt, "", "Automation workflow:", `Entry: ${workflow.entryNodeId}`, ...orderedNodes].join("\n");
}

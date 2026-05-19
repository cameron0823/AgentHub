"use client";

import { useEffect, useMemo, useState } from "react";
import { GitBranch, Plus, Save, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  createDefaultAutomationWorkflow,
  normalizeAutomationWorkflow,
  WORKFLOW_NODE_TYPES,
  type AutomationWorkflowDefinition,
  type AutomationWorkflowNode,
  type WorkflowNodeType,
} from "@/lib/workflow-designer";

interface WorkflowDesignerProps {
  automation: {
    id: string;
    name: string;
    prompt: string;
    workflowDefinition?: unknown;
  };
  onSaved?: () => void;
}

const nodeStyles: Record<WorkflowNodeType, string> = {
  trigger: "border-cyan-300/40 bg-cyan-400/10 text-cyan-100",
  agent: "border-blue-300/40 bg-blue-400/10 text-blue-100",
  tool: "border-emerald-300/40 bg-emerald-400/10 text-emerald-100",
  condition: "border-amber-300/40 bg-amber-400/10 text-amber-100",
  human_gate: "border-rose-300/40 bg-rose-400/10 text-rose-100",
  parallel: "border-violet-300/40 bg-violet-400/10 text-violet-100",
  map: "border-fuchsia-300/40 bg-fuchsia-400/10 text-fuchsia-100",
  output: "border-slate-300/40 bg-slate-400/10 text-slate-100",
};

function makeNodeId(type: WorkflowNodeType, nodes: AutomationWorkflowNode[]) {
  let index = nodes.length + 1;
  let id = `${type}-${index}`;
  const existing = new Set(nodes.map((node) => node.id));
  while (existing.has(id)) {
    index += 1;
    id = `${type}-${index}`;
  }
  return id;
}

function nodeLabel(type: WorkflowNodeType) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function WorkflowDesigner({ automation, onSaved }: WorkflowDesignerProps) {
  const initialWorkflow = useMemo(
    () => normalizeAutomationWorkflow(automation.workflowDefinition, automation.prompt),
    [automation.prompt, automation.workflowDefinition],
  );
  const [workflow, setWorkflow] = useState<AutomationWorkflowDefinition>(initialWorkflow);
  const [selectedNodeId, setSelectedNodeId] = useState(initialWorkflow.entryNodeId);
  const [edgeTarget, setEdgeTarget] = useState("");
  const utils = trpc.useUtils();
  const updateWorkflow = trpc.automations.updateWorkflow.useMutation({
    onSuccess: () => {
      void utils.automations.list.invalidate();
      onSaved?.();
    },
  });

  useEffect(() => {
    setWorkflow(initialWorkflow);
    setSelectedNodeId(initialWorkflow.entryNodeId);
  }, [initialWorkflow]);

  const selectedNode = workflow.nodes.find((node) => node.id === selectedNodeId) ?? workflow.nodes[0];
  const edgeNodePairs = workflow.edges
    .map((edge) => ({
      edge,
      from: workflow.nodes.find((node) => node.id === edge.from),
      to: workflow.nodes.find((node) => node.id === edge.to),
    }))
    .filter((pair): pair is typeof pair & { from: AutomationWorkflowNode; to: AutomationWorkflowNode } =>
      Boolean(pair.from && pair.to),
    );

  const updateSelectedNode = (updates: Partial<AutomationWorkflowNode>) => {
    if (!selectedNode) return;
    setWorkflow((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === selectedNode.id ? { ...node, ...updates } : node)),
    }));
  };

  const addNode = (type: WorkflowNodeType) => {
    setWorkflow((current) => {
      const id = makeNodeId(type, current.nodes);
      const nextNode: AutomationWorkflowNode = {
        id,
        type,
        title: nodeLabel(type),
        handler: type === "agent" ? "agent.run" : undefined,
        prompt: type === "agent" ? automation.prompt : undefined,
        interrupt: type === "human_gate",
        position: { x: 80 + current.nodes.length * 48, y: 80 + (current.nodes.length % 4) * 84 },
      };
      setSelectedNodeId(id);
      return { ...current, nodes: [...current.nodes, nextNode] };
    });
  };

  const removeSelectedNode = () => {
    if (!selectedNode || workflow.nodes.length <= 1) return;
    setWorkflow((current) => {
      const nodes = current.nodes.filter((node) => node.id !== selectedNode.id);
      const edges = current.edges.filter((edge) => edge.from !== selectedNode.id && edge.to !== selectedNode.id);
      const entryNodeId = current.entryNodeId === selectedNode.id ? nodes[0].id : current.entryNodeId;
      setSelectedNodeId(entryNodeId);
      return { ...current, entryNodeId, nodes, edges };
    });
  };

  const addEdge = () => {
    if (!selectedNode || !edgeTarget || selectedNode.id === edgeTarget) return;
    setWorkflow((current) => {
      if (current.edges.some((edge) => edge.from === selectedNode.id && edge.to === edgeTarget)) return current;
      return {
        ...current,
        edges: [
          ...current.edges,
          {
            id: `${selectedNode.id}-${edgeTarget}`,
            from: selectedNode.id,
            to: edgeTarget,
          },
        ],
      };
    });
    setEdgeTarget("");
  };

  const removeEdge = (edgeId: string) => {
    setWorkflow((current) => ({ ...current, edges: current.edges.filter((edge) => edge.id !== edgeId) }));
  };

  const saveWorkflow = () => {
    updateWorkflow.mutate({
      id: automation.id,
      workflowDefinition: normalizeAutomationWorkflow(workflow, automation.prompt),
    });
  };

  return (
    <section data-testid="workflow-designer" className="border-t border-white/10 bg-black/10 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <h3 className="truncate text-sm font-semibold">Workflow designer</h3>
        </div>
        <button
          type="button"
          onClick={saveWorkflow}
          disabled={updateWorkflow.isPending}
          className="agenthub-primary-button inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </button>
      </div>

      <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
        {WORKFLOW_NODE_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => addNode(type)}
            className="agenthub-secondary-button shrink-0 px-2 py-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            {nodeLabel(type)}
          </button>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div
          data-testid="workflow-designer-canvas"
          className="relative h-80 overflow-auto rounded-lg border border-white/10 bg-slate-950/45"
        >
          <div className="relative h-[720px] w-[1200px]">
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              {edgeNodePairs.map(({ edge, from, to }) => (
                <line
                  key={edge.id}
                  x1={from.position.x + 168}
                  y1={from.position.y + 32}
                  x2={to.position.x}
                  y2={to.position.y + 32}
                  stroke="rgba(148, 163, 184, 0.58)"
                  strokeWidth="2"
                  markerEnd="url(#workflow-arrow)"
                />
              ))}
              <defs>
                <marker id="workflow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="rgba(148, 163, 184, 0.72)" />
                </marker>
              </defs>
            </svg>
            {workflow.nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                data-testid="workflow-node"
                onClick={() => setSelectedNodeId(node.id)}
                className={`absolute w-44 rounded-lg border px-3 py-2 text-left text-xs shadow-lg transition ${
                  nodeStyles[node.type]
                } ${selectedNode?.id === node.id ? "ring-2 ring-primary/60" : "hover:ring-1 hover:ring-white/30"}`}
                style={{ left: node.position.x, top: node.position.y }}
              >
                <span className="block truncate font-semibold">{node.title}</span>
                <span className="mt-0.5 block truncate text-[10px] opacity-80">{node.type}</span>
              </button>
            ))}
          </div>
        </div>

        <aside className="space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          {selectedNode && (
            <>
              <div>
                <label htmlFor="workflow-node-title" className="text-xs text-muted-foreground">
                  Title
                </label>
                <input
                  id="workflow-node-title"
                  value={selectedNode.title}
                  onChange={(event) => updateSelectedNode({ title: event.target.value })}
                  className="agenthub-field mt-1 w-full px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="workflow-node-type" className="text-xs text-muted-foreground">
                  Type
                </label>
                <select
                  id="workflow-node-type"
                  value={selectedNode.type}
                  onChange={(event) => updateSelectedNode({ type: event.target.value as WorkflowNodeType })}
                  className="agenthub-field mt-1 w-full px-2 py-1.5 text-sm"
                >
                  {WORKFLOW_NODE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {nodeLabel(type)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="workflow-node-handler" className="text-xs text-muted-foreground">
                  Handler
                </label>
                <input
                  id="workflow-node-handler"
                  value={selectedNode.handler ?? ""}
                  onChange={(event) => updateSelectedNode({ handler: event.target.value || undefined })}
                  className="agenthub-field mt-1 w-full px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="workflow-node-prompt" className="text-xs text-muted-foreground">
                  Prompt
                </label>
                <textarea
                  id="workflow-node-prompt"
                  value={selectedNode.prompt ?? ""}
                  onChange={(event) => updateSelectedNode({ prompt: event.target.value || undefined })}
                  className="agenthub-field mt-1 min-h-20 w-full px-2 py-1.5 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={Boolean(selectedNode.interrupt)}
                  onChange={(event) => updateSelectedNode({ interrupt: event.target.checked })}
                />
                Pause before this node
              </label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select
                  value={edgeTarget}
                  onChange={(event) => setEdgeTarget(event.target.value)}
                  className="agenthub-field min-w-0 px-2 py-1.5 text-sm"
                  aria-label="Connect selected node to"
                >
                  <option value="">Connect to...</option>
                  {workflow.nodes
                    .filter((node) => node.id !== selectedNode.id)
                    .map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.title}
                      </option>
                    ))}
                </select>
                <button type="button" onClick={addEdge} className="agenthub-secondary-button px-2 py-1.5 text-xs">
                  Add edge
                </button>
              </div>
              <div className="space-y-1">
                {workflow.edges
                  .filter((edge) => edge.from === selectedNode.id)
                  .map((edge) => (
                    <button
                      key={edge.id}
                      type="button"
                      onClick={() => removeEdge(edge.id)}
                      className="flex w-full items-center justify-between rounded-md bg-white/5 px-2 py-1 text-left text-xs hover:bg-white/10"
                    >
                      <span className="truncate">to {workflow.nodes.find((node) => node.id === edge.to)?.title}</span>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ))}
              </div>
              <button
                type="button"
                onClick={removeSelectedNode}
                disabled={workflow.nodes.length <= 1}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete node
              </button>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

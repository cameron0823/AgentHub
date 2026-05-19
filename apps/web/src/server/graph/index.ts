import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { deadLetterQueue } from "../queues/dead-letter";
import { db } from "../db";
import { graphCheckpoints, graphThreadStates } from "../db/schema";

export type GraphNodeType = "trigger" | "agent" | "tool" | "condition" | "human_gate" | "parallel" | "map" | "output";

export interface GraphEdge {
  to: string;
  condition?: string;
}

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  title?: string;
  handler?: string;
  interrupt?: boolean;
  edges?: GraphEdge[];
}

export interface GraphDefinition<State extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  version: string;
  entryNodeId: string;
  nodes: GraphNode[];
  stateSchema: z.ZodType<State>;
  checkpoint: {
    threadId: string;
    ttlSeconds?: number;
    durable?: boolean;
  };
  limits?: {
    maxIterations?: number;
    maxExecutionMs?: number;
    maxTokens?: number;
    maxCostUsd?: number;
  };
}

export interface GraphCheckpoint<State extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  graphId: string;
  threadId: string;
  nodeId: string;
  phase: "pre" | "post" | "pause";
  state: State;
  createdAt: string;
}

export type GraphNodeHandler<State extends Record<string, unknown>> = (input: {
  state: State;
  node: GraphNode;
  signal?: AbortSignal;
  resumeInput?: unknown;
}) => Promise<State> | State;

export type GraphConditionHandler<State extends Record<string, unknown>> = (input: {
  state: State;
  node: GraphNode;
  edge: GraphEdge;
  resumeInput?: unknown;
}) => Promise<boolean> | boolean;

export interface GraphRunOptions {
  signal?: AbortSignal;
  resumeInput?: unknown;
}

export class TerminationError extends Error {
  constructor(
    message: string,
    readonly category: "timeout" | "halt" = "halt",
  ) {
    super(message);
    this.name = "TerminationError";
  }
}

export class CheckpointManager<State extends Record<string, unknown> = Record<string, unknown>> {
  private readonly checkpoints = new Map<string, GraphCheckpoint<State>[]>();
  private readonly pausedThreads = new Map<string, unknown>();

  async saveCheckpoint(input: Omit<GraphCheckpoint<State>, "id" | "createdAt">) {
    const checkpoint: GraphCheckpoint<State> = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
    };
    const thread = this.checkpoints.get(input.threadId) ?? [];
    thread.push(checkpoint);
    this.checkpoints.set(input.threadId, thread);
    try {
      await db
        .insert(graphCheckpoints)
        .values({
          id: checkpoint.id,
          graphId: checkpoint.graphId,
          threadId: checkpoint.threadId,
          nodeId: checkpoint.nodeId,
          phase: checkpoint.phase,
          state: checkpoint.state,
          createdAt: new Date(checkpoint.createdAt),
        })
        .onConflictDoNothing();
      await db
        .insert(graphThreadStates)
        .values({
          threadId: checkpoint.threadId,
          graphId: checkpoint.graphId,
          paused: checkpoint.phase === "pause",
          latestCheckpointId: checkpoint.id,
          updatedAt: new Date(checkpoint.createdAt),
        })
        .onConflictDoUpdate({
          target: graphThreadStates.threadId,
          set: {
            graphId: checkpoint.graphId,
            paused: checkpoint.phase === "pause",
            latestCheckpointId: checkpoint.id,
            updatedAt: new Date(checkpoint.createdAt),
          },
        });
    } catch {
      // Keep graph execution available when the durable store is unavailable; in-memory checkpoints still work.
    }
    return checkpoint;
  }

  async latest(threadId: string) {
    const thread = this.checkpoints.get(threadId) ?? [];
    const latestMemory = thread.at(-1);
    if (latestMemory) return latestMemory;
    try {
      const [row] = await db
        .select()
        .from(graphCheckpoints)
        .where(eq(graphCheckpoints.threadId, threadId))
        .orderBy(desc(graphCheckpoints.createdAt))
        .limit(1);
      return row
        ? {
            id: row.id,
            graphId: row.graphId,
            threadId: row.threadId,
            nodeId: row.nodeId,
            phase: row.phase,
            state: row.state as State,
            createdAt: row.createdAt.toISOString(),
          }
        : null;
    } catch {
      return null;
    }
  }

  async pause(threadId: string, reason?: unknown) {
    this.pausedThreads.set(threadId, reason ?? true);
    try {
      await db
        .insert(graphThreadStates)
        .values({
          threadId,
          paused: true,
          pauseReason: reason ?? true,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: graphThreadStates.threadId,
          set: {
            paused: true,
            pauseReason: reason ?? true,
            updatedAt: new Date(),
          },
        });
    } catch {
      // In-memory pause state remains authoritative for the current process.
    }
  }

  async resume(threadId: string, resumeInput?: unknown) {
    this.pausedThreads.delete(threadId);
    try {
      await db
        .update(graphThreadStates)
        .set({
          paused: false,
          pauseReason: null,
          updatedAt: new Date(),
        })
        .where(eq(graphThreadStates.threadId, threadId));
    } catch {
      // Keep resume usable with the in-memory checkpoint cache.
    }
    const latest = await this.latest(threadId);
    return latest ? { ...latest, resumeInput } : null;
  }

  async isPaused(threadId: string) {
    if (this.pausedThreads.has(threadId)) return true;
    try {
      const [row] = await db
        .select({ paused: graphThreadStates.paused })
        .from(graphThreadStates)
        .where(eq(graphThreadStates.threadId, threadId))
        .limit(1);
      return Boolean(row?.paused);
    } catch {
      return false;
    }
  }
}

export class GraphExecutor<State extends Record<string, unknown> = Record<string, unknown>> {
  constructor(
    private readonly checkpoints = new CheckpointManager<State>(),
    private readonly handlers: Record<string, GraphNodeHandler<State>> = {},
    private readonly conditions: Record<string, GraphConditionHandler<State>> = {},
  ) {}

  async run(definition: GraphDefinition<State>, initialState: State, options: GraphRunOptions = {}) {
    return this.runFrom(definition, initialState, definition.entryNodeId, options);
  }

  async resume(
    definition: GraphDefinition<State>,
    resumeInput?: unknown,
    options: Omit<GraphRunOptions, "resumeInput"> = {},
  ) {
    const checkpoint = await this.checkpoints.resume(definition.checkpoint.threadId, resumeInput);
    if (!checkpoint) {
      throw new TerminationError(`No checkpoint found for graph thread: ${definition.checkpoint.threadId}`, "halt");
    }

    const nodeMap = new Map(definition.nodes.map((node) => [node.id, node]));
    const pausedNode = nodeMap.get(checkpoint.nodeId);
    const startNodeId =
      pausedNode?.type === "human_gate" && pausedNode.interrupt
        ? await this.nextNodeId(pausedNode, definition.stateSchema.parse(checkpoint.state), resumeInput)
        : checkpoint.nodeId;

    return this.runFrom(definition, definition.stateSchema.parse(checkpoint.state), startNodeId, {
      ...options,
      resumeInput,
    });
  }

  private async runFrom(
    definition: GraphDefinition<State>,
    initialState: State,
    startNodeId: string | null,
    options: GraphRunOptions = {},
  ) {
    const nodeMap = new Map(definition.nodes.map((node) => [node.id, node]));
    let currentNodeId: string | null = startNodeId;
    let state = definition.stateSchema.parse(initialState);
    const startedAt = Date.now();
    const visited: string[] = [];
    const maxIterations = definition.limits?.maxIterations ?? 100;
    const maxExecutionMs = definition.limits?.maxExecutionMs ?? 10 * 60_000;

    try {
      while (currentNodeId) {
        if (options.signal?.aborted) throw new TerminationError("Graph execution aborted", "halt");
        if (Date.now() - startedAt > maxExecutionMs) throw new TerminationError("Graph execution timed out", "timeout");
        if (visited.length >= maxIterations) throw new TerminationError("Graph iteration limit reached", "halt");
        if (await this.checkpoints.isPaused(definition.checkpoint.threadId)) {
          await this.checkpoints.saveCheckpoint({
            graphId: definition.id,
            threadId: definition.checkpoint.threadId,
            nodeId: currentNodeId,
            phase: "pause",
            state,
          });
          return { status: "paused" as const, state, currentNodeId, visited };
        }

        const node = nodeMap.get(currentNodeId);
        if (!node) throw new TerminationError(`Graph node not found: ${currentNodeId}`, "halt");
        visited.push(node.id);

        await this.checkpoints.saveCheckpoint({
          graphId: definition.id,
          threadId: definition.checkpoint.threadId,
          nodeId: node.id,
          phase: "pre",
          state,
        });

        if (node.type === "human_gate" && node.interrupt) {
          await this.checkpoints.pause(definition.checkpoint.threadId, { nodeId: node.id, title: node.title });
          await this.checkpoints.saveCheckpoint({
            graphId: definition.id,
            threadId: definition.checkpoint.threadId,
            nodeId: node.id,
            phase: "pause",
            state,
          });
          return { status: "paused" as const, state, currentNodeId: node.id, visited };
        }

        const handler = node.handler ? this.handlers[node.handler] : undefined;
        if (handler)
          state = definition.stateSchema.parse(
            await handler({ state, node, signal: options.signal, resumeInput: options.resumeInput }),
          );

        await this.checkpoints.saveCheckpoint({
          graphId: definition.id,
          threadId: definition.checkpoint.threadId,
          nodeId: node.id,
          phase: "post",
          state,
        });

        currentNodeId = await this.nextNodeId(node, state, options.resumeInput);
      }

      return { status: "completed" as const, state, currentNodeId: null, visited };
    } catch (error) {
      await deadLetterQueue.record({
        queueName: "agent-flow",
        jobId: definition.checkpoint.threadId,
        graphId: definition.id,
        threadId: definition.checkpoint.threadId,
        failedNode: currentNodeId ?? undefined,
        errorMessage: error instanceof Error ? error.message : "Graph execution failed",
        finalState: state,
        checkpointId: (await this.checkpoints.latest(definition.checkpoint.threadId))?.id,
        failureCategory: error instanceof TerminationError ? error.category : "unknown",
        retryCount: 0,
      });
      throw error;
    }
  }

  private async nextNodeId(node: GraphNode, state: State, resumeInput?: unknown) {
    if (!node.edges || node.edges.length === 0) return null;
    for (const edge of node.edges) {
      if (!edge.condition) return edge.to;
      const condition = this.conditions[edge.condition];
      if (!condition || (await condition({ state, node, edge, resumeInput }))) return edge.to;
    }
    return null;
  }
}

interface GraphReplayRegistration<State extends Record<string, unknown> = Record<string, unknown>> {
  definition: GraphDefinition<State>;
  executor: GraphExecutor<State>;
}

export class GraphResumeRegistry {
  private readonly registrations = new Map<string, GraphReplayRegistration<any>>();

  register<State extends Record<string, unknown>>(definition: GraphDefinition<State>, executor: GraphExecutor<State>) {
    const threadId = definition.checkpoint.threadId;
    this.registrations.set(threadId, { definition, executor });
    return () => {
      const current = this.registrations.get(threadId);
      if (current?.definition === definition && current.executor === executor) {
        this.registrations.delete(threadId);
      }
    };
  }

  has(threadId: string) {
    return this.registrations.has(threadId);
  }

  async resumeThread(threadId: string, resumeInput?: unknown, options: Omit<GraphRunOptions, "resumeInput"> = {}) {
    const registration = this.registrations.get(threadId);
    if (!registration) return null;
    return registration.executor.resume(registration.definition, resumeInput, options);
  }
}

export const graphResumeRegistry = new GraphResumeRegistry();

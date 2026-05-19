import { AgentRuntime } from "../runtime";
import type { AgentStreamChunk } from "../types";
import type {
  AgentRunResult,
  AgentRuntimeFactory,
  OrchestratorAgent,
  OrchestratorEvent,
  OrchestratorRunOptions,
} from "./types";

export abstract class BaseOrchestrator {
  protected readonly createRuntime: AgentRuntimeFactory;

  constructor(createRuntime: AgentRuntimeFactory = (agent) => new AgentRuntime(agent.runtimeOptions)) {
    this.createRuntime = createRuntime;
  }

  abstract run(options: OrchestratorRunOptions): AsyncGenerator<OrchestratorEvent>;

  protected sortedAgents(agents: OrchestratorAgent[]) {
    return [...agents].sort((a, b) => {
      const bySort = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (bySort !== 0) return bySort;
      return a.id.localeCompare(b.id);
    });
  }

  protected buildMessages(options: OrchestratorRunOptions, previousOutputs: AgentRunResult[] = []) {
    const messages = [...(options.messages || [])];
    if (previousOutputs.length > 0) {
      messages.push({
        role: "assistant",
        content: previousOutputs.map((result) => `${result.agentName}: ${result.output}`).join("\n\n"),
      });
    }
    messages.push({ role: "user", content: options.task });
    return messages;
  }

  protected async collectAgentRun(
    options: OrchestratorRunOptions,
    agent: OrchestratorAgent,
    previousOutputs: AgentRunResult[] = [],
  ) {
    const runtime = this.createRuntime(agent);
    const chunks: AgentStreamChunk[] = [];
    let output = "";

    for await (const chunk of runtime.run({
      sessionId: options.sessionId,
      messages: this.buildMessages(options, previousOutputs),
      tools: agent.tools,
      deniedTools: agent.deniedTools,
      signal: options.signal,
    })) {
      chunks.push(chunk);
      if (chunk.type === "content" && chunk.content) {
        output += chunk.content;
      }
    }

    return {
      agentId: agent.id,
      agentName: agent.name,
      output,
      chunks,
    } satisfies AgentRunResult;
  }

  protected synthesize(outputs: AgentRunResult[]) {
    return outputs.map((result) => `### ${result.agentName}\n${result.output || "(no text output)"}`).join("\n\n");
  }
}

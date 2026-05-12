import { BaseOrchestrator } from "./base";
import type { AgentRunResult, OrchestratorEvent, OrchestratorRunOptions } from "./types";

export class ParallelOrchestrator extends BaseOrchestrator {
  async *run(options: OrchestratorRunOptions): AsyncGenerator<OrchestratorEvent> {
    const agents = this.sortedAgents(options.agents);

    yield {
      type: "group_start",
      groupId: options.group.id,
      groupName: options.group.name,
      pattern: "parallel",
      agentCount: agents.length,
    };

    for (const agent of agents) {
      yield {
        type: "agent_start",
        groupId: options.group.id,
        agentId: agent.id,
        agentName: agent.name,
        role: agent.role,
      };
    }

    const settled = await Promise.allSettled(agents.map((agent) => this.collectAgentRun(options, agent)));
    const outputs: AgentRunResult[] = [];

    for (let index = 0; index < settled.length; index++) {
      const result = settled[index];
      const agent = agents[index];
      if (result.status === "rejected") {
        yield {
          type: "error",
          groupId: options.group.id,
          agentId: agent.id,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        };
        continue;
      }

      for (const chunk of result.value.chunks) {
        yield { type: "agent_output", groupId: options.group.id, agentId: agent.id, agentName: agent.name, chunk };
      }
      outputs.push(result.value);
      yield {
        type: "agent_complete",
        groupId: options.group.id,
        agentId: agent.id,
        agentName: agent.name,
        output: result.value.output,
      };
    }

    yield {
      type: "group_complete",
      groupId: options.group.id,
      groupName: options.group.name,
      pattern: "parallel",
      outputs,
      synthesis: this.synthesize(outputs),
    };
  }
}

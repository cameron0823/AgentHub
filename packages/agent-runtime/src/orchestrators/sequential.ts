import { BaseOrchestrator } from "./base";
import type { AgentRunResult, OrchestratorEvent, OrchestratorRunOptions } from "./types";

export class SequentialOrchestrator extends BaseOrchestrator {
  async *run(options: OrchestratorRunOptions): AsyncGenerator<OrchestratorEvent> {
    const agents = this.sortedAgents(options.agents);
    const outputs: AgentRunResult[] = [];

    yield {
      type: "group_start",
      groupId: options.group.id,
      groupName: options.group.name,
      pattern: "sequential",
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

      try {
        const result = await this.collectAgentRun(options, agent, outputs);
        for (const chunk of result.chunks) {
          yield { type: "agent_output", groupId: options.group.id, agentId: agent.id, agentName: agent.name, chunk };
        }
        outputs.push(result);
        yield { type: "agent_complete", groupId: options.group.id, agentId: agent.id, agentName: agent.name, output: result.output };
      } catch (err) {
        yield {
          type: "error",
          groupId: options.group.id,
          agentId: agent.id,
          error: err instanceof Error ? err.message : String(err),
        };
        throw err;
      }
    }

    yield {
      type: "group_complete",
      groupId: options.group.id,
      groupName: options.group.name,
      pattern: "sequential",
      outputs,
      synthesis: this.synthesize(outputs),
    };
  }
}

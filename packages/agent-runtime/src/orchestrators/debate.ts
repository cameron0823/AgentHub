import { BaseOrchestrator } from "./base";
import type { OrchestratorEvent, OrchestratorRunOptions, AgentRunResult } from "./types";

export class DebateOrchestrator extends BaseOrchestrator {
  async *run(options: OrchestratorRunOptions): AsyncGenerator<OrchestratorEvent> {
    const agents = this.sortedAgents(options.agents);
    const rounds = 2;
    const groupId = options.group.id;

    yield { type: "debate_start", groupId, agents: agents.map((a) => a.name), rounds };

    const allOutputs: AgentRunResult[] = [];

    for (let round = 1; round <= rounds; round++) {
      yield { type: "debate_round", groupId, round, total: rounds };

      const roundOutputs: AgentRunResult[] = [];

      for (const agent of agents) {
        yield { type: "agent_start", groupId, agentId: agent.id, agentName: agent.name, role: agent.role };

        const debateContext =
          round > 1
            ? `Previous round arguments:\n${allOutputs
                .filter((o) => o.agentId !== agent.id)
                .map((o) => `- ${o.agentName}: ${o.output.slice(0, 500)}`)
                .join("\n")}\n\n`
            : "";

        const prompt = `${debateContext}You are participating in a structured debate on the following topic. Present your argument clearly and address opposing viewpoints if any exist.

Topic: ${options.task}

Your perspective: ${agent.role || "debater"}`;

        const result = await this.collectAgentRun({ ...options, task: prompt }, agent, roundOutputs);

        roundOutputs.push(result);
        allOutputs.push(result);
        yield { type: "agent_complete", groupId, agentId: agent.id, agentName: agent.name, output: result.output };
      }
    }

    // Synthesize debate into consensus or summary
    const synthesis = this.synthesize(allOutputs.slice(-agents.length));

    yield {
      type: "group_complete",
      groupId,
      groupName: options.group.name,
      pattern: options.group.pattern,
      synthesis: `## Debate Summary\n\n${synthesis}\n\n### All Arguments\n\n${allOutputs.map((o) => `**${o.agentName}**: ${o.output.slice(0, 300)}...`).join("\n\n")}`,
      outputs: allOutputs,
    };
  }
}

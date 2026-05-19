import { BaseOrchestrator } from "./base";
import type { OrchestratorEvent, OrchestratorRunOptions, AgentRunResult } from "./types";

export class GroupChatOrchestrator extends BaseOrchestrator {
  async *run(options: OrchestratorRunOptions): AsyncGenerator<OrchestratorEvent> {
    const agents = this.sortedAgents(options.agents);
    const maxTurns = 3;
    const groupId = options.group.id;

    yield { type: "groupchat_start", groupId, agents: agents.map((a) => a.name), maxTurns };

    const chatHistory: string[] = [];
    const allOutputs: AgentRunResult[] = [];

    for (let turn = 1; turn <= maxTurns; turn++) {
      yield { type: "groupchat_turn", groupId, turn, maxTurns };

      for (const agent of agents) {
        yield { type: "agent_start", groupId, agentId: agent.id, agentName: agent.name, role: agent.role };

        const context = chatHistory.length > 0 ? `Conversation so far:\n${chatHistory.join("\n\n")}\n\n` : "";

        const prompt = `${context}You are ${agent.name} (${agent.role || "participant"}). Respond to the current discussion.

Topic: ${options.task}`;

        const result = await this.collectAgentRun({ ...options, task: prompt }, agent, allOutputs);

        allOutputs.push(result);
        chatHistory.push(`${agent.name}: ${result.output}`);
        yield { type: "agent_complete", groupId, agentId: agent.id, agentName: agent.name, output: result.output };
      }
    }

    const synthesis = this.synthesize(allOutputs.slice(-agents.length));

    yield {
      type: "group_complete",
      groupId,
      groupName: options.group.name,
      pattern: options.group.pattern,
      synthesis: `## Group Discussion Summary\n\n${synthesis}\n\n### Full Conversation\n\n${chatHistory.join("\n\n")}`,
      outputs: allOutputs,
    };
  }
}

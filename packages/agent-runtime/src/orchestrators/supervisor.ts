import { BaseOrchestrator } from "./base";
import type { OrchestratorEvent, OrchestratorRunOptions, AgentRunResult } from "./types";

export class SupervisorOrchestrator extends BaseOrchestrator {
  async *run(options: OrchestratorRunOptions): AsyncGenerator<OrchestratorEvent> {
    const agents = this.sortedAgents(options.agents);
    const supervisor = agents.find((a) => a.role === "supervisor") || agents[0];
    const workers = agents.filter((a) => a.id !== supervisor.id);
    const groupId = options.group.id;

    yield { type: "supervisor_start", groupId, supervisor: supervisor.name };

    // Step 1: Supervisor analyzes task and delegates to workers
    const delegationPrompt = `You are the supervisor. Analyze the following task and create a delegation plan for ${workers.length} workers.

Task: ${options.task}

Workers:
${workers.map((w) => `- ${w.name}: ${w.role || "worker"}`).join("\n")}

Provide your analysis and specific instructions for each worker. Format your response as:
ANALYSIS: <your analysis>
${workers.map((w) => `INSTRUCTIONS_FOR_${w.name}: <specific instructions>`).join("\n")}`;

    const supervisorRuntime = this.createRuntime(supervisor);
    let supervisorOutput = "";

    for await (const chunk of supervisorRuntime.run({
      sessionId: options.sessionId,
      messages: [{ role: "user", content: delegationPrompt }],
      tools: supervisor.tools,
      signal: options.signal,
    })) {
      if (chunk.type === "content" && chunk.content) {
        supervisorOutput += chunk.content;
        yield { type: "supervisor_thinking", groupId, content: chunk.content };
      }
    }

    yield { type: "supervisor_plan", groupId, plan: supervisorOutput };

    // Step 2: Workers execute their tasks
    const workerOutputs: AgentRunResult[] = [];

    for (const worker of workers) {
      yield { type: "agent_start", groupId, agentId: worker.id, agentName: worker.name, role: worker.role };

      const workerPrompt = `${supervisorOutput}\n\nBased on the supervisor's plan above, complete your assigned task:\n\n${options.task}`;

      const result = await this.collectAgentRun(
        { ...options, task: workerPrompt },
        worker,
        workerOutputs
      );

      workerOutputs.push(result);
      yield { type: "agent_complete", groupId, agentId: worker.id, agentName: worker.name, output: result.output };
    }

    // Step 3: Supervisor reviews and synthesizes
    yield { type: "supervisor_review", groupId, review: "Synthesizing worker outputs..." };

    const synthesisPrompt = `You are the supervisor. Review the following worker outputs and provide a final synthesized answer to the original task.

Original Task: ${options.task}

Worker Outputs:
${workerOutputs.map((w) => `### ${w.agentName}\n${w.output}`).join("\n\n")}

Provide a clear, comprehensive final answer.`;

    let synthesis = "";
    for await (const chunk of supervisorRuntime.run({
      sessionId: options.sessionId,
      messages: [{ role: "user", content: synthesisPrompt }],
      tools: supervisor.tools,
      signal: options.signal,
    })) {
      if (chunk.type === "content" && chunk.content) {
        synthesis += chunk.content;
      }
    }

    yield {
      type: "group_complete",
      groupId,
      groupName: options.group.name,
      pattern: options.group.pattern,
      synthesis,
      outputs: workerOutputs,
    };
  }
}

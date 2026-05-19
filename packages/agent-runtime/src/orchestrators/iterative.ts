import { BaseOrchestrator } from "./base";
import type { AgentRunResult, OrchestratorAgent, OrchestratorEvent, OrchestratorRunOptions } from "./types";

function roleIncludes(agent: OrchestratorAgent, term: string) {
  return agent.role?.toLowerCase().includes(term) || agent.name.toLowerCase().includes(term);
}

export class IterativeOrchestrator extends BaseOrchestrator {
  async *run(options: OrchestratorRunOptions): AsyncGenerator<OrchestratorEvent> {
    const agents = this.sortedAgents(options.agents);
    const groupId = options.group.id;
    const author = agents.find((agent) => roleIncludes(agent, "author")) || agents[0];
    const editor = agents.find((agent) => roleIncludes(agent, "editor")) || agents[1] || author;
    const reviser = agents.find((agent) => roleIncludes(agent, "reviser")) || agents[2] || author;
    const maxIterations = Math.max(1, Math.min(options.maxIterations ?? options.group.maxIterations ?? 2, 5));
    const outputs: AgentRunResult[] = [];
    let currentDraft = "";

    yield {
      type: "group_start",
      groupId,
      groupName: options.group.name,
      pattern: "iterative",
      agentCount: agents.length,
    };

    yield {
      type: "iterative_start",
      groupId,
      author: author.name,
      editor: editor.name,
      reviser: reviser.name,
      maxIterations,
    };

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      yield { type: "iterative_iteration", groupId, iteration, total: maxIterations };

      const authorPrompt = [
        `You are the author in an iterative author/editor/reviser loop. Draft iteration ${iteration} for the task.`,
        `Task: ${options.task}`,
        currentDraft ? `Previous revised draft:\n${currentDraft}` : "",
        "Produce the strongest complete draft you can for this iteration.",
      ]
        .filter(Boolean)
        .join("\n\n");
      yield { type: "agent_start", groupId, agentId: author.id, agentName: author.name, role: author.role };
      const draft = await this.collectAgentRun({ ...options, task: authorPrompt }, author, outputs);
      for (const chunk of draft.chunks) {
        yield { type: "agent_output", groupId, agentId: author.id, agentName: author.name, chunk };
      }
      outputs.push(draft);
      currentDraft = draft.output;
      yield { type: "agent_complete", groupId, agentId: author.id, agentName: author.name, output: draft.output };

      const editorPrompt = [
        "You are the editor in an iterative author/editor/reviser loop.",
        "Review the draft for correctness, gaps, structure, and missing verification.",
        `Original task: ${options.task}`,
        `Draft:\n${currentDraft}`,
        "Return concise revision instructions. Do not rewrite the whole draft.",
      ].join("\n\n");
      yield { type: "agent_start", groupId, agentId: editor.id, agentName: editor.name, role: editor.role };
      const review = await this.collectAgentRun({ ...options, task: editorPrompt }, editor, outputs);
      for (const chunk of review.chunks) {
        yield { type: "agent_output", groupId, agentId: editor.id, agentName: editor.name, chunk };
      }
      outputs.push(review);
      yield { type: "agent_complete", groupId, agentId: editor.id, agentName: editor.name, output: review.output };

      const checkpointId = crypto.randomUUID();
      const checkpointTitle = `Approve iterative review ${iteration}?`;
      const checkpointPlan = review.output || "Editor returned no review text.";
      if (options.checkpoint) {
        const approved = await options.checkpoint(checkpointId, checkpointTitle, checkpointPlan);
        if (!approved) {
          yield {
            type: "group_complete",
            groupId,
            groupName: options.group.name,
            pattern: "iterative",
            outputs,
            synthesis: "Task cancelled at iterative checkpoint.",
          };
          return;
        }
      } else {
        yield { type: "hitl_checkpoint", groupId, checkpointId, title: checkpointTitle, plan: checkpointPlan };
      }

      const reviserPrompt = [
        "You are the reviser in an iterative author/editor/reviser loop.",
        `Original task: ${options.task}`,
        `Draft:\n${currentDraft}`,
        `Editor instructions:\n${review.output}`,
        "Return the revised draft only.",
      ].join("\n\n");
      yield { type: "agent_start", groupId, agentId: reviser.id, agentName: reviser.name, role: reviser.role };
      const revision = await this.collectAgentRun({ ...options, task: reviserPrompt }, reviser, outputs);
      for (const chunk of revision.chunks) {
        yield { type: "agent_output", groupId, agentId: reviser.id, agentName: reviser.name, chunk };
      }
      outputs.push(revision);
      currentDraft = revision.output || currentDraft;
      yield { type: "agent_complete", groupId, agentId: reviser.id, agentName: reviser.name, output: revision.output };
      yield { type: "iterative_revision", groupId, iteration, draft: currentDraft, review: review.output };
    }

    yield { type: "iterative_complete", groupId, iterations: maxIterations, finalOutput: currentDraft };
    yield {
      type: "group_complete",
      groupId,
      groupName: options.group.name,
      pattern: "iterative",
      outputs,
      synthesis: `## Iterative Result\n\n${currentDraft || this.synthesize(outputs)}`,
    };
  }
}

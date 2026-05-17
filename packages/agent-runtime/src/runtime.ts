import { providerRegistry, Message, type ReasoningTimelineEvent } from "@agenthub/ai-providers";
import { globalToolRegistry } from "./tools/registry";
import { AgentOptions, RunOptions, AgentStreamChunk, ExtraTool } from "./types";
import { createToolApprovalRequest, requestApproval, requiresApprovalForTool } from "./approvals";

function parseToolArguments(args: string | Record<string, unknown>) {
  return typeof args === "string" ? JSON.parse(args) : args;
}

function createTimelineEvent(
  sequence: number,
  event: Omit<ReasoningTimelineEvent, "id">
): ReasoningTimelineEvent {
  return {
    id: `reasoning-${sequence}`,
    ...event,
  };
}

export class AgentRuntime {
  constructor(private options: AgentOptions) {}

  async *run(runOptions: RunOptions): AsyncGenerator<AgentStreamChunk> {
    const registry = this.options.registry ?? providerRegistry;
    const { provider, model } = registry.resolveModel(this.options.model);

    const messages: Message[] = [...runOptions.messages];
    const maxToolIterations = this.options.maxToolIterations ?? 3;
    const toolTimeoutMs = this.options.toolTimeoutMs ?? 30_000;
    const deniedToolSet = new Set(runOptions.deniedTools || []);
    let eventSequence = 0;
    
    // Inject system prompt if not present
    if (this.options.systemPrompt && !messages.some(m => m.role === "system")) {
      messages.unshift({ role: "system", content: this.options.systemPrompt });
    }

    const enabledTools = runOptions.tools
      ? globalToolRegistry.list().filter(t => runOptions.tools!.includes(t.name) && !deniedToolSet.has(t.name))
      : [];

    const extraTools: ExtraTool[] = (runOptions.extraTools || []).filter(t => !deniedToolSet.has(t.name));

    const allToolDefs = [
      ...enabledTools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: globalToolRegistry.zodToJSONSchema(t.parameters),
        _isExtra: false,
      })),
      ...extraTools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        _isExtra: true,
      })),
    ];
    const exposedToolNames = new Set(allToolDefs.map((tool) => tool.name));

    const tools = allToolDefs.length > 0 ? allToolDefs.map(t => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    })) : undefined;

    for (let iteration = 0; iteration <= maxToolIterations; iteration++) {
      const toolCalls: NonNullable<Message["tool_calls"]> = [];
      let assistantContent = "";
      const streamStartedAt = Date.now();
      let lastReasoningEventAt = streamStartedAt;

      const stream = provider.streamChat({
        model,
        messages,
        temperature: this.options.temperature,
        maxTokens: this.options.maxTokens,
        tools,
        signal: runOptions.signal,
      });

      for await (const chunk of stream) {
        if (chunk.type === "content" && chunk.content) {
          assistantContent += chunk.content;
        }
        if (chunk.type === "reasoning" && chunk.content) {
          const now = Date.now();
          yield {
            type: "reasoning_event",
            event: createTimelineEvent(++eventSequence, {
              kind: "provider_reasoning",
              title: "Provider reasoning",
              content: chunk.content,
              visibility: "provider-visible",
              startedAtMs: lastReasoningEventAt - streamStartedAt,
              durationMs: Math.max(now - lastReasoningEventAt, 0),
            }),
          };
          lastReasoningEventAt = now;
        }
        if (chunk.type === "tool_call" && chunk.toolCall) {
          toolCalls.push(chunk.toolCall);
          yield {
            type: "reasoning_event",
            event: createTimelineEvent(++eventSequence, {
              kind: "tool_decision",
              title: `Tool requested: ${chunk.toolCall.function.name}`,
              visibility: "metadata-only",
              startedAtMs: Math.max(Date.now() - streamStartedAt, 0),
              durationMs: 0,
              toolName: chunk.toolCall.function.name,
              toolCallId: chunk.toolCall.id,
            }),
          };
        }
        yield chunk;
      }

      if (toolCalls.length === 0) return;

      messages.push({
        role: "assistant",
        content: assistantContent,
        tool_calls: toolCalls,
      });

      if (iteration >= maxToolIterations) {
        for (const toolCall of toolCalls) {
          yield {
            type: "tool_result",
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
            result: { error: `Maximum tool iterations (${maxToolIterations}) reached` },
          };
        }
        return;
      }

      for (const toolCall of toolCalls) {
        let result: any;
        const toolName = toolCall.function.name;
        const toolStartMs = Date.now();
        const toolStartedAtMs = Math.max(toolStartMs - streamStartedAt, 0);
        const emitToolExecutionEvent = (status: "completed" | "blocked" | "rejected" | "failed") => ({
          type: "reasoning_event" as const,
          event: createTimelineEvent(++eventSequence, {
            kind: "tool_execution",
            title: `Tool ${status}: ${toolName}`,
            visibility: "metadata-only" as const,
            startedAtMs: toolStartedAtMs,
            durationMs: Math.max(Date.now() - toolStartMs, 0),
            toolName,
            toolCallId: toolCall.id,
            metadata: { status },
          }),
        });
        try {
          if (deniedToolSet.has(toolName)) {
            result = { error: `Tool ${toolName} blocked by tool profile deny list` };
            yield emitToolExecutionEvent("blocked");
            yield {
              type: "tool_result",
              toolName,
              toolCallId: toolCall.id,
              result,
            };
            messages.push({
              role: "tool",
              content: JSON.stringify(result),
              tool_call_id: toolCall.id,
              name: toolName,
            });
            continue;
          }
          if (!exposedToolNames.has(toolName)) {
            result = { error: `Tool ${toolName} is not exposed by the active tool profile` };
            yield emitToolExecutionEvent("blocked");
            yield {
              type: "tool_result",
              toolName,
              toolCallId: toolCall.id,
              result,
            };
            messages.push({
              role: "tool",
              content: JSON.stringify(result),
              tool_call_id: toolCall.id,
              name: toolName,
            });
            continue;
          }
          const extra = extraTools.find(t => t.name === toolName);
          const args = parseToolArguments(toolCall.function.arguments);
          if (runOptions.approval && requiresApprovalForTool(toolName, runOptions.approvalPolicy)) {
            const approvalRequest = createToolApprovalRequest({
              sessionId: runOptions.sessionId,
              toolName,
              args,
            });
            const approvalPromise = requestApproval(
              approvalRequest,
              runOptions.approval,
              runOptions.approvalPolicy?.timeoutMs
            );
            yield {
              type: "approval_request",
              approvalId: approvalRequest.id,
              request: approvalRequest,
            };
            const decision = await approvalPromise;
            yield {
              type: "approval_result",
              approvalId: approvalRequest.id,
              toolName,
              decision,
            };
            if (!decision.approved) {
              result = {
                error: `Tool ${toolName} rejected by human approval`,
                approvalId: approvalRequest.id,
                reason: decision.reason ?? "Approval denied",
              };
              yield emitToolExecutionEvent("rejected");
              yield {
                type: "tool_result",
                toolName,
                toolCallId: toolCall.id,
                result,
              };
              messages.push({
                role: "tool",
                content: JSON.stringify(result),
                tool_call_id: toolCall.id,
                name: toolName,
              });
              continue;
            }
          }

          if (extra) {
            result = await extra.execute(args);
          } else {
            result = await globalToolRegistry.execute(toolName, args, { timeoutMs: toolTimeoutMs, context: runOptions.toolContext });
          }
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }

        yield emitToolExecutionEvent(result?.error ? "failed" : "completed");
        yield {
          type: "tool_result",
          toolName,
          toolCallId: toolCall.id,
          result,
        };

        messages.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
          name: toolName,
        });
      }
    }
  }
}

import { providerRegistry, Message } from "@agenthub/ai-providers";
import { globalToolRegistry } from "./tools/registry";
import { AgentOptions, RunOptions, AgentStreamChunk, ExtraTool } from "./types";

export class AgentRuntime {
  constructor(private options: AgentOptions) {}

  async *run(runOptions: RunOptions): AsyncGenerator<AgentStreamChunk> {
    const { provider, model } = providerRegistry.resolveModel(this.options.model);

    const messages: Message[] = [...runOptions.messages];
    const maxToolIterations = this.options.maxToolIterations ?? 3;
    const toolTimeoutMs = this.options.toolTimeoutMs ?? 30_000;
    
    // Inject system prompt if not present
    if (this.options.systemPrompt && !messages.some(m => m.role === "system")) {
      messages.unshift({ role: "system", content: this.options.systemPrompt });
    }

    const enabledTools = runOptions.tools
      ? globalToolRegistry.list().filter(t => runOptions.tools!.includes(t.name))
      : [];

    const extraTools: ExtraTool[] = runOptions.extraTools || [];

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

    const tools = allToolDefs.length > 0 ? allToolDefs.map(t => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    })) : undefined;

    for (let iteration = 0; iteration <= maxToolIterations; iteration++) {
      const toolCalls: NonNullable<Message["tool_calls"]> = [];
      let assistantContent = "";

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
        if (chunk.type === "tool_call" && chunk.toolCall) {
          toolCalls.push(chunk.toolCall);
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
        try {
          const extra = extraTools.find(t => t.name === toolCall.function.name);
          if (extra) {
            const args = typeof toolCall.function.arguments === "string"
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;
            result = await extra.execute(args);
          } else {
            result = await globalToolRegistry.execute(toolCall.function.name, toolCall.function.arguments, { timeoutMs: toolTimeoutMs });
          }
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }

        yield {
          type: "tool_result",
          toolName: toolCall.function.name,
          toolCallId: toolCall.id,
          result,
        };

        messages.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
        });
      }
    }
  }
}

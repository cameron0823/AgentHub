import { z } from "zod";
import { Tool } from "@agenthub/ai-providers";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodObject<any>;
  execute: (args: any, context?: ToolExecutionContext) => Promise<any>;
}

export interface ToolExecutionContext {
  desktopRuntime?: boolean;
  getCredential?: (toolName: string) => Promise<string | null>;
}

export interface ToolExecuteOptions {
  timeoutMs?: number;
  context?: ToolExecutionContext;
}

export const SKILL_RUNTIME_TOOL_NAMES = [
  "run_skill",
  "read_skill_reference",
  "exec_skill_script",
  "export_skill_file",
] as const;

export type SkillRuntimeToolName = (typeof SKILL_RUNTIME_TOOL_NAMES)[number];

export function isSkillRuntimeToolName(name: string): name is SkillRuntimeToolName {
  return (SKILL_RUNTIME_TOOL_NAMES as readonly string[]).includes(name);
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  toAICapability(tool: ToolDefinition): Tool {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: this.zodToJSONSchema(tool.parameters),
      },
    };
  }

  toAICapabilities(): Tool[] {
    return this.list().map((t) => this.toAICapability(t));
  }

  async execute(name: string, args: string | Record<string, any>, options: ToolExecuteOptions = {}): Promise<any> {
    const tool = this.get(name);
    if (!tool) throw new Error(`Tool ${name} not found`);

    const parsedArgs = typeof args === "string" ? JSON.parse(args) : args;
    const validatedArgs = tool.parameters.parse(parsedArgs);

    if (!options.timeoutMs || options.timeoutMs <= 0) {
      return tool.execute(validatedArgs, options.context);
    }

    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        tool.execute(validatedArgs, options.context),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Tool ${name} timed out after ${options.timeoutMs}ms`)),
            options.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  public zodToJSONSchema(schema: z.ZodObject<any>): Record<string, any> {
    // Simplified Zod to JSON Schema converter for Ollama/OpenAI compatibility
    // In a real app, use a library like zod-to-json-schema
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(schema.shape)) {
      const type = (value as any)._def.typeName;
      let jsonType = "string";
      if (type === "ZodNumber") jsonType = "number";
      if (type === "ZodBoolean") jsonType = "boolean";
      if (type === "ZodArray") jsonType = "array";
      if (type === "ZodObject") jsonType = "object";

      properties[key] = {
        type: jsonType,
        description: (value as any).description || "",
      };

      if (!(value as any).isOptional()) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required,
    };
  }
}

export const globalToolRegistry = new ToolRegistry();

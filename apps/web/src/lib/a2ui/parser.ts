import { a2uiActionSchema, getA2UISurfacePayload, type A2UIAction, validateA2UIComponentGraph } from "./schema";

export const A2UI_BLOCK_PATTERN = /:::a2ui\n([\s\S]*?)\n:::/g;

export interface ParsedA2UIBlocks {
  text: string;
  actions: A2UIAction[];
  errors: string[];
}

export function extractA2UIBlocks(content: string): ParsedA2UIBlocks {
  const actions: A2UIAction[] = [];
  const errors: string[] = [];

  const text = content.replace(A2UI_BLOCK_PATTERN, (_match, rawJson: string) => {
    try {
      const json = JSON.parse(rawJson);
      const action = a2uiActionSchema.parse(json);
      const surface = getA2UISurfacePayload(action);
      if (surface) validateA2UIComponentGraph(surface.components, surface.rootId);
      actions.push(action);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown A2UI parse error";
      errors.push(message);
      if (process.env.NODE_ENV !== "test") {
        console.warn("Skipping invalid A2UI block", { error: message });
      }
    }
    return "";
  });

  return { text: text.trim(), actions, errors };
}

export function formatA2UIEventMessage(input: {
  surfaceId: string;
  event: string;
  dataModel: Record<string, unknown>;
  context?: Record<string, unknown>;
}) {
  return ["A2UI event payload:", "```json", JSON.stringify({ type: "a2uiEvent", ...input }, null, 2), "```"].join("\n");
}

import { z } from "zod";
import { ToolDefinition } from "../registry";

export const datetime: ToolDefinition = {
  name: "datetime",
  description: "Get the current date and time.",
  parameters: z.object({}),
  execute: async () => {
    const now = new Date();
    return {
      iso: now.toISOString(),
      local: now.toLocaleString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  },
};

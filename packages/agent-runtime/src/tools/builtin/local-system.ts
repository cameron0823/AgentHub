import os from "node:os";
import { z } from "zod";
import { ToolDefinition } from "../registry";

export const localSystemTool: ToolDefinition = {
  name: "local_system",
  description: "Report desktop-only local system capabilities. This surface does not execute commands.",
  parameters: z.object({
    action: z
      .enum(["capabilities"])
      .default("capabilities")
      .describe("Only capabilities inspection is currently supported."),
  }),
  execute: async (_args, context) => {
    if (context?.desktopRuntime !== true && process.env.AGENTHUB_DESKTOP_RUNTIME !== "true") {
      throw new Error("local_system is desktop-only and requires AGENTHUB_DESKTOP_RUNTIME=true.");
    }
    return {
      capabilities: ["desktop-runtime", "local-status"],
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      cpus: os.cpus().length,
      memoryBytes: os.totalmem(),
    };
  },
};

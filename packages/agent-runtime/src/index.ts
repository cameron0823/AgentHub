export * from "./types";
export * from "./tools/registry";
export * from "./tools/builtin/calculator";
export * from "./tools/builtin/datetime";
export * from "./tools/builtin/read-file";
export * from "./tools/builtin/webSearch";
export * from "./runtime";
export * from "./orchestrators";
export * from "./mcp/client";

import { globalToolRegistry } from "./tools/registry";
import { calculator } from "./tools/builtin/calculator";
import { datetime } from "./tools/builtin/datetime";
import { readFileTool } from "./tools/builtin/read-file";
import { webSearch } from "./tools/builtin/webSearch";

// Register default tools
globalToolRegistry.register(calculator);
globalToolRegistry.register(datetime);
globalToolRegistry.register(readFileTool);
globalToolRegistry.register(webSearch);

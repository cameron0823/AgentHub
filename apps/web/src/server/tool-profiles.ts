export const TOOL_PROFILE_IDS = ["minimal", "research", "coding", "messaging", "admin", "full"] as const;

export type ToolProfile = (typeof TOOL_PROFILE_IDS)[number];

const BUILTIN_TOOL_IDS = [
  "calculator",
  "datetime",
  "read_file",
  "web_search",
  "web_fetch",
  "github_repo",
  "execute_code",
  "generate_image",
  "visual_understanding",
  "local_system",
] as const;

type BuiltinToolId = (typeof BUILTIN_TOOL_IDS)[number];

interface ToolProfileDefinition {
  id: ToolProfile;
  label: string;
  description: string;
  allowedTools: BuiltinToolId[];
  allowExtraTools: boolean;
}

export const TOOL_PROFILES: Record<ToolProfile, ToolProfileDefinition> = {
  minimal: {
    id: "minimal",
    label: "Minimal",
    description: "Only low-risk local utility tools.",
    allowedTools: ["calculator", "datetime"],
    allowExtraTools: false,
  },
  research: {
    id: "research",
    label: "Research",
    description: "Web research and read-only source collection.",
    allowedTools: ["calculator", "datetime", "web_search", "web_fetch", "generate_image", "visual_understanding"],
    allowExtraTools: false,
  },
  coding: {
    id: "coding",
    label: "Coding",
    description: "Code-oriented tools, GitHub reads, governed sandbox execution, skills, and MCP.",
    allowedTools: [
      "calculator",
      "datetime",
      "read_file",
      "web_search",
      "web_fetch",
      "github_repo",
      "execute_code",
      "generate_image",
      "visual_understanding",
    ],
    allowExtraTools: true,
  },
  messaging: {
    id: "messaging",
    label: "Messaging",
    description: "Conservative communication tools without filesystem or code execution.",
    allowedTools: ["calculator", "datetime", "web_fetch"],
    allowExtraTools: false,
  },
  admin: {
    id: "admin",
    label: "Admin",
    description: "Administrative profile with all built-ins and governed extension tools.",
    allowedTools: [...BUILTIN_TOOL_IDS],
    allowExtraTools: true,
  },
  full: {
    id: "full",
    label: "Full",
    description: "Expose every selected built-in plus configured MCP and skill tools.",
    allowedTools: [...BUILTIN_TOOL_IDS],
    allowExtraTools: true,
  },
};

export interface CompiledToolProfile {
  profile: ToolProfile;
  allowedTools: string[];
  deniedTools: string[];
  allowExtraTools: boolean;
  removedTools: string[];
}

function normalizeProfile(profile: string | null | undefined): ToolProfile {
  return TOOL_PROFILE_IDS.includes(profile as ToolProfile) ? (profile as ToolProfile) : "minimal";
}

function uniqueStrings(values: unknown): string[] {
  return Array.isArray(values)
    ? [
        ...new Set(
          values
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            .map((value) => value.trim()),
        ),
      ]
    : [];
}

function isDeniedByList(toolName: string, deniedTools: string[]) {
  return (
    deniedTools.includes(toolName) ||
    (toolName.startsWith("skill:") && deniedTools.includes("skill:*")) ||
    (toolName.startsWith("mcp:") && deniedTools.includes("mcp:*")) ||
    (toolName.startsWith("openapi_") && deniedTools.includes("openapi:*"))
  );
}

export function compileToolProfile(input: {
  selectedTools: string[];
  profile?: string | null;
  deniedTools?: string[];
}): CompiledToolProfile {
  const profile = normalizeProfile(input.profile);
  const definition = TOOL_PROFILES[profile];
  const deniedTools = uniqueStrings(input.deniedTools);
  const allowedByProfile = new Set<string>(definition.allowedTools);
  const allowedTools = uniqueStrings(input.selectedTools).filter((toolName) => {
    if (isDeniedByList(toolName, deniedTools)) return false;
    if (allowedByProfile.has(toolName)) return true;
    if (
      definition.allowExtraTools &&
      (toolName.startsWith("skill:") || toolName.startsWith("mcp:") || toolName.startsWith("openapi_"))
    )
      return true;
    return false;
  });

  return {
    profile,
    allowedTools,
    deniedTools,
    allowExtraTools: definition.allowExtraTools,
    removedTools: uniqueStrings(input.selectedTools).filter((toolName) => !allowedTools.includes(toolName)),
  };
}

export function isToolAllowedByProfile(toolName: string, access: CompiledToolProfile) {
  if (isDeniedByList(toolName, access.deniedTools)) return false;
  if (access.allowedTools.includes(toolName)) return true;
  if ((TOOL_PROFILES[access.profile].allowedTools as readonly string[]).includes(toolName)) return true;
  if (!access.allowExtraTools) return false;
  if (
    toolName === "run_skill" ||
    toolName === "read_skill_reference" ||
    toolName === "exec_skill_script" ||
    toolName === "export_skill_file"
  ) {
    return access.allowedTools.some((tool) => tool.startsWith("skill:"));
  }
  return true;
}

import type { ExtraTool } from "@agenthub/agent-runtime";
import { parseSkillPackage, type SkillPackage } from "./schema";

export interface SkillRuntimeResource {
  skillId: string;
  path: string;
  type: "reference" | "script" | "template" | "asset";
  content: string;
  mimeType?: string | null;
  metadata?: unknown;
}

export interface InstalledSkillRuntimeRecord {
  id: string;
  slug: string;
  name: string;
  skillMarkdown: string;
  package: SkillPackage;
  resources: SkillRuntimeResource[];
}

export interface SkillRuntimePolicy {
  allowScriptExecution?: boolean;
}

type SkillRow = {
  id: string;
  slug: string;
  name: string;
  skillMarkdown: string;
  manifest: unknown;
};

type SkillResourceRow = {
  skillId: string;
  path: string;
  type: string;
  content: string;
  mimeType?: string | null;
  metadata?: unknown;
};

function normalizePath(path: string) {
  const normalized = path.trim().replace(/\\/g, "/").replace(/\/+/g, "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error("Path cannot escape the skill package.");
  }
  return normalized;
}

function hasOperation(pkg: SkillPackage, operation: "runSkill" | "readReference" | "execScript" | "exportFile") {
  return pkg.permissions.operations.includes(operation);
}

export function createSkillRuntimeRecords(
  skillRows: SkillRow[],
  resourceRows: SkillResourceRow[],
): InstalledSkillRuntimeRecord[] {
  return skillRows.map((row) => {
    const pkg = parseSkillPackage(row.manifest);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      skillMarkdown: row.skillMarkdown,
      package: pkg,
      resources: resourceRows
        .filter((resource) => resource.skillId === row.id)
        .map((resource) => ({
          skillId: resource.skillId,
          path: normalizePath(resource.path),
          type: resource.type as SkillRuntimeResource["type"],
          content: resource.content,
          mimeType: resource.mimeType,
          metadata: resource.metadata,
        })),
    };
  });
}

export class SkillRuntime {
  constructor(
    private skills: InstalledSkillRuntimeRecord[],
    private policy: SkillRuntimePolicy = {},
  ) {}

  private findSkill(slug: string) {
    const skill = this.skills.find((candidate) => candidate.slug === slug);
    if (!skill) throw new Error(`Installed skill not found: ${slug}`);
    return skill;
  }

  async runSkill(input: { slug: string; task?: string }) {
    const skill = this.findSkill(input.slug);
    if (!hasOperation(skill.package, "runSkill")) {
      return { error: "Skill does not grant runSkill permission." };
    }
    return {
      slug: skill.slug,
      name: skill.name,
      task: input.task ?? "",
      instructions: skill.skillMarkdown,
      references: skill.resources
        .filter((resource) => resource.type === "reference")
        .map((resource) => ({ path: resource.path, description: resource.metadata })),
      availableOperations: skill.package.permissions.operations,
    };
  }

  async readReference(input: { slug: string; path: string }) {
    const skill = this.findSkill(input.slug);
    if (!hasOperation(skill.package, "readReference")) {
      return { error: "Skill does not grant readReference permission." };
    }
    const path = normalizePath(input.path);
    const resource = skill.resources.find((candidate) => candidate.path === path && candidate.type === "reference");
    if (!resource) {
      return { error: "Reference not found or not permitted." };
    }
    return {
      slug: skill.slug,
      path: resource.path,
      mimeType: resource.mimeType ?? "text/markdown",
      content: resource.content,
    };
  }

  async execScript(input: { slug: string; scriptName: string; args?: Record<string, unknown> }) {
    const skill = this.findSkill(input.slug);
    const script = skill.package.scripts.find((candidate) => candidate.name === input.scriptName);
    if (!script) return { error: "Script not found or not permitted." };
    if (
      !hasOperation(skill.package, "execScript") ||
      skill.package.permissions.scriptExecution !== "sandboxed" ||
      !this.policy.allowScriptExecution
    ) {
      return {
        status: "blocked",
        error: "Script execution is disabled by policy.",
        scriptName: input.scriptName,
      };
    }
    return {
      status: "blocked",
      error: "Script execution requires a configured sandbox runner.",
      scriptName: script.name,
      args: input.args ?? {},
    };
  }

  async exportFile(input: { slug: string; path: string }) {
    const skill = this.findSkill(input.slug);
    if (!hasOperation(skill.package, "exportFile")) {
      return { error: "Skill does not grant exportFile permission." };
    }
    const path = normalizePath(input.path);
    const resource = skill.resources.find((candidate) => candidate.path === path);
    if (!resource) return { error: "File not found or not permitted." };
    return {
      slug: skill.slug,
      path: resource.path,
      mimeType: resource.mimeType ?? "text/plain",
      content: resource.content,
    };
  }
}

export function createSkillRuntimeTools(
  skills: InstalledSkillRuntimeRecord[],
  policy: SkillRuntimePolicy = {},
): ExtraTool[] {
  const runtime = new SkillRuntime(skills, policy);
  const skillList = skills.map((skill) => `${skill.slug} (${skill.name})`).join(", ");

  return [
    {
      name: "run_skill",
      description: `Activate an installed AgentHub skill. Available skills: ${skillList || "none"}.`,
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Installed skill slug." },
          task: { type: "string", description: "User task to apply the skill to." },
        },
        required: ["slug"],
      },
      execute: (args) =>
        runtime.runSkill({ slug: String(args.slug ?? ""), task: args.task ? String(args.task) : undefined }),
    },
    {
      name: "read_skill_reference",
      description: "Read a bundled reference file from an installed skill package.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Installed skill slug." },
          path: { type: "string", description: "Reference path inside the skill package." },
        },
        required: ["slug", "path"],
      },
      execute: (args) => runtime.readReference({ slug: String(args.slug ?? ""), path: String(args.path ?? "") }),
    },
    {
      name: "exec_skill_script",
      description: "Request execution of a bundled skill script through the configured sandbox policy.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Installed skill slug." },
          scriptName: { type: "string", description: "Script name declared by the skill." },
          args: { type: "object", description: "Structured script arguments." },
        },
        required: ["slug", "scriptName"],
      },
      execute: (args) =>
        runtime.execScript({
          slug: String(args.slug ?? ""),
          scriptName: String(args.scriptName ?? ""),
          args: typeof args.args === "object" && args.args !== null ? (args.args as Record<string, unknown>) : {},
        }),
    },
    {
      name: "export_skill_file",
      description: "Export a bundled skill resource or template as text without exposing unrelated files.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Installed skill slug." },
          path: { type: "string", description: "Package path to export." },
        },
        required: ["slug", "path"],
      },
      execute: (args) => runtime.exportFile({ slug: String(args.slug ?? ""), path: String(args.path ?? "") }),
    },
  ];
}

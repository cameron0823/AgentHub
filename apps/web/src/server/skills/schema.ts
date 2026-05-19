import { z } from "zod";

export const SKILL_PACKAGE_SCHEMA_VERSION = "agenthub.skill.v1" as const;

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase kebab-case slug.");
const skillPathSchema = z
  .string()
  .trim()
  .min(1)
  .superRefine((value, ctx) => {
    if (
      value.startsWith("/") ||
      value.startsWith("\\") ||
      /^[a-zA-Z]:/.test(value) ||
      value.split(/[\\/]+/).includes("..")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Path cannot escape the skill package.",
      });
    }
  });

const operationSchema = z.enum(["runSkill", "readReference", "execScript", "exportFile"]);

export const skillPermissionsSchema = z
  .object({
    operations: z.array(operationSchema).default(["runSkill", "readReference"]),
    allowNetwork: z.boolean().default(false),
    allowFileSystem: z.boolean().default(false),
    scriptExecution: z.enum(["disabled", "sandboxed"]).default("disabled"),
  })
  .strict();

export const skillMetadataSchema = z
  .object({
    slug: slugSchema,
    name: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    author: z.string().trim().min(1).optional(),
    license: z.string().trim().min(1).optional(),
    version: z.string().trim().min(1).default("1.0.0"),
    sourceUrl: z.string().trim().url().optional(),
    tags: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

export const skillResourceSchema = z
  .object({
    path: skillPathSchema,
    type: z.enum(["reference", "script", "template", "asset"]).default("reference"),
    content: z.string().default(""),
    mimeType: z.string().trim().min(1).default("text/markdown"),
    description: z.string().trim().min(1).optional(),
  })
  .strict();

export const skillScriptSchema = z
  .object({
    name: slugSchema,
    description: z.string().trim().min(1).optional(),
    runtime: z.enum(["javascript", "shell"]).default("javascript"),
    entrypoint: skillPathSchema,
    content: z.string().default(""),
  })
  .strict();

export const skillTemplateSchema = z
  .object({
    name: slugSchema,
    path: skillPathSchema,
    content: z.string().default(""),
    mimeType: z.string().trim().min(1).default("text/markdown"),
  })
  .strict();

export const skillPackageSchema = z
  .object({
    schemaVersion: z.literal(SKILL_PACKAGE_SCHEMA_VERSION),
    metadata: skillMetadataSchema,
    skillMarkdown: z.string().trim().min(1, "Package must include SKILL.md content."),
    resources: z.array(skillResourceSchema).default([]),
    scripts: z.array(skillScriptSchema).default([]),
    templates: z.array(skillTemplateSchema).default([]),
    permissions: skillPermissionsSchema.default({}),
  })
  .strict()
  .superRefine((pkg, ctx) => {
    const seen = new Set<string>();
    const paths = [
      ...pkg.resources.map((resource) => resource.path),
      ...pkg.scripts.map((script) => script.entrypoint),
      ...pkg.templates.map((template) => template.path),
    ];

    for (const path of paths) {
      if (seen.has(path)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resources"],
          message: `Duplicate package path: ${path}`,
        });
      }
      seen.add(path);
    }
  });

export type SkillPackage = z.infer<typeof skillPackageSchema>;
export type SkillPackageSummary = {
  schemaVersion: typeof SKILL_PACKAGE_SCHEMA_VERSION;
  slug: string;
  name: string;
  description?: string;
  author?: string;
  license?: string;
  version: string;
  sourceUrl?: string;
  tags: string[];
  permissionOperations: string[];
  allowNetwork: boolean;
  allowFileSystem: boolean;
  scriptExecution: "disabled" | "sandboxed";
  resourceCount: number;
  scriptCount: number;
  templateCount: number;
  enabledToolId: string;
};

export function parseSkillPackage(input: unknown): SkillPackage {
  return skillPackageSchema.parse(input);
}

export function summarizeSkillPackage(pkg: SkillPackage): SkillPackageSummary {
  return {
    schemaVersion: pkg.schemaVersion,
    slug: pkg.metadata.slug,
    name: pkg.metadata.name,
    description: pkg.metadata.description,
    author: pkg.metadata.author,
    license: pkg.metadata.license,
    version: pkg.metadata.version,
    sourceUrl: pkg.metadata.sourceUrl,
    tags: pkg.metadata.tags,
    permissionOperations: pkg.permissions.operations,
    allowNetwork: pkg.permissions.allowNetwork,
    allowFileSystem: pkg.permissions.allowFileSystem,
    scriptExecution: pkg.permissions.scriptExecution,
    resourceCount: pkg.resources.length,
    scriptCount: pkg.scripts.length,
    templateCount: pkg.templates.length,
    enabledToolId: `skill:${pkg.metadata.slug}`,
  };
}

export const bundledSkillCatalog: SkillPackage[] = [
  {
    schemaVersion: SKILL_PACKAGE_SCHEMA_VERSION,
    metadata: {
      slug: "research-brief-skill",
      name: "Research Brief Skill",
      description: "Turns notes and bundled reference guidance into a concise research brief.",
      author: "AgentHub",
      license: "MIT",
      version: "1.0.0",
      tags: ["research", "writing", "references"],
    },
    skillMarkdown: [
      "# Research Brief Skill",
      "",
      "Use this skill when the user needs a concise, source-grounded brief.",
      "Read the bundled reference before drafting. Keep findings, risks, and next steps separate.",
    ].join("\n"),
    resources: [
      {
        path: "references/brief-format.md",
        type: "reference",
        description: "Preferred brief structure.",
        content: [
          "# Brief Format",
          "",
          "Use sections: Objective, Key Findings, Evidence Notes, Risks, Next Steps.",
          "Keep each finding concrete and tied to supplied context.",
        ].join("\n"),
      },
    ],
    scripts: [
      {
        name: "outline",
        description: "Creates a brief outline when a sandbox runner is configured.",
        runtime: "javascript",
        entrypoint: "scripts/outline.js",
        content: "export default function outline(input) { return input; }",
      },
    ],
    templates: [
      {
        name: "brief",
        path: "templates/research-brief.md",
        content: "# Objective\n\n# Key Findings\n\n# Evidence Notes\n\n# Risks\n\n# Next Steps\n",
      },
    ],
    permissions: {
      operations: ["runSkill", "readReference", "exportFile"],
      allowNetwork: false,
      allowFileSystem: false,
      scriptExecution: "disabled",
    },
  },
  {
    schemaVersion: SKILL_PACKAGE_SCHEMA_VERSION,
    metadata: {
      slug: "code-review-skill",
      name: "Code Review Skill",
      description: "Reviews pasted diffs for correctness, regressions, missing tests, and unsafe assumptions.",
      author: "AgentHub",
      license: "MIT",
      version: "1.0.0",
      tags: ["development", "review", "quality"],
    },
    skillMarkdown: [
      "# Code Review Skill",
      "",
      "Lead with findings ordered by severity. Cite the exact file or snippet when available.",
      "Keep summaries brief and call out missing verification separately.",
    ].join("\n"),
    resources: [
      {
        path: "references/review-checklist.md",
        type: "reference",
        content: "- Correctness\n- Regressions\n- Security\n- Missing tests\n- Operational risk\n",
      },
    ],
    templates: [
      {
        name: "review",
        path: "templates/review.md",
        content: "## Findings\n\n## Open Questions\n\n## Verification\n",
      },
    ],
    scripts: [],
    permissions: {
      operations: ["runSkill", "readReference", "exportFile"],
      allowNetwork: false,
      allowFileSystem: false,
      scriptExecution: "disabled",
    },
  },
].map((pkg) => skillPackageSchema.parse(pkg));

export function getBundledSkillCatalog() {
  return bundledSkillCatalog.map((pkg) => ({
    summary: summarizeSkillPackage(pkg),
    package: pkg,
    source: "local" as const,
  }));
}

export function findBundledSkillPackage(slug: string) {
  return bundledSkillCatalog.find((pkg) => pkg.metadata.slug === slug) || null;
}

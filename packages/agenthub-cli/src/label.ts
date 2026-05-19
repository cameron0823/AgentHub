import { readFile, writeFile } from "node:fs/promises";

export interface LabelDefinition {
  name: string;
  color: string;
  description?: string;
}

export interface ParsedLabelArgs {
  source: string;
  target?: string;
  targetFile?: string;
  dryRun: boolean;
}

export interface LabelSyncPlan {
  create: LabelDefinition[];
  update: LabelDefinition[];
  keep: LabelDefinition[];
}

export function parseLabelArgs(argv: string[]): ParsedLabelArgs {
  const parsed: ParsedLabelArgs = {
    source: "",
    dryRun: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
      index += 1;
      return value;
    };

    switch (token) {
      case "--source":
        parsed.source = next();
        break;
      case "--target":
        parsed.target = next();
        break;
      case "--target-file":
        parsed.targetFile = next();
        break;
      case "--write":
        parsed.dryRun = false;
        break;
      default:
        throw new Error(`Unknown label option: ${token}`);
    }
  }

  if (!parsed.source) throw new Error("Missing --source <file>.");
  if (!parsed.target && !parsed.targetFile) throw new Error("Missing --target <owner/repo> or --target-file <file>.");
  return parsed;
}

function normalizeColor(color: string) {
  return color.replace(/^#/, "").toLowerCase();
}

function normalizeLabel(label: LabelDefinition): LabelDefinition {
  return {
    name: label.name.trim(),
    color: normalizeColor(label.color),
    description: label.description?.trim() || undefined,
  };
}

function parseLabelPayload(raw: string, label: string): LabelDefinition[] {
  const parsed = JSON.parse(raw) as unknown;
  const labels = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        "labels" in parsed &&
        Array.isArray((parsed as { labels: unknown }).labels)
      ? (parsed as { labels: unknown[] }).labels
      : undefined;

  if (!labels) throw new Error(`${label} must be a JSON array or an object with a labels array.`);
  return labels
    .map((item) => {
      if (!item || typeof item !== "object") throw new Error(`${label} contains a non-object label.`);
      const record = item as Record<string, unknown>;
      if (typeof record.name !== "string" || typeof record.color !== "string") {
        throw new Error(`${label} labels require string name and color fields.`);
      }
      return normalizeLabel({
        name: record.name,
        color: record.color,
        description: typeof record.description === "string" ? record.description : undefined,
      });
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function readLabelSource(path: string): Promise<LabelDefinition[]> {
  return parseLabelPayload(await readFile(path, "utf8"), path);
}

async function readTargetFile(path: string): Promise<LabelDefinition[]> {
  try {
    return parseLabelPayload(await readFile(path, "utf8"), path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function planLabelSync(source: LabelDefinition[], target: LabelDefinition[]): LabelSyncPlan {
  const targetByName = new Map(target.map((label) => [label.name, label]));
  const create: LabelDefinition[] = [];
  const update: LabelDefinition[] = [];
  const keep: LabelDefinition[] = [];

  for (const label of source) {
    const existing = targetByName.get(label.name);
    if (!existing) {
      create.push(label);
      continue;
    }

    if (existing.color !== label.color || (existing.description ?? "") !== (label.description ?? "")) {
      update.push(label);
    } else {
      keep.push(label);
    }
  }

  return { create, update, keep };
}

async function fetchGitHubLabels(target: string, token: string): Promise<LabelDefinition[]> {
  const response = await fetch(`https://api.github.com/repos/${target}/labels?per_page=100`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub label list failed: ${response.status}`);
  const labels = (await response.json()) as Array<{ name: string; color: string; description?: string | null }>;
  return labels.map((label) =>
    normalizeLabel({
      name: label.name,
      color: label.color,
      description: label.description ?? undefined,
    }),
  );
}

async function applyGitHubLabels(target: string, token: string, plan: LabelSyncPlan) {
  for (const label of plan.create) {
    const response = await fetch(`https://api.github.com/repos/${target}/labels`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(label),
    });
    if (!response.ok) throw new Error(`GitHub label create failed for ${label.name}: ${response.status}`);
  }

  for (const label of plan.update) {
    const response = await fetch(`https://api.github.com/repos/${target}/labels/${encodeURIComponent(label.name)}`, {
      method: "PATCH",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ new_name: label.name, color: label.color, description: label.description }),
    });
    if (!response.ok) throw new Error(`GitHub label update failed for ${label.name}: ${response.status}`);
  }
}

export async function runLabelCommand(
  argv: string[],
  io: { stdout?: Pick<NodeJS.WriteStream, "write">; env?: NodeJS.ProcessEnv } = {},
) {
  const stdout = io.stdout ?? process.stdout;
  const env = io.env ?? process.env;
  const parsed = parseLabelArgs(argv);
  const source = await readLabelSource(parsed.source);
  const target = parsed.targetFile
    ? await readTargetFile(parsed.targetFile)
    : await fetchGitHubLabels(parsed.target ?? "", env.AGENTHUB_GITHUB_TOKEN ?? env.GITHUB_TOKEN ?? "");
  const plan = planLabelSync(source, target);

  stdout.write(`Labels: ${plan.create.length} create, ${plan.update.length} update, ${plan.keep.length} unchanged\n`);
  for (const label of plan.create) stdout.write(`  create ${label.name}\n`);
  for (const label of plan.update) stdout.write(`  update ${label.name}\n`);

  if (parsed.dryRun) {
    stdout.write("Dry run: pass --write to sync labels.\n");
    return;
  }

  if (parsed.targetFile) {
    await writeFile(parsed.targetFile, `${JSON.stringify({ labels: source }, null, 2)}\n`);
    return;
  }

  const token = env.AGENTHUB_GITHUB_TOKEN ?? env.GITHUB_TOKEN;
  if (!token) throw new Error("Missing AGENTHUB_GITHUB_TOKEN or GITHUB_TOKEN for GitHub label sync.");
  await applyGitHubLabels(parsed.target ?? "", token, plan);
}

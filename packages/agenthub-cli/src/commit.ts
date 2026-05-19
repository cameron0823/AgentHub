import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ConventionalCommitType = "feat" | "fix" | "docs" | "test" | "build" | "ci" | "refactor" | "chore";

export interface ParsedCommitArgs {
  type?: ConventionalCommitType;
  scope?: string;
  subject?: string;
  body?: string;
  staged: boolean;
  cwd: string;
  dryRun: boolean;
}

export interface GitChangeSummary {
  status: string;
  files: string[];
}

const COMMIT_TYPES = new Set<ConventionalCommitType>([
  "feat",
  "fix",
  "docs",
  "test",
  "build",
  "ci",
  "refactor",
  "chore",
]);

export function parseCommitArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ParsedCommitArgs {
  const parsed: ParsedCommitArgs = {
    staged: false,
    cwd: env.AGENTHUB_REPO_ROOT ?? process.cwd(),
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
      case "--type": {
        const type = next() as ConventionalCommitType;
        if (!COMMIT_TYPES.has(type)) throw new Error(`Unsupported commit type: ${type}`);
        parsed.type = type;
        break;
      }
      case "--scope":
        parsed.scope = next();
        break;
      case "--subject":
        parsed.subject = next();
        break;
      case "--body":
        parsed.body = next();
        break;
      case "--staged":
        parsed.staged = true;
        break;
      case "--cwd":
        parsed.cwd = next();
        break;
      case "--write":
        parsed.dryRun = false;
        break;
      default:
        throw new Error(`Unknown commit option: ${token}`);
    }
  }

  return parsed;
}

async function git(args: string[], cwd: string) {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

export async function collectGitChangeSummary(parsed: ParsedCommitArgs): Promise<GitChangeSummary> {
  const status = await git(["status", "--short"], parsed.cwd);
  const diffArgs = parsed.staged ? ["diff", "--cached", "--name-only"] : ["diff", "--name-only"];
  let files = (await git(diffArgs, parsed.cwd)).split("\n").filter(Boolean);

  if (!parsed.staged && files.length === 0) {
    files = (await git(["diff", "--cached", "--name-only"], parsed.cwd)).split("\n").filter(Boolean);
  }

  if (files.length === 0) {
    files = status
      .split("\n")
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
  }

  return { status, files };
}

function inferType(files: string[]): ConventionalCommitType {
  if (files.length === 0) return "chore";
  if (files.every((file) => file.startsWith("docs/") || file.endsWith(".md"))) return "docs";
  if (files.every((file) => file.includes("test") || file.includes("spec"))) return "test";
  if (files.some((file) => file.includes(".github/") || file.includes("workflow"))) return "ci";
  if (
    files.some(
      (file) => file.includes("package.json") || file.includes("pnpm-lock.yaml") || file.includes("turbo.json"),
    )
  )
    return "build";
  return "feat";
}

function inferScope(files: string[]) {
  const first = files[0] ?? "repo";
  if (first.startsWith("apps/web/")) return "web";
  if (first.startsWith("apps/desktop/")) return "desktop";
  if (first.startsWith("packages/agenthub-cli/")) return "cli";
  if (first.startsWith("packages/agent-runtime/")) return "runtime";
  if (first.startsWith("packages/ai-providers/")) return "providers";
  if (first.startsWith("docs/")) return "docs";
  if (first.startsWith("tests/")) return "tests";
  return first.split("/")[0] || "repo";
}

function inferSubject(files: string[]) {
  const scope = inferScope(files);
  if (files.length === 0) return "update repository";
  if (files.length === 1) return `update ${scope} ${files[0].split("/").pop() ?? "files"}`;
  return `update ${scope} across ${files.length} files`;
}

export function generateCommitMessage(parsed: ParsedCommitArgs, summary: GitChangeSummary) {
  const type = parsed.type ?? inferType(summary.files);
  const scope = parsed.scope ?? inferScope(summary.files);
  const subject = parsed.subject ?? inferSubject(summary.files);
  const header = `${type}${scope ? `(${scope})` : ""}: ${subject}`;
  const bodyLines = [
    parsed.body,
    summary.files.length > 0 ? `Changed files:\n${summary.files.map((file) => `- ${file}`).join("\n")}` : undefined,
  ].filter(Boolean);

  return bodyLines.length > 0 ? `${header}\n\n${bodyLines.join("\n\n")}` : header;
}

export async function runCommitCommand(argv: string[], io: { stdout?: Pick<NodeJS.WriteStream, "write"> } = {}) {
  const stdout = io.stdout ?? process.stdout;
  const parsed = parseCommitArgs(argv);
  const summary = await collectGitChangeSummary(parsed);
  const message = generateCommitMessage(parsed, summary);

  if (parsed.dryRun) {
    stdout.write(`${message}\n\nDry run: pass --write to run git commit.\n`);
    return;
  }

  const [header, ...bodyParts] = message.split("\n\n");
  const gitArgs = ["commit", "-m", header];
  const body = bodyParts.join("\n\n").trim();
  if (body) gitArgs.push("-m", body);
  await git(gitArgs, parsed.cwd);
}

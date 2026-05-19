import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const changelogPath = join(root, "CHANGELOG.md");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = packageJson.version;
const header = `## ${version} - Unreleased`;
const mode = process.argv.includes("--write") ? "write" : "check";

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function recentChanges() {
  const latestTag = git(["describe", "--tags", "--abbrev=0"]);
  const range = latestTag ? [`${latestTag}..HEAD`] : ["HEAD"];
  const log = git(["log", "--pretty=format:%s", ...range]);
  const lines = log
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index, all) => all.indexOf(line) === index)
    .slice(0, 40);
  return lines.length > 0 ? lines : ["Release candidate verification updates."];
}

function nextChangelog() {
  const changes = recentChanges()
    .map((line) => `- ${line}`)
    .join("\n");
  return `# Changelog

All notable AgentHub changes are tracked here. Use \`pnpm changelog:update\` before release work and \`pnpm changelog:check\` in release verification.

${header}

${changes}
`;
}

const existing = readFileSync(changelogPath, "utf8");

if (mode === "check") {
  if (!existing.includes(header)) {
    console.error(`CHANGELOG.md is missing release header: ${header}`);
    process.exit(1);
  }
  process.exit(0);
}

writeFileSync(changelogPath, nextChangelog());

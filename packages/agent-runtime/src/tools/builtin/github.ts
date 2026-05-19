import { z } from "zod";
import { ToolDefinition, type ToolExecutionContext } from "../registry";

type GitHubAction = "repo" | "issues" | "issue" | "pulls" | "pull";

async function githubToken(context?: ToolExecutionContext) {
  const contextToken = await context?.getCredential?.("github_repo");
  if (contextToken) return contextToken;
  return process.env.AGENTHUB_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
}

function assertSafeIdentifier(value: string, label: string) {
  if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error(`${label} contains unsupported characters`);
  }
}

function normalizeGitHubResult(value: unknown) {
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => {
      if (!item || typeof item !== "object") return item;
      const row = item as Record<string, unknown>;
      return {
        number: row.number,
        title: row.title,
        state: row.state,
        url: row.html_url,
        user: row.user && typeof row.user === "object" ? (row.user as { login?: string }).login : undefined,
        updatedAt: row.updated_at,
      };
    });
  }
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  return {
    name: row.full_name ?? row.name,
    description: row.description,
    defaultBranch: row.default_branch,
    private: row.private,
    stars: row.stargazers_count,
    forks: row.forks_count,
    openIssues: row.open_issues_count,
    url: row.html_url,
    title: row.title,
    number: row.number,
    state: row.state,
    user: row.user && typeof row.user === "object" ? (row.user as { login?: string }).login : undefined,
    body: typeof row.body === "string" ? row.body.slice(0, 4000) : undefined,
  };
}

export async function runGitHubRepoTool(
  input: {
    action: GitHubAction;
    owner: string;
    repo: string;
    number?: number;
    state?: "open" | "closed" | "all";
    perPage?: number;
  },
  token?: string | null,
) {
  const resolvedToken = token ?? (await githubToken());
  if (!resolvedToken) {
    throw new Error("Explicit GitHub credential required: set AGENTHUB_GITHUB_TOKEN or GITHUB_TOKEN.");
  }
  assertSafeIdentifier(input.owner, "owner");
  assertSafeIdentifier(input.repo, "repo");

  const baseUrl = `https://api.github.com/repos/${input.owner}/${input.repo}`;
  let url: URL;
  switch (input.action) {
    case "repo":
      url = new URL(baseUrl);
      break;
    case "issues":
      url = new URL(`${baseUrl}/issues`);
      url.searchParams.set("state", input.state ?? "open");
      url.searchParams.set("per_page", String(Math.min(input.perPage ?? 20, 50)));
      break;
    case "issue":
      if (!input.number) throw new Error("Issue number is required");
      url = new URL(`${baseUrl}/issues/${input.number}`);
      break;
    case "pulls":
      url = new URL(`${baseUrl}/pulls`);
      url.searchParams.set("state", input.state ?? "open");
      url.searchParams.set("per_page", String(Math.min(input.perPage ?? 20, 50)));
      break;
    case "pull":
      if (!input.number) throw new Error("Pull request number is required");
      url = new URL(`${baseUrl}/pulls/${input.number}`);
      break;
  }

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${resolvedToken}`,
      "User-Agent": "AgentHub",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);

  return {
    action: input.action,
    owner: input.owner,
    repo: input.repo,
    result: normalizeGitHubResult(await res.json()),
  };
}

export const githubRepoTool: ToolDefinition = {
  name: "github_repo",
  description: "Read GitHub repository metadata, issues, and pull requests using an explicit GitHub credential.",
  parameters: z.object({
    action: z.enum(["repo", "issues", "issue", "pulls", "pull"]).describe("Read-only GitHub operation to perform."),
    owner: z.string().describe("Repository owner or organization."),
    repo: z.string().describe("Repository name."),
    number: z.number().int().positive().optional().describe("Issue or pull request number for single-item reads."),
    state: z.enum(["open", "closed", "all"]).optional().describe("State filter for list operations."),
    perPage: z.number().int().min(1).max(50).optional().describe("Maximum list size."),
  }),
  execute: async (args, context) => runGitHubRepoTool(args, await githubToken(context)),
};

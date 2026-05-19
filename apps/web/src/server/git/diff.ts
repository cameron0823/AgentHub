import { spawn } from "node:child_process";
import path from "node:path";
import { realpath } from "node:fs/promises";

export type ReviewFileStatus = "modified" | "added" | "deleted" | "renamed" | "binary";

export interface ReviewDiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface ReviewDiffFile {
  path: string;
  oldPath: string | null;
  status: ReviewFileStatus;
  additions: number;
  deletions: number;
  isBinary: boolean;
  hunks: ReviewDiffHunk[];
}

export interface ReviewFileTreeNode {
  name: string;
  path: string;
  type: "directory" | "file";
  status?: ReviewFileStatus;
  additions?: number;
  deletions?: number;
  children?: ReviewFileTreeNode[];
}

export interface ReviewDiffResult {
  repoPath: string;
  branch: string | null;
  files: ReviewDiffFile[];
  tree: ReviewFileTreeNode[];
  totalFiles: number;
  nextCursor: number | null;
}

function configuredRoots() {
  return (process.env.AGENTHUB_REVIEW_REPO_ROOTS ?? "")
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getReviewCapabilities() {
  const roots = configuredRoots();
  return {
    enabled: roots.length > 0,
    mountRootsConfigured: roots.length,
    message:
      roots.length > 0
        ? "Server-side repo mount roots are configured."
        : "Review requires AGENTHUB_REVIEW_REPO_ROOTS before local git access is enabled.",
  };
}

function isInsideRoot(root: string, candidate: string) {
  const relativePath = path.relative(root, candidate);
  return relativePath === "" || (!!relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

async function runGitRaw(cwd: string, args: string[], maxBytes = 10 * 1024 * 1024) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      shell: false,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("git command timed out"));
    }, 15000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > maxBytes) {
        child.kill("SIGTERM");
        reject(new Error("git output exceeded review size limit"));
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `git exited with code ${code}`));
    });
  });
}

export async function validateReviewRepository(repoPath: string) {
  const roots = configuredRoots();
  if (roots.length === 0) {
    throw new Error("Review requires AGENTHUB_REVIEW_REPO_ROOTS server-side repo mount configuration");
  }

  const candidate = await realpath(path.resolve(repoPath));
  const allowedRoots = await Promise.all(
    roots.map(async (root) => {
      try {
        return await realpath(path.resolve(root));
      } catch {
        return null;
      }
    }),
  );

  if (!allowedRoots.some((root) => root && isInsideRoot(root, candidate))) {
    throw new Error("Review repo is outside configured mount roots");
  }

  const topLevel = (await runGitRaw(candidate, ["rev-parse", "--show-toplevel"], 1024 * 1024)).trim();
  const canonicalTopLevel = await realpath(topLevel);
  if (!allowedRoots.some((root) => root && isInsideRoot(root, canonicalTopLevel))) {
    throw new Error("Review repo is outside configured mount roots");
  }

  return canonicalTopLevel;
}

function parseHunkHeader(header: string) {
  const match = header.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  return {
    oldStart: match ? Number(match[1]) : 0,
    oldLines: match?.[2] ? Number(match[2]) : 1,
    newStart: match ? Number(match[3]) : 0,
    newLines: match?.[4] ? Number(match[4]) : 1,
  };
}

function pathFromGitToken(token: string) {
  if (token === "/dev/null") return token;
  return token.replace(/^a\//, "").replace(/^b\//, "");
}

export function parseGitDiff(diffText: string) {
  const files: ReviewDiffFile[] = [];
  let current: ReviewDiffFile | null = null;
  let currentHunk: ReviewDiffHunk | null = null;

  for (const line of diffText.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const [, oldToken = "", newToken = ""] = line.match(/^diff --git\s+(.+?)\s+(.+)$/) ?? [];
      current = {
        path: pathFromGitToken(newToken),
        oldPath: pathFromGitToken(oldToken),
        status: "modified",
        additions: 0,
        deletions: 0,
        isBinary: false,
        hunks: [],
      };
      currentHunk = null;
      files.push(current);
      continue;
    }
    if (!current) continue;

    if (line.startsWith("new file mode")) current.status = "added";
    if (line.startsWith("deleted file mode")) current.status = "deleted";
    if (line.startsWith("rename from ")) {
      current.status = "renamed";
      current.oldPath = line.slice("rename from ".length);
    }
    if (line.startsWith("rename to ")) {
      current.status = "renamed";
      current.path = line.slice("rename to ".length);
    }
    if (line.startsWith("Binary files ")) {
      current.status = "binary";
      current.isBinary = true;
    }
    if (line.startsWith("+++ ")) current.path = pathFromGitToken(line.slice(4).trim());
    if (line.startsWith("--- ")) current.oldPath = pathFromGitToken(line.slice(4).trim());
    if (line.startsWith("@@")) {
      const parsed = parseHunkHeader(line);
      currentHunk = { header: line, ...parsed, lines: [] };
      current.hunks.push(currentHunk);
      continue;
    }
    if (!currentHunk) continue;
    currentHunk.lines.push(line);
    if (line.startsWith("+") && !line.startsWith("+++")) current.additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) current.deletions += 1;
  }

  return files.filter((file) => file.path && file.path !== "/dev/null");
}

export function buildFileTree(files: ReviewDiffFile[]) {
  const root: ReviewFileTreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let level = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      let node = level.find((entry) => entry.name === part);
      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "directory",
          ...(isFile
            ? { status: file.status, additions: file.additions, deletions: file.deletions }
            : { children: [] }),
        };
        level.push(node);
      }
      if (!isFile) level = node.children ?? [];
    });
  }

  return root.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

function filterFiles(files: ReviewDiffFile[], filter?: string, status?: ReviewFileStatus) {
  return files.filter((file) => {
    if (status && file.status !== status) return false;
    if (filter && !file.path.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });
}

export async function getRepositorySummary(repoPath: string) {
  const canonicalRepo = await validateReviewRepository(repoPath);
  const branch = (await runGitRaw(canonicalRepo, ["rev-parse", "--abbrev-ref", "HEAD"], 1024 * 1024)).trim();
  const status = await runGitRaw(canonicalRepo, ["status", "--porcelain=v1"], 1024 * 1024);
  return {
    repoPath: canonicalRepo,
    branch: branch || null,
    dirtyFiles: status.split("\n").filter(Boolean).length,
  };
}

export async function listRepositoryDiff(input: {
  repoPath: string;
  cursor?: number;
  limit?: number;
  filter?: string;
  status?: ReviewFileStatus;
  paths?: string[];
}): Promise<ReviewDiffResult> {
  const canonicalRepo = await validateReviewRepository(input.repoPath);
  const branch = (await runGitRaw(canonicalRepo, ["rev-parse", "--abbrev-ref", "HEAD"], 1024 * 1024)).trim() || null;
  const diffText = await runGitRaw(canonicalRepo, ["diff", "--no-ext-diff", "--", ...(input.paths ?? [])]);
  const filtered = filterFiles(parseGitDiff(diffText), input.filter, input.status);
  const totalFiles = filtered.length;
  const start = input.cursor ?? 0;
  const limit = input.limit ?? 50;
  const files = filtered.slice(start, start + limit);
  const nextCursor = start + limit < totalFiles ? start + limit : null;

  return {
    repoPath: canonicalRepo,
    branch,
    files,
    tree: buildFileTree(filtered),
    totalFiles,
    nextCursor,
  };
}

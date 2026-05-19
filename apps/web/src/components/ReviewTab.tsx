"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { GitBranch, Loader2, Search } from "lucide-react";

type ReviewStatusFilter = "all" | "modified" | "added" | "deleted" | "renamed" | "binary";

type ReviewFile = {
  path: string;
  oldPath: string | null;
  status: Exclude<ReviewStatusFilter, "all">;
  additions: number;
  deletions: number;
  isBinary: boolean;
  hunks: Array<{ header: string; lines: string[] }>;
};

type ReviewTreeNode = {
  name: string;
  path: string;
  type: "directory" | "file";
  children?: ReviewTreeNode[];
};

function TreeNode({
  node,
  selectedPath,
  onSelect,
}: {
  node: ReviewTreeNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  if (node.type === "directory") {
    return (
      <li>
        <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{node.name}</div>
        <ul className="ml-3 border-l border-white/10 pl-2">
          {(node.children ?? []).map((child) => (
            <TreeNode key={child.path} node={child} selectedPath={selectedPath} onSelect={onSelect} />
          ))}
        </ul>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={`w-full truncate rounded-lg px-2 py-1 text-left text-xs hover:bg-white/10 ${
          selectedPath === node.path ? "bg-white/15 text-foreground" : "text-muted-foreground"
        }`}
      >
        {node.name}
      </button>
    </li>
  );
}

export function ReviewTab() {
  const utils = trpc.useUtils();
  const [repoPath, setRepoPath] = useState("");
  const [registeredRepo, setRegisteredRepo] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<ReviewStatusFilter>("all");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [extraFiles, setExtraFiles] = useState<ReviewFile[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);

  const capabilities = trpc.review.capabilities.useQuery();
  const registerRepository = trpc.review.registerRepository.useMutation({
    onSuccess: (repo) => {
      setRegisteredRepo(repo.repoPath);
      setRepoPath(repo.repoPath);
      setSelectedPath(null);
      setExtraFiles([]);
      setNextCursor(null);
    },
  });

  const statusInput = status === "all" ? undefined : status;
  const diffInput = registeredRepo
    ? {
        repoPath: registeredRepo,
        limit: 75,
        filter: filter.trim() || undefined,
        status: statusInput,
      }
    : undefined;

  const diffQuery = trpc.review.diff.useQuery(diffInput!, { enabled: !!diffInput });

  useEffect(() => {
    setExtraFiles([]);
    setNextCursor(diffQuery.data?.nextCursor ?? null);
    setSelectedPath((current) => current ?? diffQuery.data?.files[0]?.path ?? null);
  }, [diffQuery.data?.nextCursor, diffQuery.data?.files, filter, status]);

  const files = useMemo(
    () => [...((diffQuery.data?.files ?? []) as ReviewFile[]), ...extraFiles],
    [diffQuery.data?.files, extraFiles],
  );
  const visibleFiles = files.slice(0, 200);
  const selectedFile = files.find((file) => file.path === selectedPath) ?? files[0] ?? null;

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!repoPath.trim()) return;
    registerRepository.mutate({ repoPath: repoPath.trim() });
  }

  async function handleLoadMore() {
    if (!registeredRepo || nextCursor == null) return;
    const result = await utils.review.diff.fetch({
      repoPath: registeredRepo,
      cursor: nextCursor,
      limit: 75,
      filter: filter.trim() || undefined,
      status: statusInput,
    });
    setExtraFiles((current) => [...current, ...((result.files ?? []) as ReviewFile[])]);
    setNextCursor(result.nextCursor);
  }

  return (
    <div data-testid="review-tab" className="flex h-full flex-col bg-transparent">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Review</h2>
          <p className="text-xs text-muted-foreground">
            {registeredRepo
              ? `${diffQuery.data?.totalFiles ?? 0} changed files`
              : "Register a mounted git repository to inspect diffs."}
          </p>
        </div>
        <form onSubmit={handleRegister} className="flex min-w-0 flex-1 flex-wrap items-end justify-end gap-2">
          <label className="min-w-[18rem] flex-1 text-xs font-medium text-muted-foreground">
            Repository path
            <input
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="/home/coxar/projects/AgentHub"
              className="mt-1 w-full rounded-xl border px-3 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={registerRepository.isPending || !repoPath.trim()}
            className="agenthub-primary-button inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {registerRepository.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitBranch className="h-4 w-4" />
            )}
            Register repository
          </button>
        </form>
      </div>

      {!capabilities.data?.enabled && (
        <div className="border-b border-yellow-500/20 bg-yellow-500/10 px-6 py-3 text-sm text-yellow-700 dark:text-yellow-300">
          {capabilities.data?.message ?? "Review capability is checking server mount configuration."}
        </div>
      )}
      {(registerRepository.error || diffQuery.error) && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-6 py-3 text-sm text-red-600">
          {registerRepository.error?.message ?? diffQuery.error?.message}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[20rem_1fr]">
        <aside className="flex min-h-0 flex-col border-r border-white/10">
          <div className="space-y-2 border-b border-white/10 p-3">
            <label className="text-xs font-medium text-muted-foreground">
              Filter files
              <div className="mt-1 flex items-center gap-2 rounded-xl border px-2 py-1">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="apps/web"
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                />
              </div>
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ReviewStatusFilter)}
                className="mt-1 w-full rounded-xl border px-2 py-1 text-xs"
              >
                <option value="all">All</option>
                <option value="modified">Modified</option>
                <option value="added">Added</option>
                <option value="deleted">Deleted</option>
                <option value="renamed">Renamed</option>
                <option value="binary">Binary</option>
              </select>
            </label>
          </div>

          <nav aria-label="File tree" className="min-h-0 flex-1 overflow-auto p-3">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">File tree</div>
            {diffQuery.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading diff...
              </div>
            ) : diffQuery.data?.tree?.length ? (
              <ul className="space-y-1">
                {(diffQuery.data.tree as ReviewTreeNode[]).map((node) => (
                  <TreeNode key={node.path} node={node} selectedPath={selectedPath} onSelect={setSelectedPath} />
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No changed files loaded.</p>
            )}
          </nav>

          {nextCursor != null && (
            <button
              type="button"
              onClick={() => void handleLoadMore()}
              className="m-3 rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"
            >
              Load more
            </button>
          )}
        </aside>

        <section className="min-h-0 overflow-auto p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{selectedFile?.path ?? "No file selected"}</h3>
              {selectedFile && (
                <p className="text-xs text-muted-foreground">
                  {selectedFile.status} · +{selectedFile.additions} -{selectedFile.deletions}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Showing {visibleFiles.length} files in the virtualized review list.
            </p>
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {visibleFiles.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedPath(file.path)}
                className={`truncate rounded-xl border px-3 py-2 text-left text-xs ${
                  selectedFile?.path === file.path
                    ? "border-primary bg-primary/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <span className="block truncate font-medium">{file.path}</span>
                <span className="text-muted-foreground">
                  +{file.additions} -{file.deletions}
                </span>
              </button>
            ))}
          </div>

          <div className="agenthub-glass-panel rounded-2xl p-4">
            <h4 className="mb-3 text-sm font-semibold">Hunks</h4>
            {selectedFile?.isBinary ? (
              <p className="text-sm text-muted-foreground">Binary diff preview is not rendered.</p>
            ) : selectedFile?.hunks.length ? (
              <div className="space-y-4">
                {selectedFile.hunks.map((hunk) => (
                  <div key={hunk.header} className="overflow-hidden rounded-xl border border-white/10">
                    <div className="bg-white/10 px-3 py-1 font-mono text-xs text-muted-foreground">{hunk.header}</div>
                    <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap p-3 text-xs leading-5">
                      {hunk.lines.join("\n")}
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No hunks selected.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

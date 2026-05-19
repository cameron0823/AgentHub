"use client";

import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronRight, GitBranch } from "lucide-react";

function branchModeLabel(metadata: unknown) {
  const branchMode =
    metadata && typeof metadata === "object" ? (metadata as { branchMode?: unknown }).branchMode : undefined;
  if (branchMode === "standalone") return "Standalone";
  return "Continuation";
}

type BranchTreeNode = {
  id: string;
  title: string | null;
  branchMode: "root" | "continuation" | "standalone";
  forkedFromMessageId: string | null;
  children: BranchTreeNode[];
};

function branchModeName(mode: BranchTreeNode["branchMode"]) {
  if (mode === "standalone") return "Standalone";
  if (mode === "continuation") return "Continuation";
  return "Root";
}

function flattenTree(node: BranchTreeNode, depth = 0): Array<BranchTreeNode & { depth: number }> {
  return [{ ...node, depth }, ...node.children.flatMap((child) => flattenTree(child, depth + 1))];
}

interface BranchNavigatorProps {
  parentMessageId?: string | null;
  activeSessionId: string;
  onSwitch: (sessionId: string) => void;
}

export function BranchNavigator({ parentMessageId, activeSessionId, onSwitch }: BranchNavigatorProps) {
  const { data: branches } = trpc.sessions.listBranches.useQuery(
    { parentMessageId: parentMessageId || activeSessionId },
    { enabled: Boolean(parentMessageId) },
  );
  const { data: branchTree } = trpc.sessions.branchTree.useQuery(
    { sessionId: activeSessionId },
    { enabled: Boolean(activeSessionId) },
  );

  const hasBranchPager = Boolean(branches?.length);
  const branchTreeRows = branchTree?.tree ? flattenTree(branchTree.tree) : [];
  const hasBranchTree = branchTreeRows.length > 1;

  if (!hasBranchPager && !hasBranchTree) return null;

  const currentIndex = branches?.findIndex((b) => b.id === activeSessionId) ?? -1;
  const display = currentIndex >= 0 ? currentIndex : 0;

  const prev = () => {
    if (branches && display > 0) onSwitch(branches[display - 1].id);
  };
  const next = () => {
    if (branches && display < branches.length - 1) onSwitch(branches[display + 1].id);
  };

  const activeBranch = branches?.[display];

  return (
    <div className="border-b border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-muted-foreground select-none">
      {hasBranchPager && branches ? (
        <div className="mb-2 flex items-center justify-center gap-2">
          <button
            onClick={prev}
            disabled={display === 0}
            className="rounded p-0.5 hover:bg-white/10 disabled:opacity-30"
            aria-label="Previous branch"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <span>
            Branch {display + 1} of {branches.length}
          </span>
          {activeBranch && (
            <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px]">
              {branchModeLabel(activeBranch.metadata)}
            </span>
          )}
          <button
            onClick={next}
            disabled={display === branches.length - 1}
            className="rounded p-0.5 hover:bg-white/10 disabled:opacity-30"
            aria-label="Next branch"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      ) : null}
      {hasBranchTree ? (
        <div
          data-testid="branch-tree-visualization"
          className="mx-auto flex max-w-3xl items-center gap-1 overflow-x-auto pb-0.5"
          aria-label="Conversation branch tree"
        >
          {branchTreeRows.map((node) => {
            const isActive = node.id === activeSessionId;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => onSwitch(node.id)}
                className={`flex min-w-36 items-center gap-2 rounded-md border px-2 py-1.5 text-left transition ${
                  isActive
                    ? "border-sky-300/60 bg-sky-400/15 text-sky-50"
                    : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"
                }`}
                style={{ marginLeft: node.depth ? `${Math.min(node.depth, 4) * 0.75}rem` : undefined }}
                aria-current={isActive ? "page" : undefined}
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{node.title || "Untitled branch"}</span>
                  <span className="block truncate text-[10px] opacity-70">
                    {branchModeName(node.branchMode)}
                    {node.forkedFromMessageId ? ` from ${node.forkedFromMessageId.slice(0, 8)}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

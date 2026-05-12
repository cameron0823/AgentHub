"use client";

import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface BranchNavigatorProps {
  parentMessageId: string;
  activeSessionId: string;
  onSwitch: (sessionId: string) => void;
}

export function BranchNavigator({ parentMessageId, activeSessionId, onSwitch }: BranchNavigatorProps) {
  const { data: branches } = trpc.sessions.listBranches.useQuery({ parentMessageId }, { enabled: !!parentMessageId });

  if (!branches || branches.length <= 1) return null;

  const currentIndex = branches.findIndex(b => b.id === activeSessionId);
  const display = currentIndex >= 0 ? currentIndex : 0;

  const prev = () => {
    if (display > 0) onSwitch(branches[display - 1].id);
  };
  const next = () => {
    if (display < branches.length - 1) onSwitch(branches[display + 1].id);
  };

  return (
    <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground select-none">
      <button
        onClick={prev}
        disabled={display === 0}
        className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
        aria-label="Previous branch"
      >
        <ChevronLeft className="w-3 h-3" />
      </button>
      <span>Branch {display + 1} of {branches.length}</span>
      <button
        onClick={next}
        disabled={display === branches.length - 1}
        className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
        aria-label="Next branch"
      >
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
}

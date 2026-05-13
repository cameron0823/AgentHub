"use client";

interface ContextWindowBarProps {
  usedTokens: number;
  limitTokens: number;
}

export function ContextWindowBar({ usedTokens, limitTokens }: ContextWindowBarProps) {
  const pct = Math.min(100, Math.round((usedTokens / limitTokens) * 100));
  const barColor = pct >= 80 ? "bg-red-500" : pct >= 60 ? "bg-yellow-500" : "bg-green-500";

  return (
    <div className="flex items-center gap-2 px-4 py-1 text-[10px] text-muted-foreground/60 select-none">
      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden" title={`Context: ~${pct}% used`}>
        <div className={`h-full ${barColor} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <span className={pct >= 80 ? "text-red-500" : pct >= 60 ? "text-yellow-500" : ""}>
        ~{usedTokens.toLocaleString()} / {limitTokens.toLocaleString()} ctx
      </span>
    </div>
  );
}

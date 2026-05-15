"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, X, MessageSquare } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useChatStore } from "@/stores/chatStore";

function highlight(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 120);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  const excerpt = (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
  const matchStart = excerpt.toLowerCase().indexOf(query.toLowerCase());
  if (matchStart === -1) return excerpt;
  return (
    <>
      {excerpt.slice(0, matchStart)}
      <mark className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">{excerpt.slice(matchStart, matchStart + query.length)}</mark>
      {excerpt.slice(matchStart + query.length)}
    </>
  );
}

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) { setQuery(""); setDebouncedQuery(""); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const { data: results = [] } = trpc.messages.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length > 0 }
  );

  const setActiveSession = useChatStore((s) => s.setActiveSession);

  const handleSelect = useCallback((sessionId: string, messageId: string) => {
    setActiveSession(sessionId);
    onClose();
    setTimeout(() => {
      const el = document.getElementById(`msg-${messageId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  }, [setActiveSession, onClose]);

  if (!open) return null;

  const grouped = results.reduce<Record<string, typeof results>>((acc, r) => {
    const key = r.sessionId ?? "";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search conversations"
        className="w-full max-w-xl bg-background rounded-xl border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations..."
            className="flex-1 py-3 text-sm bg-transparent outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="p-1 hover:bg-muted rounded text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {debouncedQuery && results.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">No results for &ldquo;{debouncedQuery}&rdquo;</div>
          )}

          {Object.entries(grouped).map(([sessionId, msgs]) => (
            <div key={sessionId}>
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/30 flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" />
                {msgs[0]?.sessionTitle ?? "Conversation"}
              </div>
              {msgs.map((msg) => (
                <button
                  key={msg.messageId}
                  onClick={() => handleSelect(msg.sessionId ?? "", msg.messageId ?? "")}
                  className="w-full text-left px-4 py-3 hover:bg-accent/50 border-b last:border-b-0 transition-colors"
                >
                  <div className="text-xs text-muted-foreground mb-0.5">{msg.role === "user" ? "You" : "Assistant"}</div>
                  <p className="text-sm line-clamp-2">{highlight(msg.content ?? "", debouncedQuery)}</p>
                </button>
              ))}
            </div>
          ))}

          {!debouncedQuery && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Type to search your conversations
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

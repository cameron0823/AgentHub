"use client";

import { useEffect, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import { trpc } from "@/lib/trpc";

const SHORTCUTS = [
  { keys: "Cmd/Ctrl + K", description: "Open search" },
  { keys: "Cmd/Ctrl + N", description: "New conversation" },
  { keys: "Cmd/Ctrl + Enter", description: "Send message" },
  { keys: "Cmd/Ctrl + /", description: "Show this help" },
  { keys: "Escape", description: "Close panel / cancel" },
];

export function KeyboardShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false);
  const { addSession, setMainView } = useChatStore();
  const utils = trpc.useUtils();
  const createSession = trpc.sessions.create.useMutation({
    onSuccess: (session) => {
      addSession({
        id: session.id,
        agentId: session.agentId,
        groupId: session.groupId || null,
        parentMessageId: session.parentMessageId || null,
        title: session.title || "New Chat",
        model: session.model || "ollama:qwen2.5:7b",
        messages: [],
        createdAt: session.createdAt || new Date(),
        updatedAt: session.updatedAt || new Date(),
      });
      void utils.sessions.list.invalidate();
      setMainView("chat");
    },
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === "n") {
        e.preventDefault();
        createSession.mutate({});
      }

      if (mod && e.key === "/") {
        e.preventDefault();
        setHelpOpen((prev) => !prev);
      }

      if (e.key === "Escape" && helpOpen) {
        setHelpOpen(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [helpOpen, createSession, setMainView]);

  if (!helpOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={() => setHelpOpen(false)}
    >
      <div
        className="bg-background rounded-xl border shadow-2xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold mb-4">Keyboard Shortcuts</h2>
        <div className="space-y-2">
          {SHORTCUTS.map(({ keys, description }) => (
            <div key={keys} className="flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">{description}</span>
              <kbd className="px-2 py-0.5 rounded border bg-muted text-xs font-mono">{keys}</kbd>
            </div>
          ))}
        </div>
        <button
          onClick={() => setHelpOpen(false)}
          className="mt-5 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Press Esc or click outside to close
        </button>
      </div>
    </div>
  );
}

"use client";

import { KnowledgeBaseManager } from "@/components/KnowledgeBaseManager";
import { useSession } from "next-auth/react";

export default function KBPage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="agenthub-page flex h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading knowledge base...
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="agenthub-page flex h-screen items-center justify-center">
        <div className="agenthub-glass-panel rounded-2xl px-6 py-5 text-center text-muted-foreground">
          Please sign in to access knowledge bases.
        </div>
      </div>
    );
  }

  return (
    <div className="agenthub-page">
      <div className="agenthub-window mx-auto min-h-[calc(100vh-4rem)] max-w-5xl overflow-hidden">
        <KnowledgeBaseManager />
      </div>
    </div>
  );
}

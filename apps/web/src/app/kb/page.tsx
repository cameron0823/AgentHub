"use client";

import { KnowledgeBaseManager } from "@/components/KnowledgeBaseManager";
import { useSession } from "next-auth/react";

export default function KBPage() {
  const { data: session } = useSession();

  if (!session?.user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Please sign in to access knowledge bases.</p>
      </div>
    );
  }

  return <KnowledgeBaseManager />;
}

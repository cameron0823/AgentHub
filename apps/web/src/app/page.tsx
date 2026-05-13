"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatInterface } from "@/components/ChatInterface";
import { AgentBuilder } from "@/components/AgentBuilder";
import { AgentGroupBuilder } from "@/components/AgentGroupBuilder";
import { MemoryEditor } from "@/components/MemoryEditor";
import { AgentMarketplace } from "@/components/AgentMarketplace";
import { SearchModal } from "@/components/SearchModal";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { useChatStore } from "@/stores/chatStore";
import { LogIn, Loader2 } from "lucide-react";

export default function Home() {
  const { data: session, status } = useSession();
  const mainView = useChatStore((state) => state.mainView);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center max-w-md mx-auto p-8">
          <h1 className="text-3xl font-bold mb-4">AgentHub</h1>
          <p className="text-muted-foreground mb-6">
            The Ultimate Local-First AI Agent Platform. Find, build, and collaborate with agent teammates that grow with you.
          </p>
          <button
            onClick={() => window.location.href = "/api/auth/signin?callbackUrl=/"}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-6 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Sign In with Casdoor
          </button>
          <p className="mt-4 text-xs text-muted-foreground">
            Default login: admin / admin12345
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        {mainView === "marketplace" ? <AgentMarketplace /> :
         mainView === "memory-editor" ? <MemoryEditor /> :
         mainView === "group-builder" ? <AgentGroupBuilder /> :
         mainView === "agent-builder" ? <AgentBuilder /> :
         <ChatInterface />}
      </main>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <KeyboardShortcuts />
    </div>
  );
}

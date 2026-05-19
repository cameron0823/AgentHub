"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatInterface } from "@/components/ChatInterface";
import { AgentBuilder } from "@/components/AgentBuilder";
import { AgentGroupBuilder } from "@/components/AgentGroupBuilder";
import { MemoryEditor } from "@/components/MemoryEditor";
import { AgentMarketplace } from "@/components/AgentMarketplace";
import { TaskManager } from "@/components/TaskManager";
import { ReviewTab } from "@/components/ReviewTab";
import { AdminPanel } from "@/components/AdminPanel";
import { SearchModal } from "@/components/SearchModal";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { DailyBriefPanel } from "@/components/DailyBriefPanel";
import { useChatStore, type MainView } from "@/stores/chatStore";
import {
  Bot,
  Folder,
  Home as HomeIcon,
  ListTodo,
  LogIn,
  Loader2,
  Menu,
  MessageSquare,
  Search,
  Settings,
} from "lucide-react";

function mobileViewLabel(mainView: MainView) {
  if (mainView === "agent-builder") return "Agents";
  if (mainView === "group-builder") return "Groups";
  if (mainView === "memory-editor") return "Memory";
  if (mainView === "marketplace") return "Marketplace";
  if (mainView === "tasks") return "Tasks";
  if (mainView === "review") return "Review";
  if (mainView === "admin") return "Admin";
  return "Chat";
}

function MobileAppBar({
  mainView,
  onOpenSidebar,
  onOpenSearch,
}: {
  mainView: MainView;
  onOpenSidebar: () => void;
  onOpenSearch: () => void;
}) {
  return (
    <header
      data-testid="mobile-app-bar"
      className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 bg-slate-950/55 px-2 backdrop-blur-xl md:hidden"
    >
      <button
        type="button"
        onClick={onOpenSidebar}
        className="agenthub-icon-button"
        aria-label="Open navigation"
        title="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">AgentHub</div>
        <div className="truncate text-[11px] text-slate-300">{mobileViewLabel(mainView)}</div>
      </div>
      <button
        type="button"
        onClick={onOpenSearch}
        className="agenthub-icon-button"
        aria-label="Search conversations"
        title="Search conversations"
      >
        <Search className="h-5 w-5" />
      </button>
    </header>
  );
}

function MobileBottomNav({
  mainView,
  onSetMainView,
  onOpenSidebar,
}: {
  mainView: MainView;
  onSetMainView: (view: MainView) => void;
  onOpenSidebar: () => void;
}) {
  const itemClass =
    "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] transition-colors";
  const activeClass = "bg-white/12 text-white";
  const idleClass = "text-slate-300 hover:bg-white/10 hover:text-white";

  return (
    <nav
      data-testid="mobile-bottom-nav"
      aria-label="Mobile primary navigation"
      className="grid shrink-0 grid-cols-5 gap-1 border-t border-white/10 bg-slate-950/70 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl md:hidden"
    >
      <button
        type="button"
        onClick={() => onSetMainView("chat")}
        className={`${itemClass} ${mainView === "chat" ? activeClass : idleClass}`}
        aria-current={mainView === "chat" ? "page" : undefined}
      >
        <MessageSquare className="h-4 w-4" />
        <span className="truncate">Chat</span>
      </button>
      <button type="button" onClick={onOpenSidebar} className={`${itemClass} ${idleClass}`}>
        <Bot className="h-4 w-4" />
        <span className="truncate">Agents</span>
      </button>
      <Link href="/projects" className={`${itemClass} ${idleClass}`}>
        <Folder className="h-4 w-4" />
        <span className="truncate">Projects</span>
      </Link>
      <button
        type="button"
        onClick={() => onSetMainView("tasks")}
        className={`${itemClass} ${mainView === "tasks" ? activeClass : idleClass}`}
        aria-current={mainView === "tasks" ? "page" : undefined}
      >
        <ListTodo className="h-4 w-4" />
        <span className="truncate">Tasks</span>
      </button>
      <Link href="/settings" className={`${itemClass} ${idleClass}`}>
        <Settings className="h-4 w-4" />
        <span className="truncate">Settings</span>
      </Link>
    </nav>
  );
}

export default function Home() {
  const { data: session, status } = useSession();
  const mainView = useChatStore((state) => state.mainView);
  const setMainView = useChatStore((state) => state.setMainView);
  const setSidebarOpen = useChatStore((state) => state.setSidebarOpen);
  const [searchOpen, setSearchOpen] = useState(false);
  const [authLoadingTimedOut, setAuthLoadingTimedOut] = useState(false);

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

  useEffect(() => {
    if (status !== "loading") {
      setAuthLoadingTimedOut(false);
      return;
    }

    const timeout = window.setTimeout(() => setAuthLoadingTimedOut(true), 5000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  if (status === "loading" && !authLoadingTimedOut) {
    return (
      <div className="agenthub-aurora-scene flex h-screen items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="agenthub-aurora-scene flex h-screen items-center justify-center p-6">
        <div className="agenthub-glass-panel w-full max-w-md rounded-[1.25rem] p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 via-blue-500 to-violet-500 text-3xl font-bold shadow-lg shadow-blue-500/25">
            A
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mb-4">AgentHub</h1>
          <p className="text-muted-foreground mb-6">
            The Ultimate Local-First AI Agent Platform. Find, build, and collaborate with agent teammates that grow with
            you.
          </p>
          <button
            onClick={() => (window.location.href = "/api/auth/signin?callbackUrl=/")}
            className="agenthub-primary-button inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Sign In with Casdoor
          </button>
          <p className="mt-4 text-xs text-muted-foreground">Dev login: admin@localhost / admin12345</p>
        </div>
      </div>
    );
  }

  return (
    <div className="agenthub-aurora-scene h-screen overflow-hidden p-2 text-foreground md:p-8">
      <div className="agenthub-window mx-auto flex h-full w-full max-w-[1480px] overflow-hidden">
        <Sidebar />
        <main className="agenthub-app-surface flex min-w-0 flex-1 flex-col overflow-hidden">
          <MobileAppBar
            mainView={mainView}
            onOpenSidebar={() => setSidebarOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            {mainView === "marketplace" ? (
              <AgentMarketplace />
            ) : mainView === "memory-editor" ? (
              <MemoryEditor />
            ) : mainView === "group-builder" ? (
              <AgentGroupBuilder />
            ) : mainView === "agent-builder" ? (
              <AgentBuilder />
            ) : mainView === "tasks" ? (
              <TaskManager />
            ) : mainView === "review" ? (
              <ReviewTab />
            ) : mainView === "admin" ? (
              <AdminPanel />
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <DailyBriefPanel />
                <ChatInterface />
              </div>
            )}
          </div>
          <MobileBottomNav mainView={mainView} onSetMainView={setMainView} onOpenSidebar={() => setSidebarOpen(true)} />
        </main>
      </div>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <KeyboardShortcuts />
    </div>
  );
}

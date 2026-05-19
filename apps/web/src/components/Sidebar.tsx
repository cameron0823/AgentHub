"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  DEFAULT_MODEL_ID,
  useChatStore,
  type Agent,
  type AgentGroup,
  type ChatSession,
  type RouteStrategy,
  type ToolProfile,
} from "@/stores/chatStore";
import { trpc } from "@/lib/trpc";
import {
  Plus,
  MessageSquare,
  Trash2,
  Bot,
  Users,
  Database,
  Store,
  Code2,
  FileText,
  Search,
  Pin,
  Settings,
  BarChart2,
  X,
  GitBranch,
  Zap,
  ListTodo,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { AgentList } from "./AgentList";
import { AgentGroupList } from "./AgentGroupList";
import { UserNav } from "./UserNav";

function toChatSession(session: {
  id: string;
  title: string | null;
  model: string | null;
  agentId: string | null;
  groupId?: string | null;
  parentMessageId?: string | null;
  metadata?: unknown;
  isPinned?: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}): ChatSession {
  return {
    id: session.id,
    agentId: session.agentId,
    groupId: session.groupId || null,
    parentMessageId: session.parentMessageId || null,
    title: session.title || "New Chat",
    model: session.model || DEFAULT_MODEL_ID,
    metadata:
      session.metadata && typeof session.metadata === "object" ? (session.metadata as Record<string, unknown>) : null,
    messages: [],
    isPinned: session.isPinned ?? false,
    createdAt: session.createdAt || new Date(),
    updatedAt: session.updatedAt || new Date(),
  };
}

function toAgentGroup(group: {
  id: string;
  name: string;
  description: string | null;
  pattern: "sequential" | "parallel" | "supervisor" | "iterative" | "debate" | "groupchat";
  members: Array<{ groupId?: string; agentId: string; role: string | null; sortOrder: number }>;
  createdAt: Date | null;
  updatedAt: Date | null;
}): AgentGroup {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    pattern: group.pattern,
    members: group.members.map((member) => ({
      groupId: member.groupId || group.id,
      agentId: member.agentId,
      role: member.role,
      sortOrder: member.sortOrder,
    })),
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

function parseAgentTools(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tool): tool is string => typeof tool === "string") : [];
  } catch {
    return [];
  }
}

function parseStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeVoiceProvider(value: unknown): Agent["voiceProvider"] {
  if (value === "openai" || value === "edge" || value === "piper" || value === "faster-whisper") return value;
  return "browser";
}

function toAgent(agent: {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  systemPrompt: string;
  model: string | null;
  routeStrategy?: RouteStrategy | null;
  fallbackModelIds?: unknown;
  voiceProvider?: string | null;
  voiceId?: string | null;
  voiceSpeed?: number | null;
  sttProvider?: string | null;
  handsFreeVoice?: boolean | null;
  temperature: number | null;
  maxTokens: number | null;
  tools: string | null;
  toolProfile?: ToolProfile | null;
  deniedTools?: unknown;
  memoryEnabled: boolean | null;
  knowledgeBaseId?: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}): Agent {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    avatar: agent.avatar,
    systemPrompt: agent.systemPrompt,
    model: agent.model || DEFAULT_MODEL_ID,
    routeStrategy: agent.routeStrategy || "fixed",
    fallbackModelIds: parseStringArray(agent.fallbackModelIds),
    voiceProvider: normalizeVoiceProvider(agent.voiceProvider),
    voiceId: agent.voiceId || "alloy",
    voiceSpeed: agent.voiceSpeed ?? 1,
    sttProvider: normalizeVoiceProvider(agent.sttProvider),
    handsFreeVoice: agent.handsFreeVoice ?? false,
    temperature: agent.temperature ?? 0.7,
    maxTokens: agent.maxTokens ?? 4096,
    tools: parseAgentTools(agent.tools),
    toolProfile: agent.toolProfile || "full",
    deniedTools: parseStringArray(agent.deniedTools),
    memoryEnabled: agent.memoryEnabled ?? true,
    knowledgeBaseId: agent.knowledgeBaseId || null,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

function NavItem({
  icon,
  label,
  onClick,
  href,
  active,
  collapsed,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  active?: boolean;
  collapsed: boolean;
}) {
  const cls = `w-full flex items-center gap-3 px-3 py-2 text-sm rounded-xl transition-colors ${
    active ? "bg-white/16 text-white shadow-inner shadow-white/5" : "text-slate-300 hover:bg-white/10 hover:text-white"
  } ${collapsed ? "justify-center px-0" : ""}`;

  const inner = (
    <>
      <span className="flex-shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </>
  );

  if (href) {
    return (
      <a href={href} className={cls} title={collapsed ? label : undefined}>
        {inner}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={cls} title={collapsed ? label : undefined}>
      {inner}
    </button>
  );
}

export function Sidebar() {
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const { data: authSession } = useSession();
  const isAdmin = (authSession?.user as { role?: string } | undefined)?.role === "admin";

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });
  };

  const {
    sessions,
    activeSessionId,
    selectedModel,
    agents,
    agentGroups,
    activeAgentId,
    activeGroupId,
    sidebarOpen,
    setSessions,
    setAgents,
    setAgentGroups,
    addSession,
    setActiveSession,
    setActiveAgent,
    setActiveGroup,
    setMainView,
    setSidebarOpen,
    updateSession,
    deleteSession,
    pinSession,
  } = useChatStore();
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [sessionCreateError, setSessionCreateError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const sessionList = trpc.sessions.list.useQuery();
  const agentList = trpc.agents.list.useQuery();
  const groupList = trpc.agentGroups.list.useQuery();
  const createSession = trpc.sessions.create.useMutation({
    onMutate: () => {
      setSessionCreateError(null);
      setActiveSession(null);
    },
    onSuccess: (session) => {
      addSession(toChatSession(session));
      setSidebarOpen(false);
      utils.sessions.list.invalidate();
    },
    onError: (error) => {
      setSessionCreateError(error.message || "Could not create a new chat.");
    },
  });
  const deleteServerSession = trpc.sessions.delete.useMutation({
    onSuccess: (_result, variables) => {
      deleteSession(variables.id);
      utils.sessions.list.invalidate();
    },
  });
  const updateServerSession = trpc.sessions.update.useMutation({
    onSuccess: (_result, variables) => {
      if (variables.title) {
        updateSession(variables.id, { title: variables.title, updatedAt: new Date() });
      }
      utils.sessions.list.invalidate();
    },
  });
  const pin = trpc.sessions.pin.useMutation({
    onSuccess: (_result, variables) => {
      pinSession(variables.id, variables.isPinned);
    },
  });

  useEffect(() => {
    if (sessionList.data) setSessions(sessionList.data.map(toChatSession));
  }, [sessionList.data, setSessions]);

  useEffect(() => {
    if (agentList.data) setAgents(agentList.data.map(toAgent));
  }, [agentList.data, setAgents]);

  useEffect(() => {
    if (groupList.data) setAgentGroups(groupList.data.map(toAgentGroup));
  }, [groupList.data, setAgentGroups]);

  const startRename = (session: ChatSession) => {
    setEditingSessionId(session.id);
    setDraftTitle(session.title);
  };

  const finishRename = (session: ChatSession) => {
    const title = draftTitle.trim();
    setEditingSessionId(null);
    if (!title || title === session.title) return;
    updateSession(session.id, { title, updatedAt: new Date() });
    updateServerSession.mutate({ id: session.id, title });
  };

  const handleNewAgent = () => {
    setActiveAgent(null);
    setMainView("agent-builder");
    setSidebarOpen(false);
  };
  const handleNewGroup = () => {
    setActiveGroup(null);
    setMainView("group-builder");
    setSidebarOpen(false);
  };
  const handleEditAgent = (agentId: string) => {
    setActiveAgent(agentId);
    setMainView("agent-builder");
    setSidebarOpen(false);
  };
  const handleStartAgentChat = (agentId: string) => {
    createSession.mutate({ agentId });
    setSidebarOpen(false);
  };
  const handleEditGroup = (groupId: string) => {
    setActiveGroup(groupId);
    setMainView("group-builder");
    setSidebarOpen(false);
  };
  const handleStartGroupChat = (groupId: string) => {
    createSession.mutate({ groupId });
    setSidebarOpen(false);
  };
  const handleSelectSession = (sessionId: string) => {
    setMainView("chat");
    setActiveSession(sessionId);
    setSidebarOpen(false);
  };

  const desktopWidth = collapsed ? "md:w-[4.5rem]" : "md:w-[16rem]";

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div
        className={`
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        md:translate-x-0 fixed md:relative z-50 md:z-auto
        w-[calc(100vw-2rem)] max-w-80 md:max-w-none ${desktopWidth} h-full border-r border-white/10 bg-slate-950/45 backdrop-blur-2xl flex flex-col
        transition-all duration-200 ease-in-out flex-shrink-0
      `}
      >
        {/* Header */}
        <div className={`border-b border-white/10 ${collapsed ? "flex justify-center p-3" : "px-4 py-3"}`}>
          {!collapsed && (
            <div className="mb-4 flex gap-2">
              <span className="agenthub-mac-dot bg-[#ff6b61]" />
              <span className="agenthub-mac-dot bg-[#ffbd5b]" />
              <span className="agenthub-mac-dot bg-[#5dd58c]" />
            </div>
          )}
          <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
            {!collapsed && (
              <>
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 via-blue-500 to-violet-500 text-2xl font-bold shadow-lg shadow-blue-500/25">
                  A
                </div>
                <span className="flex-1 text-[1.35rem] font-semibold tracking-tight text-white">AgentHub</span>
              </>
            )}
            {collapsed && (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 via-blue-500 to-violet-500 text-xl font-bold shadow-lg shadow-blue-500/25">
                A
              </div>
            )}
            <button
              className="md:hidden ml-auto p-1 rounded hover:bg-white/10"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation"
              title="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className={`${collapsed ? "flex flex-col items-center gap-1 py-3 px-1" : "flex flex-col gap-1.5 p-3"}`}>
          <button
            data-testid="new-chat-button"
            onClick={() => createSession.mutate({ model: selectedModel })}
            disabled={createSession.isPending}
            title={collapsed ? "New Chat" : undefined}
            aria-busy={createSession.isPending}
            className={`agenthub-primary-button flex items-center gap-2 rounded-xl text-sm font-semibold transition-colors ${
              collapsed ? "p-2.5 justify-center" : "w-full px-3 py-2 justify-center"
            }`}
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            {!collapsed && (createSession.isPending ? "Creating..." : "New Chat")}
          </button>
          {sessionCreateError && !collapsed && (
            <p data-testid="new-chat-error" role="alert" className="px-1 text-xs leading-5 text-red-300">
              {sessionCreateError}
            </p>
          )}

          <button
            onClick={handleNewAgent}
            title={collapsed ? "New Agent" : undefined}
            className={`flex items-center gap-2 rounded-xl text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white ${
              collapsed ? "p-2.5 justify-center" : "w-full px-3 py-1.5 justify-start"
            }`}
          >
            <Bot className="w-4 h-4 flex-shrink-0" />
            {!collapsed && "New Agent"}
          </button>

          <button
            onClick={handleNewGroup}
            title={collapsed ? "New Group" : undefined}
            className={`flex items-center gap-2 rounded-xl text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white ${
              collapsed ? "p-2.5 justify-center" : "w-full px-3 py-1.5 justify-start"
            }`}
          >
            <Users className="w-4 h-4 flex-shrink-0" />
            {!collapsed && "New Group"}
          </button>

          <button
            onClick={() => {
              setMainView("memory-editor");
              setSidebarOpen(false);
            }}
            title={collapsed ? "Memory" : undefined}
            className={`flex items-center gap-2 rounded-xl text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white ${
              collapsed ? "p-2.5 justify-center" : "w-full px-3 py-1.5 justify-start"
            }`}
          >
            <Database className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Memory</span>}
          </button>

          <button
            onClick={() => {
              setMainView("marketplace");
              setSidebarOpen(false);
            }}
            title={collapsed ? "Marketplace" : undefined}
            className={`flex items-center gap-2 rounded-xl text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white ${
              collapsed ? "p-2.5 justify-center" : "w-full px-3 py-1.5 justify-start"
            }`}
          >
            <Store className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Marketplace</span>}
          </button>
        </div>

        {/* Scrollable content — hidden when collapsed */}
        {!collapsed && (
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            <div className="mb-4">
              <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-slate-300">Agents</div>
              {agentList.isLoading ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                  Loading agents...
                </div>
              ) : agentList.isError ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  Could not load agents.
                </div>
              ) : (
                <AgentList
                  agents={agents}
                  activeAgentId={activeAgentId}
                  onEditAgent={handleEditAgent}
                  onStartChat={handleStartAgentChat}
                  isStartingChat={createSession.isPending}
                />
              )}
            </div>

            <div className="mb-4">
              <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-slate-300">Groups</div>
              {groupList.isLoading ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                  Loading groups...
                </div>
              ) : groupList.isError ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  Could not load groups.
                </div>
              ) : (
                <AgentGroupList
                  groups={agentGroups}
                  agents={agents}
                  activeGroupId={activeGroupId}
                  onEditGroup={handleEditGroup}
                  onStartChat={handleStartGroupChat}
                  isStartingChat={createSession.isPending}
                />
              )}
            </div>

            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-slate-300 flex items-center justify-between">
              <span>Chats</span>
              <span>{sessions.length}</span>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="w-full rounded-xl border border-white/10 bg-white/10 py-1.5 pl-7 pr-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <SessionList
              sessions={sessions}
              activeSessionId={activeSessionId}
              searchQuery={searchQuery}
              isLoading={sessionList.isLoading}
              isError={sessionList.isError}
              editingSessionId={editingSessionId}
              draftTitle={draftTitle}
              setDraftTitle={setDraftTitle}
              finishRename={finishRename}
              startRename={startRename}
              setEditingSessionId={setEditingSessionId}
              updateServerSession={updateServerSession}
              deleteServerSession={deleteServerSession}
              setActiveSession={handleSelectSession}
              pin={pin}
            />
          </div>
        )}

        {collapsed && <div className="flex-1" />}

        {/* Footer nav */}
        <div
          className={`border-t border-white/10 bg-black/10 ${collapsed ? "flex flex-col items-center gap-1 py-3 px-1" : "p-2"}`}
        >
          <NavItem icon={<Database className="w-4 h-4" />} label="Projects" href="/projects" collapsed={collapsed} />
          <NavItem icon={<FileText className="w-4 h-4" />} label="Pages" href="/pages" collapsed={collapsed} />
          <NavItem icon={<Code2 className="w-4 h-4" />} label="Code" href="/code" collapsed={collapsed} />
          <NavItem icon={<FileText className="w-4 h-4" />} label="Knowledge Base" href="/kb" collapsed={collapsed} />
          <NavItem icon={<BarChart2 className="w-4 h-4" />} label="Analytics" href="/analytics" collapsed={collapsed} />
          <NavItem icon={<Zap className="w-4 h-4" />} label="Automations" href="/automations" collapsed={collapsed} />
          <NavItem icon={<ListTodo className="w-4 h-4" />} label="Tasks" href="/tasks" collapsed={collapsed} />
          <NavItem icon={<GitBranch className="w-4 h-4" />} label="Review" href="/review" collapsed={collapsed} />
          {isAdmin && (
            <NavItem
              icon={<ShieldCheck className="w-4 h-4" />}
              label="Admin"
              onClick={() => setMainView("admin")}
              collapsed={collapsed}
            />
          )}
          <NavItem icon={<Settings className="w-4 h-4" />} label="Settings" href="/settings" collapsed={collapsed} />

          {!collapsed && (
            <div className="flex items-center justify-between px-3 py-2">
              <UserNav />
              <ThemeToggle />
            </div>
          )}
          {collapsed && (
            <div className="flex flex-col items-center gap-1 mt-1">
              <UserNav />
              <ThemeToggle />
            </div>
          )}

          {!collapsed && updateServerSession.isError && (
            <div className="mt-1 text-xs text-destructive px-3">Rename failed. Try again.</div>
          )}
          {!collapsed && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-300 px-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              PostgreSQL + pgvector
            </div>
          )}
        </div>

        {/* Collapse toggle — absolute on the right edge, desktop only */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 items-center justify-center rounded-full border border-white/10 bg-slate-900/90 shadow-sm hover:bg-white/10 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </div>
    </>
  );
}

function SessionList({
  sessions,
  activeSessionId,
  searchQuery,
  isLoading,
  isError,
  editingSessionId,
  draftTitle,
  setDraftTitle,
  finishRename,
  startRename,
  setEditingSessionId,
  updateServerSession,
  deleteServerSession,
  setActiveSession,
  pin,
}: {
  sessions: ChatSession[];
  activeSessionId: string | null;
  searchQuery: string;
  isLoading: boolean;
  isError: boolean;
  editingSessionId: string | null;
  draftTitle: string;
  setDraftTitle: (v: string) => void;
  finishRename: (session: ChatSession) => void;
  startRename: (session: ChatSession) => void;
  setEditingSessionId: (id: string | null) => void;
  updateServerSession: ReturnType<typeof trpc.sessions.update.useMutation>;
  deleteServerSession: ReturnType<typeof trpc.sessions.delete.useMutation>;
  setActiveSession: (id: string) => void;
  pin: ReturnType<typeof trpc.sessions.pin.useMutation>;
}) {
  const utils = trpc.useUtils();
  const searchResults = trpc.messages.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.trim().length > 0 },
  );

  if (isLoading) {
    return <div className="text-center text-muted-foreground text-sm py-8">Loading conversations...</div>;
  }
  if (isError) {
    return <div className="text-center text-destructive text-sm py-8">Could not load conversations.</div>;
  }
  if (sessions.length === 0) {
    return <div className="text-center text-muted-foreground text-sm py-8">No conversations yet</div>;
  }

  if (searchQuery.trim().length > 0) {
    if (searchResults.isLoading) {
      return <div className="text-center text-muted-foreground text-xs py-4">Searching...</div>;
    }
    const results = searchResults.data || [];
    if (results.length === 0) {
      return <div className="text-center text-muted-foreground text-xs py-4">No matches found.</div>;
    }
    const bySession = new Map<string, typeof results>();
    for (const r of results) {
      const list = bySession.get(r.sessionId) || [];
      list.push(r);
      bySession.set(r.sessionId, list);
    }
    return (
      <div className="space-y-3" data-testid="search-results">
        {Array.from(bySession.entries()).map(([sessionId, msgs]) => {
          const session = sessions.find((s) => s.id === sessionId);
          if (!session) return null;
          return (
            <div key={sessionId} className="rounded-xl border border-white/10 bg-white/5 p-2">
              <div
                className="text-xs font-medium mb-1 cursor-pointer hover:text-primary truncate"
                onClick={() => setActiveSession(sessionId)}
              >
                {session.title}
              </div>
              <div className="space-y-1">
                {msgs.slice(0, 3).map((msg) => (
                  <div
                    key={msg.messageId}
                    className="line-clamp-2 cursor-pointer rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-white/10"
                    onClick={() => setActiveSession(sessionId)}
                    title={msg.content}
                  >
                    <span className="font-medium text-foreground">{msg.role}:</span> {msg.content}
                  </div>
                ))}
                {msgs.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1">+{msgs.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const pinned = sessions.filter((s) => s.isPinned);
  const unpinned = sessions.filter((s) => !s.isPinned);

  const renderSession = (session: ChatSession) => (
    <div
      key={session.id}
      data-testid="session-row"
      aria-label={session.title}
      className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
        session.id === activeSessionId
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
      } ${session.parentMessageId ? "ml-4" : ""}`}
      onClick={() => setActiveSession(session.id)}
    >
      {session.parentMessageId ? (
        <GitBranch className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
      ) : (
        <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
      )}
      {editingSessionId === session.id ? (
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={() => finishRename(session)}
          onKeyDown={(e) => {
            if (e.key === "Enter") finishRename(session);
            if (e.key === "Escape") setEditingSessionId(null);
          }}
          onClick={(e) => e.stopPropagation()}
          autoFocus
          disabled={updateServerSession.isPending}
          className="min-w-0 flex-1 rounded-lg bg-white/10 px-1 py-0.5 text-xs outline-none ring-1 ring-primary disabled:opacity-60"
        />
      ) : (
        <span
          className="flex-1 truncate text-xs"
          onDoubleClick={(e) => {
            e.stopPropagation();
            startRename(session);
          }}
          title="Double-click to rename"
        >
          {session.parentMessageId && <span className="text-muted-foreground text-[10px] mr-0.5">⑂</span>}
          {session.title}
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          pin.mutate({ id: session.id, isPinned: !session.isPinned });
        }}
        disabled={pin.isPending}
        className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity ${
          session.isPinned ? "text-primary opacity-100" : "text-muted-foreground hover:bg-white/10"
        }`}
        aria-label={session.isPinned ? "Unpin" : "Pin"}
      >
        <Pin className="w-3 h-3" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!window.confirm(`Delete "${session.title}"?`)) return;
          deleteServerSession.mutate({ id: session.id });
        }}
        disabled={deleteServerSession.isPending}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-opacity"
        aria-label={`Delete ${session.title}`}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );

  return (
    <div className="space-y-0.5" data-testid="session-list">
      {pinned.length > 0 && (
        <>
          <div className="px-1 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Pinned
          </div>
          {pinned.map(renderSession)}
          {unpinned.length > 0 && (
            <div className="px-1 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Recent
            </div>
          )}
        </>
      )}
      {unpinned.map(renderSession)}
    </div>
  );
}

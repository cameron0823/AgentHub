"use client";

import { useEffect, useState } from "react";
import { DEFAULT_MODEL_ID, useChatStore, type Agent, type AgentGroup, type ChatSession } from "@/stores/chatStore";
import { trpc } from "@/lib/trpc";
import { Plus, MessageSquare, Trash2, Bot, Users, Database, Store, FileText, Search, Pin, Settings, BarChart2, X, GitBranch, Zap } from "lucide-react";
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
    messages: [],
    createdAt: session.createdAt || new Date(),
    updatedAt: session.updatedAt || new Date(),
  };
}

function toAgentGroup(group: {
  id: string;
  name: string;
  description: string | null;
  pattern: "sequential" | "parallel" | "supervisor" | "debate" | "groupchat";
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

function toAgent(agent: {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  systemPrompt: string;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  tools: string | null;
  memoryEnabled: boolean | null;
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
    temperature: agent.temperature ?? 0.7,
    maxTokens: agent.maxTokens ?? 4096,
    tools: parseAgentTools(agent.tools),
    memoryEnabled: agent.memoryEnabled ?? true,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

export function Sidebar() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

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
  } = useChatStore();
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const utils = trpc.useUtils();
  const sessionList = trpc.sessions.list.useQuery();
  const agentList = trpc.agents.list.useQuery();
  const groupList = trpc.agentGroups.list.useQuery();
  const createSession = trpc.sessions.create.useMutation({
    onSuccess: (session) => {
      addSession(toChatSession(session));
      utils.sessions.list.invalidate();
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

  useEffect(() => {
    if (sessionList.data) {
      setSessions(sessionList.data.map(toChatSession));
    }
  }, [sessionList.data, setSessions]);

  useEffect(() => {
    if (agentList.data) {
      setAgents(agentList.data.map(toAgent));
    }
  }, [agentList.data, setAgents]);

  useEffect(() => {
    if (groupList.data) {
      setAgentGroups(groupList.data.map(toAgentGroup));
    }
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
  };

  const handleNewGroup = () => {
    setActiveGroup(null);
    setMainView("group-builder");
  };

  const handleEditAgent = (agentId: string) => {
    setActiveAgent(agentId);
    setMainView("agent-builder");
  };

  const handleStartAgentChat = (agentId: string) => {
    createSession.mutate({ agentId });
  };

  const handleEditGroup = (groupId: string) => {
    setActiveGroup(groupId);
    setMainView("group-builder");
  };

  const handleStartGroupChat = (groupId: string) => {
    createSession.mutate({ groupId });
  };

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className={`
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        md:translate-x-0 fixed md:relative z-50 md:z-auto
        w-64 h-full border-r bg-card flex flex-col
        transition-transform duration-200 ease-in-out
      `}>
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="w-6 h-6 text-primary" />
          <h1 className="font-bold text-lg">AgentHub</h1>
          <button
            className="md:hidden ml-auto p-1 rounded hover:bg-muted"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={() => createSession.mutate({ model: selectedModel })}
          disabled={createSession.isPending}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
        <button
          onClick={handleNewAgent}
          className="mt-2 w-full flex items-center justify-center gap-2 border rounded-lg px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Bot className="w-4 h-4" />
          New Agent
        </button>
        <button
          onClick={handleNewGroup}
          className="mt-2 w-full flex items-center justify-center gap-2 border rounded-lg px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Users className="w-4 h-4" />
          New Group
        </button>
        <button
          onClick={() => setMainView("memory-editor")}
          className="mt-2 w-full flex items-center justify-center gap-2 border rounded-lg px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Database className="w-4 h-4" />
          Memory
        </button>
        <button
          onClick={() => setMainView("marketplace")}
          className="mt-2 w-full flex items-center justify-center gap-2 border rounded-lg px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Store className="w-4 h-4" />
          Marketplace
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="mb-4">
          <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Agents
          </div>
          {agentList.isLoading ? (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Loading agents...</div>
          ) : agentList.isError ? (
            <div className="rounded-lg border border-destructive/30 p-3 text-xs text-destructive">Could not load agents.</div>
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
          <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Groups
          </div>
          {groupList.isLoading ? (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Loading groups...</div>
          ) : groupList.isError ? (
            <div className="rounded-lg border border-destructive/30 p-3 text-xs text-destructive">Could not load groups.</div>
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

        <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-between">
          <span>Chats</span>
          <span className="text-[10px]">{sessions.length}</span>
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="w-full pl-7 pr-2 py-1 text-xs rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
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
          setActiveSession={setActiveSession}
        />
      </div>

      <div className="p-2 border-t">
        <a
          href="/kb"
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors mb-1"
        >
          <FileText className="w-4 h-4" />
          Knowledge Base
        </a>
        <a
          href="/analytics"
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors mb-1"
        >
          <BarChart2 className="w-4 h-4" />
          Analytics
        </a>
        <a
          href="/automations"
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors mb-1"
        >
          <Zap className="w-4 h-4" />
          Automations
        </a>
        <a
          href="/settings"
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors mb-1"
        >
          <Settings className="w-4 h-4" />
          Settings
        </a>
        <div className="flex items-center justify-between px-3 py-2">
          <UserNav />
          <ThemeToggle />
        </div>
        {updateServerSession.isError ? (
          <div className="mt-2 text-xs text-destructive">Rename failed. Try again.</div>
        ) : null}
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground px-3">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          PostgreSQL + pgvector
        </div>
      </div>
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
}) {
  const utils = trpc.useUtils();
  const searchResults = trpc.messages.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.trim().length > 0 }
  );

  if (isLoading) {
    return (
      <div className="text-center text-muted-foreground text-sm py-8">
        Loading conversations...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center text-destructive text-sm py-8">
        Could not load conversations.
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-sm py-8">
        No conversations yet
      </div>
    );
  }

  // When searching, show message-level results grouped by session
  if (searchQuery.trim().length > 0) {
    if (searchResults.isLoading) {
      return <div className="text-center text-muted-foreground text-xs py-4">Searching...</div>;
    }

    const results = searchResults.data || [];
    if (results.length === 0) {
      return <div className="text-center text-muted-foreground text-xs py-4">No matches found.</div>;
    }

    // Group by session
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
            <div key={sessionId} className="rounded-lg border bg-muted/30 p-2">
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
                    className="text-xs text-muted-foreground line-clamp-2 cursor-pointer hover:bg-muted rounded px-1 py-0.5"
                    onClick={() => setActiveSession(sessionId)}
                    title={msg.content}
                  >
                    <span className="font-medium text-foreground">{msg.role}:</span>{" "}
                    {msg.content}
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

  // Default: list sessions
  return (
    <div className="space-y-1" data-testid="session-list">
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
            session.id === activeSessionId
              ? "bg-primary/10 text-primary"
              : "hover:bg-muted"
          } ${session.parentMessageId ? "ml-4" : ""}`}
          onClick={() => setActiveSession(session.id)}
        >
          {session.parentMessageId
            ? <GitBranch className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
            : <MessageSquare className="w-4 h-4 flex-shrink-0" />}
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
              className="min-w-0 flex-1 rounded bg-background px-1 py-0.5 text-sm outline-none ring-1 ring-primary disabled:opacity-60"
            />
          ) : (
            <span
              className="flex-1 truncate"
              onDoubleClick={(e) => {
                e.stopPropagation();
                startRename(session);
              }}
              title="Double-click to rename"
            >
              <span className="flex items-center gap-1">
                {session.parentMessageId && <span className="text-muted-foreground text-[10px]" title="Branch">⑂</span>}
                {session.title}
              </span>
            </span>
          )}
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
      ))}
    </div>
  );
}

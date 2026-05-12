import { create } from "zustand";

export const DEFAULT_MODEL_ID = "ollama:qwen2.5:7b";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  toolCallId?: string;
  toolName: string;
  result: unknown;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
  toolResult?: ToolResult;
  model?: string;
  isStreaming?: boolean;
  createdAt?: Date;
}

export interface ChatSession {
  id: string;
  agentId?: string | null;
  groupId?: string | null;
  parentMessageId?: string | null;
  title: string;
  model: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Agent {
  id: string;
  name: string;
  description?: string | null;
  avatar?: string | null;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  tools: string[];
  memoryEnabled: boolean;
  knowledgeBaseId?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface AgentGroupMember {
  groupId?: string;
  agentId: string;
  role?: string | null;
  sortOrder: number;
}

export interface AgentGroup {
  id: string;
  name: string;
  description?: string | null;
  pattern: "sequential" | "parallel" | "supervisor" | "debate" | "groupchat";
  members: AgentGroupMember[];
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export type MemoryStatus = "accepted" | "proposed" | "rejected" | "archived";

export interface MemoryEntry {
  id: string;
  agentId?: string | null;
  category: string;
  key: string;
  value: string;
  confidence: number;
  sourceMessageId?: string | null;
  status: MemoryStatus;
  isEdited: boolean;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export type MainView = "chat" | "agent-builder" | "group-builder" | "memory-editor" | "marketplace";

export interface ModelMetadata {
  id: string;
  name: string;
  providerId?: string;
  providerName?: string;
  providerStatus?: "healthy" | "unhealthy";
  providerLatency?: number;
  parameters?: string;
  capabilities?: ("chat" | "vision" | "tools" | "embeddings" | "reasoning")[];
}

interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  isGenerating: boolean;
  availableModels: ModelMetadata[];
  selectedModel: string;
  agents: Agent[];
  agentGroups: AgentGroup[];
  memoryEntries: MemoryEntry[];
  mainView: MainView;
  activeAgentId: string | null;
  activeGroupId: string | null;

  // Actions
  setSessions: (sessions: ChatSession[]) => void;
  setSessionMessages: (sessionId: string, messages: ChatMessage[]) => void;
  setActiveSession: (id: string | null) => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateMessage: (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  setIsGenerating: (value: boolean) => void;
  setAvailableModels: (models: ModelMetadata[]) => void;
  setSelectedModel: (model: string) => void;
  setAgents: (agents: Agent[]) => void;
  setAgentGroups: (groups: AgentGroup[]) => void;
  setMemoryEntries: (entries: MemoryEntry[]) => void;
  addMemoryEntry: (entry: MemoryEntry) => void;
  updateMemoryEntry: (id: string, updates: Partial<MemoryEntry>) => void;
  deleteMemoryEntry: (id: string) => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  deleteAgent: (id: string) => void;
  setMainView: (view: MainView) => void;
  setActiveAgent: (id: string | null) => void;
  setActiveGroup: (id: string | null) => void;
  addAgentGroup: (group: AgentGroup) => void;
  updateAgentGroup: (id: string, updates: Partial<AgentGroup>) => void;
  deleteAgentGroup: (id: string) => void;
  addSession: (session: ChatSession) => void;
  replaceMessageId: (sessionId: string, currentId: string, nextId: string) => void;
  updateSession: (id: string, updates: Partial<Pick<ChatSession, "title" | "model" | "agentId" | "groupId" | "updatedAt">>) => void;
  deleteSession: (id: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  sessions: [],
  activeSessionId: null,
  isGenerating: false,
  availableModels: [],
  selectedModel: DEFAULT_MODEL_ID,
  agents: [],
  agentGroups: [],
  memoryEntries: [],
  mainView: "chat",
  activeAgentId: null,
  activeGroupId: null,

  setSessions: (sessions) =>
    set((state) => {
      const activeSessionId =
        state.activeSessionId && sessions.some((session) => session.id === state.activeSessionId)
          ? state.activeSessionId
          : sessions[0]?.id || null;
      const activeSession = sessions.find((session) => session.id === activeSessionId);

      return {
        sessions: sessions.map((session) => {
          const existing = state.sessions.find((s) => s.id === session.id);
          return { ...session, messages: existing?.messages || session.messages };
        }),
        activeSessionId,
        selectedModel: activeSession?.model || state.selectedModel,
      };
    }),

  setSessionMessages: (sessionId, messages) =>
    set((state) => ({
      sessions: state.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        const streamingMessages = session.messages.filter((message) => message.isStreaming);
        const serverIds = new Set(messages.map((message) => message.id));
        return {
          ...session,
          messages: [...messages, ...streamingMessages.filter((message) => !serverIds.has(message.id))],
        };
      }),
    })),

  setActiveSession: (id) =>
    set((state) => {
      const session = state.sessions.find((s) => s.id === id);
      return {
        activeSessionId: id,
        selectedModel: session?.model || state.selectedModel,
        mainView: "chat",
      };
    }),

  addMessage: (sessionId, message) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, messages: [...s.messages, message] } : s
      ),
    })),

  updateMessage: (sessionId, messageId, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              messages: s.messages.map((m) => (m.id === messageId ? { ...m, ...updates } : m)),
            }
          : s
      ),
    })),

  setIsGenerating: (value) => set({ isGenerating: value }),

  setAvailableModels: (models) => set({ availableModels: models }),

  setSelectedModel: (model) => set({ selectedModel: model }),

  setAgents: (agents) => set({ agents }),

  setAgentGroups: (agentGroups) => set({ agentGroups }),

  setMemoryEntries: (memoryEntries) => set({ memoryEntries }),

  addMemoryEntry: (entry) =>
    set((state) => ({
      memoryEntries: [entry, ...state.memoryEntries.filter((existing) => existing.id !== entry.id)],
    })),

  updateMemoryEntry: (id, updates) =>
    set((state) => ({
      memoryEntries: state.memoryEntries.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)),
    })),

  deleteMemoryEntry: (id) =>
    set((state) => ({
      memoryEntries: state.memoryEntries.filter((entry) => entry.id !== id),
    })),

  addAgent: (agent) =>
    set((state) => ({
      agents: [agent, ...state.agents.filter((existing) => existing.id !== agent.id)],
      activeAgentId: agent.id,
    })),

  updateAgent: (id, updates) =>
    set((state) => ({
      agents: state.agents.map((agent) => (agent.id === id ? { ...agent, ...updates } : agent)),
    })),

  deleteAgent: (id) =>
    set((state) => ({
      agents: state.agents.filter((agent) => agent.id !== id),
      activeAgentId: state.activeAgentId === id ? null : state.activeAgentId,
    })),

  setMainView: (view) => set({ mainView: view }),

  setActiveAgent: (id) => set({ activeAgentId: id }),

  setActiveGroup: (id) => set({ activeGroupId: id }),

  addAgentGroup: (group) =>
    set((state) => ({
      agentGroups: [group, ...state.agentGroups.filter((existing) => existing.id !== group.id)],
      activeGroupId: group.id,
    })),

  updateAgentGroup: (id, updates) =>
    set((state) => ({
      agentGroups: state.agentGroups.map((group) => (group.id === id ? { ...group, ...updates } : group)),
    })),

  deleteAgentGroup: (id) =>
    set((state) => ({
      agentGroups: state.agentGroups.filter((group) => group.id !== id),
      activeGroupId: state.activeGroupId === id ? null : state.activeGroupId,
    })),

  addSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions.filter((existing) => existing.id !== session.id)],
      activeSessionId: session.id,
      selectedModel: session.model || state.selectedModel,
      mainView: "chat",
    })),

  replaceMessageId: (sessionId, currentId, nextId) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              messages: session.messages.map((message) =>
                message.id === currentId ? { ...message, id: nextId } : message
              ),
            }
          : session
      ),
    })),

  updateSession: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === id ? { ...session, ...updates } : session
      ),
      selectedModel:
        state.activeSessionId === id && updates.model ? updates.model : state.selectedModel,
    })),

  deleteSession: (id) =>
    set((state) => {
      const filtered = state.sessions.filter((s) => s.id !== id);
      return {
        sessions: filtered,
        activeSessionId: state.activeSessionId === id ? (filtered[0]?.id || null) : state.activeSessionId,
      };
    }),
}));

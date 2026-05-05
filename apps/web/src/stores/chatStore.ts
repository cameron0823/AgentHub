import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  reasoning?: string;
  model?: string;
  isStreaming?: boolean;
  createdAt?: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  isGenerating: boolean;
  availableModels: { id: string; name: string }[];
  selectedModel: string;

  // Actions
  setSessions: (sessions: ChatSession[]) => void;
  setActiveSession: (id: string | null) => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateMessage: (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  setIsGenerating: (value: boolean) => void;
  setAvailableModels: (models: { id: string; name: string }[]) => void;
  setSelectedModel: (model: string) => void;
  createSession: () => string;
  deleteSession: (id: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isGenerating: false,
  availableModels: [],
  selectedModel: "qwen2.5:7b",

  setSessions: (sessions) => set({ sessions }),

  setActiveSession: (id) => set({ activeSessionId: id }),

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

  createSession: () => {
    const id = crypto.randomUUID();
    const session: ChatSession = {
      id,
      title: "New Chat",
      model: get().selectedModel,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: id,
    }));
    return id;
  },

  deleteSession: (id) =>
    set((state) => {
      const filtered = state.sessions.filter((s) => s.id !== id);
      return {
        sessions: filtered,
        activeSessionId: state.activeSessionId === id ? (filtered[0]?.id || null) : state.activeSessionId,
      };
    }),
}));

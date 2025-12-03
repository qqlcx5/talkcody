import { create } from 'zustand';

interface ConversationUsageState {
  conversationId: string | null;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  contextUsage: number; // Percentage of context window used (0-100)

  // Actions
  setUsage: (
    conversationId: string,
    cost: number,
    inputTokens: number,
    outputTokens: number
  ) => void;
  addUsage: (cost: number, inputTokens: number, outputTokens: number) => void;
  setContextUsage: (contextUsage: number) => void;
  resetUsage: (conversationId?: string) => void;
}

export const useConversationUsageStore = create<ConversationUsageState>((set) => ({
  conversationId: null,
  cost: 0,
  inputTokens: 0,
  outputTokens: 0,
  contextUsage: 0,

  setUsage: (conversationId, cost, inputTokens, outputTokens) =>
    set({ conversationId, cost, inputTokens, outputTokens }),

  addUsage: (cost, inputTokens, outputTokens) =>
    set((state) => ({
      cost: state.cost + cost,
      inputTokens: state.inputTokens + inputTokens,
      outputTokens: state.outputTokens + outputTokens,
    })),

  setContextUsage: (contextUsage) => set({ contextUsage }),

  resetUsage: (conversationId) =>
    set({
      conversationId: conversationId ?? null,
      cost: 0,
      inputTokens: 0,
      outputTokens: 0,
      contextUsage: 0,
    }),
}));

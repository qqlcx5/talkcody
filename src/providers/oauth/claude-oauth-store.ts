// src/providers/oauth/claude-oauth-store.ts
// Zustand store for Claude OAuth state management

import { create } from 'zustand';
import { logger } from '@/lib/logger';
import { llmClient } from '@/services/llm/llm-client';
import { exchangeCode, startOAuthFlow } from './claude-oauth-service';

interface ClaudeOAuthState {
  // Connection state
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // Token metadata (in-memory)
  expiresAt: number | null;

  // OAuth flow state (temporary during flow)
  verifier: string | null;
  state: string | null;

  // Initialization
  isInitialized: boolean;
}

interface ClaudeOAuthActions {
  // Initialize from storage
  initialize: () => Promise<void>;

  // OAuth flow
  startOAuth: () => Promise<string>;
  completeOAuth: (code: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

type ClaudeOAuthStore = ClaudeOAuthState & ClaudeOAuthActions;

async function loadOAuthSnapshot() {
  try {
    return await llmClient.getOAuthStatus();
  } catch (error) {
    logger.warn('[ClaudeOAuth] Failed to read OAuth status from Rust:', error);
    return null;
  }
}

export const useClaudeOAuthStore = create<ClaudeOAuthStore>((set, get) => ({
  // Initial state
  isConnected: false,
  isLoading: false,
  error: null,
  expiresAt: null,
  verifier: null,
  state: null,
  isInitialized: false,

  // Initialize from storage
  initialize: async () => {
    const { isInitialized, isLoading } = get();
    if (isInitialized || isLoading) return;

    set({ isLoading: true, error: null });

    try {
      logger.info('[ClaudeOAuth] Initializing store');

      const snapshot = await loadOAuthSnapshot();
      const isConnected = snapshot?.anthropic?.isConnected || false;
      const expiresAt = snapshot?.anthropic?.expiresAt || null;

      logger.info('[ClaudeOAuth] Initialized', { isConnected });

      set({
        isConnected,
        expiresAt,
        isLoading: false,
        isInitialized: true,
      });
    } catch (error) {
      logger.error('[ClaudeOAuth] Initialization error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to initialize',
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  // Start OAuth flow - returns URL to open in browser
  startOAuth: async () => {
    set({ isLoading: true, error: null });

    try {
      const result = await startOAuthFlow();

      set({
        verifier: result.verifier,
        state: result.state,
        isLoading: false,
      });

      logger.info('[ClaudeOAuth] OAuth flow started');
      return result.url;
    } catch (error) {
      logger.error('[ClaudeOAuth] Failed to start OAuth:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to start OAuth',
        isLoading: false,
      });
      throw error;
    }
  },

  // Complete OAuth flow with authorization code
  completeOAuth: async (code: string) => {
    const { verifier, state } = get();

    if (!verifier || !state) {
      throw new Error('No verifier or state found. Please start OAuth flow first.');
    }

    set({ isLoading: true, error: null });

    try {
      const result = await exchangeCode(code, verifier, state);

      if (result.type === 'failed' || !result.tokens) {
        throw new Error(result.error || 'Token exchange failed');
      }

      const { expiresAt } = result.tokens;

      logger.info('[ClaudeOAuth] OAuth completed successfully');

      set({
        isConnected: true,
        expiresAt,
        verifier: null,
        state: null,
        isLoading: false,
      });
    } catch (error) {
      logger.error('[ClaudeOAuth] Failed to complete OAuth:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to complete OAuth',
        verifier: null,
        state: null,
        isLoading: false,
      });
      throw error;
    }
  },

  // Disconnect and clear tokens
  disconnect: async () => {
    set({ isLoading: true, error: null });

    try {
      await llmClient.disconnectClaudeOAuth();

      logger.info('[ClaudeOAuth] Disconnected');

      set({
        isConnected: false,
        expiresAt: null,
        isLoading: false,
      });
    } catch (error) {
      logger.error('[ClaudeOAuth] Failed to disconnect:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to disconnect',
        isLoading: false,
      });
      throw error;
    }
  },
}));

// Selector for connection status
export const selectIsClaudeOAuthConnected = (state: ClaudeOAuthStore) => state.isConnected;

// Export async helper for checking OAuth status
export async function isClaudeOAuthConnected(): Promise<boolean> {
  const store = useClaudeOAuthStore.getState();
  if (!store.isInitialized) {
    await store.initialize();
  }
  return useClaudeOAuthStore.getState().isConnected;
}

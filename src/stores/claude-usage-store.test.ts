// src/stores/claude-usage-store.test.ts
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ClaudeUsageData } from '@/services/claude-usage-service';
import { useClaudeUsageStore } from './claude-usage-store';

// Mock the claude-usage-service
vi.mock('@/services/claude-usage-service', () => ({
  fetchClaudeUsage: vi.fn(),
  getTimeUntilReset: vi.fn(),
  getUsageLevel: vi.fn(),
  getRemainingPercentage: vi.fn(),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { fetchClaudeUsage } = await import('@/services/claude-usage-service');
const mockFetchClaudeUsage = fetchClaudeUsage as Mock;

describe('claude-usage-store', () => {
  const mockUsageData: ClaudeUsageData = {
    five_hour: {
      utilization_pct: 45.5,
      reset_at: '2026-01-02T12:00:00Z',
    },
    seven_day: {
      utilization_pct: 60.0,
    },
    seven_day_sonnet: {
      utilization_pct: 55.0,
    },
    seven_day_opus: {
      utilization_pct: 70.0,
    },
    extra_usage: {
      current_spending: 10.50,
      budget_limit: 100.0,
    },
    rate_limit_tier: 'Pro Plan',
  };

  beforeEach(() => {
    // Reset store state
    useClaudeUsageStore.setState({
      usageData: null,
      isLoading: false,
      error: null,
      lastFetchedAt: null,
      autoRefreshEnabled: false,
      isInitialized: false,
    });

    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('initialize', () => {
    it('should initialize store and fetch usage data', async () => {
      mockFetchClaudeUsage.mockResolvedValue(mockUsageData);

      const { initialize } = useClaudeUsageStore.getState();
      await initialize();

      const state = useClaudeUsageStore.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.usageData).toEqual(mockUsageData);
      expect(state.error).toBeNull();
    });

    it('should not reinitialize if already initialized', async () => {
      useClaudeUsageStore.setState({ isInitialized: true });
      mockFetchClaudeUsage.mockResolvedValue(mockUsageData);

      const { initialize } = useClaudeUsageStore.getState();
      await initialize();

      expect(fetchClaudeUsage).not.toHaveBeenCalled();
    });
  });

  describe('fetchUsage', () => {
    it('should fetch usage data successfully', async () => {
      mockFetchClaudeUsage.mockResolvedValue(mockUsageData);

      const { fetchUsage } = useClaudeUsageStore.getState();
      await fetchUsage();

      const state = useClaudeUsageStore.getState();
      expect(state.usageData).toEqual(mockUsageData);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.lastFetchedAt).toBeGreaterThan(0);
    });

    it('should handle fetch errors', async () => {
      const errorMessage = 'Failed to fetch usage';
      mockFetchClaudeUsage.mockRejectedValue(new Error(errorMessage));

      const { fetchUsage } = useClaudeUsageStore.getState();
      await fetchUsage();

      const state = useClaudeUsageStore.getState();
      expect(state.error).toBe(errorMessage);
      expect(state.isLoading).toBe(false);
      expect(state.usageData).toBeNull();
    });

    it('should use cached data if within cache duration', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Set initial data with recent timestamp
      useClaudeUsageStore.setState({
        usageData: mockUsageData,
        lastFetchedAt: now - 60000, // 1 minute ago
      });

      mockFetchClaudeUsage.mockResolvedValue(mockUsageData);

      const { fetchUsage } = useClaudeUsageStore.getState();
      await fetchUsage();

      // Should not call fetch because cache is fresh
      expect(fetchClaudeUsage).not.toHaveBeenCalled();
    });

    it('should fetch new data if cache is stale', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Set initial data with old timestamp
      useClaudeUsageStore.setState({
        usageData: mockUsageData,
        lastFetchedAt: now - 3 * 60000, // 3 minutes ago (cache is 2 minutes)
      });

      mockFetchClaudeUsage.mockResolvedValue(mockUsageData);

      const { fetchUsage } = useClaudeUsageStore.getState();
      await fetchUsage();

      // Should call fetch because cache is stale
      expect(fetchClaudeUsage).toHaveBeenCalled();
    });

    it('should not fetch if already loading', async () => {
      useClaudeUsageStore.setState({ isLoading: true });
      mockFetchClaudeUsage.mockResolvedValue(mockUsageData);

      const { fetchUsage } = useClaudeUsageStore.getState();
      await fetchUsage();

      expect(fetchClaudeUsage).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should bypass cache and force fresh fetch', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Set recent cache
      useClaudeUsageStore.setState({
        usageData: mockUsageData,
        lastFetchedAt: now - 30000, // 30 seconds ago
      });

      mockFetchClaudeUsage.mockResolvedValue(mockUsageData);

      const { refresh } = useClaudeUsageStore.getState();
      await refresh();

      // Should call fetch even though cache is fresh
      expect(fetchClaudeUsage).toHaveBeenCalled();
    });

    it('should clear lastFetchedAt before fetching', async () => {
      useClaudeUsageStore.setState({
        lastFetchedAt: Date.now(),
      });

      mockFetchClaudeUsage.mockResolvedValue(mockUsageData);

      const { refresh } = useClaudeUsageStore.getState();

      // Check that lastFetchedAt is cleared
      const promise = refresh();
      
      // After setting state but before fetch completes
      await vi.waitFor(() => {
        const state = useClaudeUsageStore.getState();
        expect(state.lastFetchedAt).toBeNull();
      });

      await promise;
    });
  });

  describe('clear', () => {
    it('should clear all usage data', () => {
      useClaudeUsageStore.setState({
        usageData: mockUsageData,
        lastFetchedAt: Date.now(),
        error: 'Some error',
      });

      const { clear } = useClaudeUsageStore.getState();
      clear();

      const state = useClaudeUsageStore.getState();
      expect(state.usageData).toBeNull();
      expect(state.lastFetchedAt).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('setAutoRefresh', () => {
    it('should enable auto-refresh and start interval', () => {
      const { setAutoRefresh } = useClaudeUsageStore.getState();
      setAutoRefresh(true);

      const state = useClaudeUsageStore.getState();
      expect(state.autoRefreshEnabled).toBe(true);
    });

    it('should disable auto-refresh and stop interval', () => {
      useClaudeUsageStore.setState({ autoRefreshEnabled: true });

      const { setAutoRefresh } = useClaudeUsageStore.getState();
      setAutoRefresh(false);

      const state = useClaudeUsageStore.getState();
      expect(state.autoRefreshEnabled).toBe(false);
    });

    it('should trigger auto-refresh on interval', async () => {
      mockFetchClaudeUsage.mockResolvedValue(mockUsageData);

      const { setAutoRefresh } = useClaudeUsageStore.getState();
      setAutoRefresh(true);

      // Fast-forward time by 5 minutes (auto-refresh interval)
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      // Should have called fetch due to auto-refresh
      expect(fetchClaudeUsage).toHaveBeenCalled();

      // Cleanup
      setAutoRefresh(false);
    });
  });

  describe('selectors', () => {
    it('should select usage data correctly', () => {
      useClaudeUsageStore.setState({ usageData: mockUsageData });

      const { selectClaudeUsageData } = await import('./claude-usage-store');
      const data = selectClaudeUsageData(useClaudeUsageStore.getState());

      expect(data).toEqual(mockUsageData);
    });

    it('should select loading state correctly', () => {
      useClaudeUsageStore.setState({ isLoading: true });

      const { selectClaudeUsageLoading } = await import('./claude-usage-store');
      const loading = selectClaudeUsageLoading(useClaudeUsageStore.getState());

      expect(loading).toBe(true);
    });

    it('should select error state correctly', () => {
      const errorMessage = 'Test error';
      useClaudeUsageStore.setState({ error: errorMessage });

      const { selectClaudeUsageError } = await import('./claude-usage-store');
      const error = selectClaudeUsageError(useClaudeUsageStore.getState());

      expect(error).toBe(errorMessage);
    });
  });

  describe('getClaudeUsageData helper', () => {
    it('should initialize if not initialized and return data', async () => {
      mockFetchClaudeUsage.mockResolvedValue(mockUsageData);

      const { getClaudeUsageData } = await import('./claude-usage-store');
      const data = await getClaudeUsageData();

      expect(data).toEqual(mockUsageData);
      expect(useClaudeUsageStore.getState().isInitialized).toBe(true);
    });

    it('should return existing data if already initialized', async () => {
      useClaudeUsageStore.setState({
        usageData: mockUsageData,
        isInitialized: true,
      });

      const { getClaudeUsageData } = await import('./claude-usage-store');
      const data = await getClaudeUsageData();

      expect(data).toEqual(mockUsageData);
      expect(fetchClaudeUsage).not.toHaveBeenCalled();
    });
  });
});

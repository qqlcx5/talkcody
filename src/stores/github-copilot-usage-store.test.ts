// src/stores/github-copilot-usage-store.test.ts
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { GitHubCopilotUsageData } from '@/services/github-copilot-usage-service';
import { useGitHubCopilotUsageStore } from './github-copilot-usage-store';

vi.mock('@/services/github-copilot-usage-service', () => ({
  fetchGitHubCopilotUsage: vi.fn(),
  getUsageLevel: vi.fn(),
  getRemainingPercentage: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { fetchGitHubCopilotUsage } = await import('@/services/github-copilot-usage-service');
const mockFetchGitHubCopilotUsage = fetchGitHubCopilotUsage as Mock;

describe('github-copilot-usage-store', () => {
  const mockUsageData: GitHubCopilotUsageData = {
    utilization_pct: 42,
    plan: 'pro',
    source: 'premiumInteractions',
  };

  beforeEach(() => {
    useGitHubCopilotUsageStore.setState({
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
      mockFetchGitHubCopilotUsage.mockResolvedValue(mockUsageData);

      const { initialize } = useGitHubCopilotUsageStore.getState();
      await initialize();

      const state = useGitHubCopilotUsageStore.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.usageData).toEqual(mockUsageData);
      expect(state.error).toBeNull();
    });

    it('should not reinitialize if already initialized', async () => {
      useGitHubCopilotUsageStore.setState({ isInitialized: true });
      mockFetchGitHubCopilotUsage.mockResolvedValue(mockUsageData);

      const { initialize } = useGitHubCopilotUsageStore.getState();
      await initialize();

      expect(fetchGitHubCopilotUsage).not.toHaveBeenCalled();
    });
  });

  describe('fetchUsage', () => {
    it('should fetch usage data successfully', async () => {
      mockFetchGitHubCopilotUsage.mockResolvedValue(mockUsageData);

      const { fetchUsage } = useGitHubCopilotUsageStore.getState();
      await fetchUsage();

      const state = useGitHubCopilotUsageStore.getState();
      expect(state.usageData).toEqual(mockUsageData);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.lastFetchedAt).toBeGreaterThan(0);
    });

    it('should handle fetch errors', async () => {
      const errorMessage = 'Failed to fetch usage';
      mockFetchGitHubCopilotUsage.mockRejectedValue(new Error(errorMessage));

      const { fetchUsage } = useGitHubCopilotUsageStore.getState();
      await fetchUsage();

      const state = useGitHubCopilotUsageStore.getState();
      expect(state.error).toBe(errorMessage);
      expect(state.isLoading).toBe(false);
      expect(state.usageData).toBeNull();
    });

    it('should use cached data if within cache duration', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      useGitHubCopilotUsageStore.setState({
        usageData: mockUsageData,
        lastFetchedAt: now - 60000,
      });

      mockFetchGitHubCopilotUsage.mockResolvedValue(mockUsageData);

      const { fetchUsage } = useGitHubCopilotUsageStore.getState();
      await fetchUsage();

      expect(fetchGitHubCopilotUsage).not.toHaveBeenCalled();
    });

    it('should fetch new data if cache is stale', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      useGitHubCopilotUsageStore.setState({
        usageData: mockUsageData,
        lastFetchedAt: now - 3 * 60000,
      });

      mockFetchGitHubCopilotUsage.mockResolvedValue(mockUsageData);

      const { fetchUsage } = useGitHubCopilotUsageStore.getState();
      await fetchUsage();

      expect(fetchGitHubCopilotUsage).toHaveBeenCalled();
    });

    it('should not fetch if already loading', async () => {
      useGitHubCopilotUsageStore.setState({ isLoading: true });
      mockFetchGitHubCopilotUsage.mockResolvedValue(mockUsageData);

      const { fetchUsage } = useGitHubCopilotUsageStore.getState();
      await fetchUsage();

      expect(fetchGitHubCopilotUsage).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should bypass cache and force fresh fetch', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      useGitHubCopilotUsageStore.setState({
        usageData: mockUsageData,
        lastFetchedAt: now - 30000,
      });

      mockFetchGitHubCopilotUsage.mockResolvedValue(mockUsageData);

      const { refresh } = useGitHubCopilotUsageStore.getState();
      await refresh();

      expect(fetchGitHubCopilotUsage).toHaveBeenCalled();
    });

    it('should clear lastFetchedAt before fetching', async () => {
      useGitHubCopilotUsageStore.setState({
        lastFetchedAt: Date.now(),
      });

      mockFetchGitHubCopilotUsage.mockResolvedValue(mockUsageData);

      const { refresh } = useGitHubCopilotUsageStore.getState();

      const promise = refresh();

      await vi.waitFor(() => {
        const state = useGitHubCopilotUsageStore.getState();
        expect(state.lastFetchedAt).toBeNull();
      });

      await promise;
    });
  });

  describe('clear', () => {
    it('should clear all usage data', () => {
      useGitHubCopilotUsageStore.setState({
        usageData: mockUsageData,
        lastFetchedAt: Date.now(),
        error: 'Some error',
      });

      const { clear } = useGitHubCopilotUsageStore.getState();
      clear();

      const state = useGitHubCopilotUsageStore.getState();
      expect(state.usageData).toBeNull();
      expect(state.lastFetchedAt).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('setAutoRefresh', () => {
    it('should enable auto-refresh and start interval', () => {
      const { setAutoRefresh } = useGitHubCopilotUsageStore.getState();
      setAutoRefresh(true);

      const state = useGitHubCopilotUsageStore.getState();
      expect(state.autoRefreshEnabled).toBe(true);
    });

    it('should disable auto-refresh and stop interval', () => {
      useGitHubCopilotUsageStore.setState({ autoRefreshEnabled: true });

      const { setAutoRefresh } = useGitHubCopilotUsageStore.getState();
      setAutoRefresh(false);

      const state = useGitHubCopilotUsageStore.getState();
      expect(state.autoRefreshEnabled).toBe(false);
    });

    it('should trigger auto-refresh on interval', async () => {
      mockFetchGitHubCopilotUsage.mockResolvedValue(mockUsageData);

      const { setAutoRefresh } = useGitHubCopilotUsageStore.getState();
      setAutoRefresh(true);

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(fetchGitHubCopilotUsage).toHaveBeenCalled();

      setAutoRefresh(false);
    });
  });

  describe('selectors', () => {
    it('should select usage data correctly', async () => {
      useGitHubCopilotUsageStore.setState({ usageData: mockUsageData });

      const { selectGitHubCopilotUsageData } = await import('./github-copilot-usage-store');
      const data = selectGitHubCopilotUsageData(useGitHubCopilotUsageStore.getState());

      expect(data).toEqual(mockUsageData);
    });

    it('should select loading state correctly', async () => {
      useGitHubCopilotUsageStore.setState({ isLoading: true });

      const { selectGitHubCopilotUsageLoading } = await import('./github-copilot-usage-store');
      const loading = selectGitHubCopilotUsageLoading(useGitHubCopilotUsageStore.getState());

      expect(loading).toBe(true);
    });

    it('should select error state correctly', async () => {
      const errorMessage = 'Test error';
      useGitHubCopilotUsageStore.setState({ error: errorMessage });

      const { selectGitHubCopilotUsageError } = await import('./github-copilot-usage-store');
      const error = selectGitHubCopilotUsageError(useGitHubCopilotUsageStore.getState());

      expect(error).toBe(errorMessage);
    });
  });

  describe('getGitHubCopilotUsageData helper', () => {
    it('should initialize if not initialized and return data', async () => {
      mockFetchGitHubCopilotUsage.mockResolvedValue(mockUsageData);

      const { getGitHubCopilotUsageData } = await import('./github-copilot-usage-store');
      const data = await getGitHubCopilotUsageData();

      expect(data).toEqual(mockUsageData);
      expect(useGitHubCopilotUsageStore.getState().isInitialized).toBe(true);
    });

    it('should return existing data if already initialized', async () => {
      useGitHubCopilotUsageStore.setState({
        usageData: mockUsageData,
        isInitialized: true,
      });

      const { getGitHubCopilotUsageData } = await import('./github-copilot-usage-store');
      const data = await getGitHubCopilotUsageData();

      expect(data).toEqual(mockUsageData);
      expect(fetchGitHubCopilotUsage).not.toHaveBeenCalled();
    });
  });
});

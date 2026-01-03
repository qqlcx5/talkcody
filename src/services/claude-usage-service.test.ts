// src/services/claude-usage-service.test.ts
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ClaudeUsageData } from './claude-usage-service';
import {
  fetchClaudeUsage,
  getTimeUntilReset,
  getUsageLevel,
  getRemainingPercentage,
} from './claude-usage-service';

// Mock getClaudeOAuthAccessToken
vi.mock('@/providers/oauth/claude-oauth-store', () => ({
  getClaudeOAuthAccessToken: vi.fn(),
}));

// Get the mocked function
const { getClaudeOAuthAccessToken } = await import('@/providers/oauth/claude-oauth-store');
const mockGetClaudeOAuthAccessToken = getClaudeOAuthAccessToken as Mock;

// Mock fetch
global.fetch = vi.fn();

describe('claude-usage-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchClaudeUsage', () => {
    const mockAccessToken = 'mock-access-token-123';
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

    it('should fetch usage data successfully', async () => {
      // Arrange
      mockGetClaudeOAuthAccessToken.mockResolvedValue(mockAccessToken);
      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        json: async () => mockUsageData,
      });

      // Act
      const result = await fetchClaudeUsage();

      // Assert
      expect(result).toEqual(mockUsageData);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/api/oauth/usage',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${mockAccessToken}`,
            'anthropic-beta': 'oauth-2025-04-20',
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should throw error when no access token is available', async () => {
      // Arrange
      mockGetClaudeOAuthAccessToken.mockResolvedValue(null);

      // Act & Assert
      await expect(fetchClaudeUsage()).rejects.toThrow(
        'No Claude OAuth access token available. Please sign in first.'
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should throw error when API request fails', async () => {
      // Arrange
      mockGetClaudeOAuthAccessToken.mockResolvedValue(mockAccessToken);
      (global.fetch as Mock).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      // Act & Assert
      await expect(fetchClaudeUsage()).rejects.toThrow(
        'Failed to fetch Claude usage: 401 Unauthorized'
      );
    });

    it('should handle network errors', async () => {
      // Arrange
      mockGetClaudeOAuthAccessToken.mockResolvedValue(mockAccessToken);
      (global.fetch as Mock).mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(fetchClaudeUsage()).rejects.toThrow('Network error');
    });

    it('should handle missing optional fields in response', async () => {
      // Arrange
      const minimalData = {
        five_hour: {
          utilization_pct: 45.5,
          reset_at: '2026-01-02T12:00:00Z',
        },
        seven_day: {
          utilization_pct: 60.0,
        },
      };

      mockGetClaudeOAuthAccessToken.mockResolvedValue(mockAccessToken);
      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        json: async () => minimalData,
      });

      // Act
      const result = await fetchClaudeUsage();

      // Assert
      expect(result).toEqual(minimalData);
      expect(result.seven_day_sonnet).toBeUndefined();
      expect(result.seven_day_opus).toBeUndefined();
      expect(result.extra_usage).toBeUndefined();
    });
  });

  describe('getTimeUntilReset', () => {
    it('should return hours and minutes for future reset time', () => {
      const now = new Date('2026-01-02T10:00:00Z');
      vi.setSystemTime(now);

      const resetAt = '2026-01-02T12:30:00Z';
      const result = getTimeUntilReset(resetAt);

      expect(result).toBe('2h 30m');

      vi.useRealTimers();
    });

    it('should return only minutes when less than 1 hour', () => {
      const now = new Date('2026-01-02T10:00:00Z');
      vi.setSystemTime(now);

      const resetAt = '2026-01-02T10:45:00Z';
      const result = getTimeUntilReset(resetAt);

      expect(result).toBe('45m');

      vi.useRealTimers();
    });

    it('should return "Resetting..." for past time', () => {
      const now = new Date('2026-01-02T12:00:00Z');
      vi.setSystemTime(now);

      const resetAt = '2026-01-02T10:00:00Z';
      const result = getTimeUntilReset(resetAt);

      expect(result).toBe('Resetting...');

      vi.useRealTimers();
    });

    it('should handle exact reset time', () => {
      const now = new Date('2026-01-02T12:00:00Z');
      vi.setSystemTime(now);

      const resetAt = '2026-01-02T12:00:00Z';
      const result = getTimeUntilReset(resetAt);

      expect(result).toBe('Resetting...');

      vi.useRealTimers();
    });
  });

  describe('getUsageLevel', () => {
    it('should return "low" for usage below 50%', () => {
      expect(getUsageLevel(0)).toBe('low');
      expect(getUsageLevel(25)).toBe('low');
      expect(getUsageLevel(49.9)).toBe('low');
    });

    it('should return "medium" for usage between 50-75%', () => {
      expect(getUsageLevel(50)).toBe('medium');
      expect(getUsageLevel(60)).toBe('medium');
      expect(getUsageLevel(74.9)).toBe('medium');
    });

    it('should return "high" for usage between 75-90%', () => {
      expect(getUsageLevel(75)).toBe('high');
      expect(getUsageLevel(80)).toBe('high');
      expect(getUsageLevel(89.9)).toBe('high');
    });

    it('should return "critical" for usage >= 90%', () => {
      expect(getUsageLevel(90)).toBe('critical');
      expect(getUsageLevel(95)).toBe('critical');
      expect(getUsageLevel(100)).toBe('critical');
    });
  });

  describe('getRemainingPercentage', () => {
    it('should calculate remaining percentage correctly', () => {
      expect(getRemainingPercentage(0)).toBe(100);
      expect(getRemainingPercentage(25)).toBe(75);
      expect(getRemainingPercentage(50)).toBe(50);
      expect(getRemainingPercentage(75)).toBe(25);
      expect(getRemainingPercentage(100)).toBe(0);
    });

    it('should handle edge cases', () => {
      expect(getRemainingPercentage(0.1)).toBe(99.9);
      expect(getRemainingPercentage(99.9)).toBe(0.1);
    });

    it('should handle negative values (clamped to 100)', () => {
      expect(getRemainingPercentage(-10)).toBe(110);
    });

    it('should handle values over 100 (clamped to 0)', () => {
      expect(getRemainingPercentage(110)).toBe(-10);
    });
  });
});

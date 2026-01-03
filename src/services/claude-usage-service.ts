// src/services/claude-usage-service.ts
// Service for fetching Claude subscription usage data via OAuth API

import { logger } from '@/lib/logger';
import { simpleFetch } from '@/lib/tauri-fetch';
import { CLAUDE_OAUTH_BETA_HEADERS } from '@/providers/oauth/claude-oauth-service';
import { getClaudeOAuthAccessToken } from '@/providers/oauth/claude-oauth-store';

/**
 * Claude OAuth Usage API endpoint
 */
const CLAUDE_USAGE_API_URL = 'https://api.anthropic.com/api/oauth/usage';

/**
 * API response structure (different from our internal structure)
 */
interface ClaudeApiUsageWindow {
  utilization: number; // 0-100
  resets_at?: string; // ISO 8601 timestamp
}

interface ClaudeApiExtraUsage {
  is_enabled: boolean;
  monthly_limit: number | null;
  used_credits: number | null;
  utilization: number | null;
}

interface ClaudeApiResponse {
  five_hour: ClaudeApiUsageWindow;
  seven_day: ClaudeApiUsageWindow;
  seven_day_sonnet?: ClaudeApiUsageWindow | null;
  seven_day_opus?: ClaudeApiUsageWindow | null;
  seven_day_oauth_apps?: ClaudeApiUsageWindow | null;
  extra_usage?: ClaudeApiExtraUsage;
  iguana_necktie?: unknown;
}

/**
 * Usage window data structure (internal)
 */
export interface ClaudeUsageWindow {
  utilization_pct: number; // 0-100
  reset_at?: string; // ISO 8601 timestamp
}

/**
 * Extra usage (monthly spend) data structure (internal)
 */
export interface ClaudeExtraUsage {
  current_spending: number; // USD
  budget_limit: number; // USD
}

/**
 * Complete Claude usage data from OAuth API
 */
export interface ClaudeUsageData {
  five_hour: ClaudeUsageWindow;
  seven_day: ClaudeUsageWindow;
  seven_day_sonnet?: ClaudeUsageWindow;
  seven_day_opus?: ClaudeUsageWindow;
  extra_usage?: ClaudeExtraUsage;
  rate_limit_tier?: string; // Max, Pro, Team, Enterprise
}

/**
 * Fetch Claude usage data from OAuth API
 *
 * @returns Claude usage data including session, weekly, and model-specific usage
 * @throws Error if not authenticated or API call fails
 */
export async function fetchClaudeUsage(): Promise<ClaudeUsageData> {
  try {
    // Get valid OAuth access token (will auto-refresh if needed)
    const accessToken = await getClaudeOAuthAccessToken();

    if (!accessToken) {
      throw new Error(
        'Claude OAuth not connected. Please connect your Claude account in settings.'
      );
    }

    logger.info('[ClaudeUsage] Fetching usage data');

    // Call OAuth Usage API
    const response = await simpleFetch(CLAUDE_USAGE_API_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'anthropic-beta': CLAUDE_OAUTH_BETA_HEADERS,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[ClaudeUsage] API error:', response.status, errorText);
      throw new Error(`Claude Usage API error: ${response.status} - ${errorText}`);
    }

    const apiData = (await response.json()) as ClaudeApiResponse;

    // Log full response for debugging
    logger.info('[ClaudeUsage] Raw API response:', JSON.stringify(apiData, null, 2));

    // Transform API response to internal format
    const transformWindow = (
      window: ClaudeApiUsageWindow | null | undefined
    ): ClaudeUsageWindow | undefined => {
      if (!window) return undefined;
      return {
        utilization_pct: window.utilization,
        reset_at: window.resets_at,
      };
    };

    const data: ClaudeUsageData = {
      five_hour: transformWindow(apiData.five_hour)!,
      seven_day: transformWindow(apiData.seven_day)!,
      seven_day_sonnet: transformWindow(apiData.seven_day_sonnet),
      seven_day_opus: transformWindow(apiData.seven_day_opus),
      rate_limit_tier: undefined, // API doesn't return this field
    };

    // Transform extra_usage if present and enabled
    if (apiData.extra_usage?.is_enabled && apiData.extra_usage.monthly_limit !== null) {
      data.extra_usage = {
        current_spending: apiData.extra_usage.used_credits ?? 0,
        budget_limit: apiData.extra_usage.monthly_limit,
      };
    }

    logger.info('[ClaudeUsage] Usage data fetched successfully', {
      fiveHour: data.five_hour?.utilization_pct,
      sevenDay: data.seven_day?.utilization_pct,
    });

    return data;
  } catch (error) {
    logger.error('[ClaudeUsage] Failed to fetch usage:', error);
    throw error;
  }
}

/**
 * Calculate time remaining until reset
 *
 * @param resetAt ISO 8601 timestamp
 * @returns Human-readable time remaining string
 */
export function getTimeUntilReset(resetAt: string): string {
  const resetTime = new Date(resetAt).getTime();
  const now = Date.now();
  const diffMs = resetTime - now;

  if (diffMs <= 0) {
    return 'Resetting soon...';
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Get usage level indicator
 *
 * @param utilizationPct Usage percentage (0-100)
 * @returns 'low' | 'medium' | 'high' | 'critical'
 */
export function getUsageLevel(utilizationPct: number): 'low' | 'medium' | 'high' | 'critical' {
  if (utilizationPct < 50) return 'low';
  if (utilizationPct < 75) return 'medium';
  if (utilizationPct < 90) return 'high';
  return 'critical';
}

/**
 * Calculate remaining percentage
 *
 * @param utilizationPct Usage percentage (0-100)
 * @returns Remaining percentage (0-100)
 */
export function getRemainingPercentage(utilizationPct: number): number {
  return Math.max(0, 100 - utilizationPct);
}

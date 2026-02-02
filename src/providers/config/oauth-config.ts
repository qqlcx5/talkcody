// src/providers/config/oauth-config.ts
// OAuth Provider Configuration Registry
// Centralized management of OAuth provider metadata

import type { OAuthConfig } from '@/providers/core/provider-utils';

/**
 * OAuth Provider Metadata
 * Defines how to access OAuth configuration for each provider
 */
export interface OAuthProviderMetadata {
  providerId: string;
  tokenKey: keyof OAuthConfig; // Token field name in OAuthConfig
}

/**
 * OAuth Providers Registry
 * Maps provider IDs to their OAuth configuration metadata
 *
 * When adding a new OAuth provider:
 * 1. Add entry here with providerId and isConnectedKey
 * 2. Add corresponding hook in use-oauth-status.ts
 * 3. Add component mapping in oauth-provider-input.tsx
 * 4. Add isConnected field in OAuthConfig type (provider-utils.ts)
 */
export const OAUTH_PROVIDERS_MAP: Record<string, OAuthProviderMetadata> = {
  anthropic: {
    providerId: 'anthropic',
    tokenKey: 'anthropicIsConnected',
  },
  openai: {
    providerId: 'openai',
    tokenKey: 'openaiIsConnected',
  },
  qwen_code: {
    providerId: 'qwen_code',
    tokenKey: 'qwenIsConnected',
  },
  github_copilot: {
    providerId: 'github_copilot',
    tokenKey: 'githubCopilotIsConnected',
  },
} as const;

/**
 * Check if a provider supports OAuth authentication
 */
export function isOAuthProvider(providerId: string): boolean {
  return providerId in OAUTH_PROVIDERS_MAP;
}

/**
 * Check if OAuth is connected for a provider
 * Returns false if provider doesn't support OAuth or is not connected
 */
export function isOAuthConnected(providerId: string, oauthConfig?: OAuthConfig): boolean {
  const metadata = OAUTH_PROVIDERS_MAP[providerId];
  if (!metadata || !oauthConfig) {
    return false;
  }

  return !!oauthConfig[metadata.tokenKey];
}

/**
 * @deprecated Use isOAuthConnected instead. Tokens are now managed by the Rust backend.
 * Kept for backward compatibility with existing code.
 */
export function getOAuthToken(
  _providerId: string,
  _oauthConfig?: OAuthConfig
): string | null | undefined {
  // Tokens are now managed internally by the Rust backend
  return undefined;
}

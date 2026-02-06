/**
 * API key based rate limiting.
 * Tracks requests by API key instead of IP.
 */

import { checkRateLimit, getRateLimitHeaders, type RateLimitConfig, type RateLimitResult } from './rate-limit';

interface ApiKeyRateLimitEntry {
  timestamps: number[];
  createdAt: number;
}

const apiKeyRateLimitStore = new Map<string, ApiKeyRateLimitEntry>();

const CLEANUP_INTERVAL = 5 * 60 * 1000;

if (typeof global !== 'undefined') {
  (global as any).__apiKeyRateLimitCleanupStarted ??= setInterval(() => {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000;

    for (const [key, entry] of apiKeyRateLimitStore.entries()) {
      if (now - entry.createdAt > maxAge) {
        apiKeyRateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}

export interface ApiKeyRateLimitConfig {
  limit: number;
  window: number;
}

export function checkApiKeyRateLimit(
  apiKey: string,
  config: ApiKeyRateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.window;

  let entry = apiKeyRateLimitStore.get(apiKey);

  if (!entry) {
    entry = { timestamps: [now], createdAt: now };
    apiKeyRateLimitStore.set(apiKey, entry);
    return {
      allowed: true,
      limit: config.limit,
      current: 1,
      remaining: config.limit - 1,
      resetAt: now + config.window,
    };
  }

  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  const current = entry.timestamps.length;
  if (current >= config.limit) {
    const oldestTimestamp = entry.timestamps[0];
    const retryAfter = Math.ceil((oldestTimestamp + config.window - now) / 1000);

    return {
      allowed: false,
      limit: config.limit,
      current,
      remaining: 0,
      resetAt: oldestTimestamp + config.window,
      retryAfter: Math.max(1, retryAfter),
    };
  }

  entry.timestamps.push(now);
  const remaining = config.limit - entry.timestamps.length;

  return {
    allowed: true,
    limit: config.limit,
    current: entry.timestamps.length,
    remaining,
    resetAt: now + config.window,
  };
}

export { getRateLimitHeaders };

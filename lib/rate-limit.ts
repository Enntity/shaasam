/**
 * In-memory rate limiter using sliding window approach.
 * Suitable for single-instance deployments.
 * For distributed systems, upgrade to Redis-based solution.
 */

interface RateLimitEntry {
  timestamps: number[];
  createdAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL = 5 * 60 * 1000; // Clean old entries every 5 minutes

// Start cleanup interval
if (typeof global !== 'undefined') {
  (global as any).__rateLimitCleanupStarted ??= setInterval(() => {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // Keep entries for 1 hour

    for (const [key, entry] of rateLimitStore.entries()) {
      if (now - entry.createdAt > maxAge) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Time window in milliseconds */
  window: number;
  /** Optional: custom key generator (defaults to IP) */
  keyGenerator?: (request: Request) => string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  current: number;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Check if request is within rate limit.
 * Returns result with headers ready for response.
 */
export function checkRateLimit(
  request: Request,
  config: RateLimitConfig
): RateLimitResult {
  const key = config.keyGenerator
    ? config.keyGenerator(request)
    : getClientIp(request);

  const now = Date.now();
  const windowStart = now - config.window;

  let entry = rateLimitStore.get(key);

  // Initialize or reset if window is old
  if (!entry) {
    entry = { timestamps: [now], createdAt: now };
    rateLimitStore.set(key, entry);
    return {
      allowed: true,
      limit: config.limit,
      current: 1,
      remaining: config.limit - 1,
      resetAt: now + config.window,
    };
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  // Check if limit exceeded
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

  // Add current request
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

/**
 * Extract client IP from request headers.
 * Checks multiple header sources for proxy support.
 */
function getClientIp(request: Request): string {
  const headers = request.headers;

  // Check common proxy headers
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  const cfConnectingIp = headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Fallback to a generic identifier (only in dev/testing)
  return 'unknown';
}

/**
 * Apply rate limit and return headers for response.
 */
export function getRateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Current': String(result.current),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
  };

  if (result.retryAfter) {
    headers['Retry-After'] = String(result.retryAfter);
  }

  return headers;
}

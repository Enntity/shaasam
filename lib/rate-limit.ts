import { createHash } from 'node:crypto';
import { getDb } from './mongodb';
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


export async function consumeQuota(key: string, config: { limit: number; window: number }): Promise<RateLimitResult> {
  const now = Date.now();
  const resetAt = (Math.floor(now / config.window) + 1) * config.window;
  const bucket = createHash('sha256').update(`${key}:${config.limit}:${config.window}:${resetAt}`).digest('hex');
  const db = await getDb();
  try {
    await db.collection('rate_limits').updateOne({ bucket }, {
      $setOnInsert: { expiresAt: new Date(resetAt + config.window) }, $inc: { count: 1 },
    }, { upsert: true });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    await db.collection('rate_limits').updateOne({ bucket }, { $inc: { count: 1 } });
  }
  const entry = await db.collection('rate_limits').findOne({ bucket });
  const current = entry?.count || config.limit + 1;
  return { allowed: current <= config.limit, current, limit: config.limit,
    remaining: Math.max(0, config.limit - current), resetAt,
    ...(current > config.limit ? { retryAfter: Math.ceil((resetAt - now) / 1000) } : {}) };
}

export async function checkRateLimit(request: Request, config: RateLimitConfig): Promise<RateLimitResult> {
  // App must be reachable only through the configured proxy, which overwrites X-Real-IP.
  // Without that explicit trust, use one conservative bucket; never trust arbitrary forwarding headers.
  const ip = process.env.TRUST_PROXY === 'true' ? request.headers.get('x-real-ip') || 'unknown' : 'unknown';
  const key = config.keyGenerator ? config.keyGenerator(request) : `${new URL(request.url).pathname}:${ip}`;
  return consumeQuota(key, config);
}

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

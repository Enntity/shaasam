import { createHash, timingSafeEqual } from 'node:crypto';

export function getApiKey(request: Request): string {
  return request.headers.get('x-api-key') || request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
}

export function keyMatches(provided: string, expected: string): boolean {
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return Boolean(provided && expected) && timingSafeEqual(hash(provided), hash(expected));
}

// Stable IDs preserve ownership across key rotation. Never use requester display text as identity.
export function getAgentId(request: Request): string | null {
  const provided = getApiKey(request);
  if (!provided) return null;
  if (process.env.SHAASAM_AGENT_KEYS) {
    try {
      const keys: unknown = JSON.parse(process.env.SHAASAM_AGENT_KEYS);
      if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return null;
      for (const [id, key] of Object.entries(keys)) {
        if (/^[a-zA-Z0-9_-]{1,64}$/.test(id) && typeof key === 'string' && (process.env.NODE_ENV !== 'production' || key.length >= 32) && keyMatches(provided, key)) return id;
      }
    } catch { return null; }
    return null;
  }
  if (process.env.NODE_ENV === 'production') return null;
  return keyMatches(provided, process.env.SHAASAM_API_KEY || '') ? 'legacy' : null;
}

export function isValidApiKey(request: Request): boolean {
  return getAgentId(request) !== null;
}

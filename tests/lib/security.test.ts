import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAllowedOrigin } from '@/lib/origin';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAgentId } from '@/lib/api-key';
import { configurationErrors } from '@/lib/readiness';
afterEach(() => vi.unstubAllEnvs());
describe('security configuration', () => {
  it('rejects hostile Origin even with allowed Referer and rejects Host-derived origins', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('SITE_URL', 'https://shaasam.test');
    expect(isAllowedOrigin(new Request('https://shaasam.test/api/profile', { headers: { origin: 'https://evil.test', referer: 'https://shaasam.test/' } }))).toBe(false);
    expect(isAllowedOrigin(new Request('https://evil.test/api/profile', { headers: { origin: 'https://evil.test' } }))).toBe(false);
    expect(isAllowedOrigin(new Request('https://shaasam.test/api/profile', { headers: { origin: 'https://shaasam.test' } }))).toBe(true);
    expect(isAllowedOrigin(new Request('https://shaasam.test/api/profile', { headers: { origin: 'http://localhost:3000' } }))).toBe(false);
  });
  it('keeps identity stable across key rotation and revokes the old key', () => {
    vi.stubEnv('SHAASAM_AGENT_KEYS', JSON.stringify({ acme: 'old-secret' }));
    const req = (key: string) => new Request('https://test', { headers: { authorization: `Bearer ${key}` } });
    expect(getAgentId(req('old-secret'))).toBe('acme');
    vi.stubEnv('SHAASAM_AGENT_KEYS', JSON.stringify({ acme: 'new-secret' }));
    expect(getAgentId(req('old-secret'))).toBeNull(); expect(getAgentId(req('new-secret'))).toBe('acme');
  });
  it('fails closed on malformed agent key configuration', () => {
    vi.stubEnv('SHAASAM_AGENT_KEYS', '{broken');
    expect(getAgentId(new Request('https://test', { headers: { 'x-api-key': 'test-api-key' } }))).toBeNull();
  });
  it('does not let forged forwarding headers create new quota buckets', async () => {
    vi.stubEnv('TRUST_PROXY', 'false');
    const responses = await Promise.all(Array.from({ length: 8 }, (_, n) => checkRateLimit(new Request('https://test/auth', { headers: { 'x-forwarded-for': `1.2.3.${n}` } }), { limit: 2, window: 60000 })));
    expect(responses.filter(r => r.allowed).length).toBeLessThanOrEqual(2);
    expect((await checkRateLimit(new Request('https://test/auth'), { limit: 2, window: 60000 })).allowed).toBe(false);
  });
  it('reports missing production payment, auth and origin configuration', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('AUTH_SECRET', 'short'); vi.stubEnv('SITE_URL', '');
    expect(configurationErrors()).toEqual(expect.arrayContaining(['AUTH_SECRET', 'SITE_URL', 'STRIPE_SECRET_KEY', 'SHAASAM_AGENT_KEYS']));
  });
});

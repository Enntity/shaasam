import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('health', () => {
  it('returns ok true', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.time).toBeDefined();
  });
});

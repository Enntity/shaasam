import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/auth/start/route';
import { getDb } from '@/lib/mongodb';
import { jsonRequest } from '@/tests/helpers';

describe('auth start', () => {
  it('rejects invalid phone', async () => {
    const res = await POST(jsonRequest('http://test/api/auth/start', { phone: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('creates verification record', async () => {
    const res = await POST(
      jsonRequest('http://test/api/auth/start', { phone: '+1 (415) 555-0123' })
    );
    expect(res.status).toBe(200);
    const db = await getDb();
    const record = await db
      .collection('verifications')
      .findOne({ phone: '+14155550123' });
    expect(record).toBeTruthy();
  });
});

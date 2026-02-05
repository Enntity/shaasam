import { describe, expect, it, vi } from 'vitest';
import { hashOtp } from '@/lib/otp';
import { getDb } from '@/lib/mongodb';
import { jsonRequest } from '@/tests/helpers';

const cookieStore = {
  set: vi.fn(),
  get: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
}));

import { POST } from '@/app/api/auth/verify/route';

describe('auth verify', () => {
  it('verifies a code and sets cookie', async () => {
    const db = await getDb();
    const code = '123456';
    const { hash, salt } = hashOtp(code);
    await db.collection('verifications').insertOne({
      phone: '+14155550123',
      hash,
      salt,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt: new Date(),
      attempts: 0,
    });

    const res = await POST(
      jsonRequest('http://test/api/auth/verify', { phone: '+1 415 555 0123', code })
    );

    expect(res.status).toBe(200);
    expect(cookieStore.set).toHaveBeenCalled();
  });
});

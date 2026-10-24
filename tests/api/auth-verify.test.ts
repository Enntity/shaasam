import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => vi.unstubAllEnvs());

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
  it('does not accept a locally hashed OTP in production without restricted Verify credentials', async () => {
    const db = await getDb();
    const { hash, salt } = hashOtp('123456');
    await db.collection('verifications').insertOne({ phone: '+14155550123', hash, salt,
      expiresAt: new Date(Date.now() + 600000), attempts: 0 });
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TWILIO_API_KEY_SID', '');
    cookieStore.set.mockClear();
    const res = await POST(jsonRequest('http://test/api/auth/verify', { phone: '+14155550123', code: '123456' }, { headers: { origin: 'http://test' } }));
    expect(res.status).toBe(500);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

});

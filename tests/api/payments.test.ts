import { describe, expect, it } from 'vitest';
import { POST as createIntent } from '@/app/api/payments/intent/route';
import { withApiKey, jsonRequest } from '@/tests/helpers';

function makeRequest() {
  return jsonRequest(
    'http://test/api/payments/intent',
    { amount: 100, currency: 'usd', humanId: '507f1f77bcf86cd799439011' },
    { headers: withApiKey() }
  );
}

describe('payments', () => {
  it('returns 501 when stripe is not configured', async () => {
    const res = await createIntent(makeRequest());
    expect(res.status).toBe(501);
  });
});

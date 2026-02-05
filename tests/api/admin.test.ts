import { describe, expect, it } from 'vitest';
import { GET as getUsers } from '@/app/api/admin/users/route';
import { POST as reviewUser } from '@/app/api/admin/users/[id]/review/route';
import { getDb } from '@/lib/mongodb';
import { withAdminKey, jsonRequest } from '@/tests/helpers';

function makeRequest(url: string, headers: HeadersInit = {}) {
  return new Request(url, { headers }) as any;
}

describe('admin', () => {
  it('rejects missing admin key', async () => {
    const res = await getUsers(makeRequest('http://test/api/admin/users'));
    expect(res.status).toBe(401);
  });

  it('lists users and updates review status', async () => {
    const db = await getDb();
    const result = await db.collection('users').insertOne({
      phone: '+14155550123',
      verified: true,
      status: 'active',
      reviewStatus: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const listRes = await getUsers(
      makeRequest('http://test/api/admin/users?reviewStatus=pending', withAdminKey())
    );
    expect(listRes.status).toBe(200);
    const listPayload = await listRes.json();
    expect(listPayload.data.length).toBe(1);

    const reviewRes = await reviewUser(
      jsonRequest(
        `http://test/api/admin/users/${result.insertedId.toString()}/review`,
        { reviewStatus: 'approved', status: 'active' },
        { headers: withAdminKey() }
      ),
      { params: Promise.resolve({ id: result.insertedId.toString() }) }
    );
    expect(reviewRes.status).toBe(200);
    const reviewPayload = await reviewRes.json();
    expect(reviewPayload.reviewStatus).toBe('approved');
  });
});

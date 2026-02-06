import { describe, expect, it, vi } from 'vitest';
import { getDb } from '@/lib/mongodb';
import { jsonRequest } from '@/tests/helpers';

vi.mock('@/lib/auth', () => ({
  getSessionUser: vi.fn(),
}));

import { GET, POST } from '@/app/api/profile/route';
import { getSessionUser } from '@/lib/auth';

const mockedGetSessionUser = getSessionUser as unknown as ReturnType<typeof vi.fn>;

describe('profile', () => {
  it('rejects unauthenticated users', async () => {
    mockedGetSessionUser.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('updates profile for authenticated users', async () => {
    const db = await getDb();
    const user = await db.collection('users').insertOne({
      phone: '+14155550123',
      verified: true,
      status: 'active',
      reviewStatus: 'approved',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockedGetSessionUser.mockResolvedValueOnce({
      id: user.insertedId.toString(),
      phone: '+14155550123',
    });

    const res = await POST(
      jsonRequest('http://test/api/profile', {
        fullName: 'Rina Tan',
        alias: 'rina-t',
        about: 'Prompt engineering and evaluations.',
        skills: ['Prompt engineering'],
        hourlyRate: 90,
      })
    );

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.alias).toBe('rina-t');
    expect(payload.skills).toContain('Prompt engineering');
    expect(payload.categories).toContain('Prompting');
  });
});

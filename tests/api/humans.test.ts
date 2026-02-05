import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/humans/route';
import { getDb } from '@/lib/mongodb';
import { withApiKey } from '@/tests/helpers';

function makeRequest(url: string, headers: HeadersInit = {}) {
  return new Request(url, { headers }) as any;
}

describe('humans search', () => {
  it('requires api key when configured', async () => {
    const res = await GET(makeRequest('http://test/api/humans'));
    expect(res.status).toBe(401);
  });

  it('returns matching humans', async () => {
    const db = await getDb();
    await db.collection('users').insertMany([
      {
        phone: '+14155550123',
        verified: true,
        status: 'active',
        reviewStatus: 'approved',
        displayName: 'Rina T.',
        skills: ['Prompting', 'Research'],
        skillsNormalized: ['prompting', 'research'],
        categories: ['Prompting'],
        categoriesNormalized: ['prompting'],
        hourlyRate: 80,
        availability: 'now',
        updatedAt: new Date(),
      },
      {
        phone: '+14155550124',
        verified: true,
        status: 'active',
        reviewStatus: 'approved',
        displayName: 'Kade M.',
        skills: ['Design'],
        skillsNormalized: ['design'],
        categories: ['Design'],
        categoriesNormalized: ['design'],
        hourlyRate: 120,
        availability: 'weekdays',
        updatedAt: new Date(),
      },
    ]);

    const res = await GET(
      makeRequest(
        'http://test/api/humans?skills=prompting&categories=prompting&includeScores=true',
        withApiKey()
      )
    );
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.data.length).toBe(1);
    expect(payload.data[0].displayName).toBe('Rina T.');
    expect(payload.data[0].score).toBeTypeOf('number');
  });
});

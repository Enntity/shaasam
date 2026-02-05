import { describe, expect, it } from 'vitest';
import { GET, POST } from '@/app/api/requests/route';
import { withApiKey, jsonRequest } from '@/tests/helpers';

function makeGet(url: string, headers: HeadersInit = {}) {
  return new Request(url, { headers }) as any;
}

describe('requests', () => {
  it('creates a request', async () => {
    const res = await POST(
      jsonRequest(
        'http://test/api/requests',
        {
          title: 'Need help',
          description: 'Debug a flaky test',
          skills: ['node'],
        },
        { headers: withApiKey() }
      )
    );
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.id).toBeDefined();
  });

  it('lists requests', async () => {
    await POST(
      jsonRequest(
        'http://test/api/requests',
        { title: 'Task', description: 'Do stuff', skills: [] },
        { headers: withApiKey() }
      )
    );

    const res = await GET(makeGet('http://test/api/requests', withApiKey()));
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.data.length).toBeGreaterThan(0);
  });
});

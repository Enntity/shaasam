import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { getAgentId } from '@/lib/api-key';
import { requestView } from '@/lib/requests';
import { failure } from '@/lib/http';
import { checkApiKeyRateLimit, getRateLimitHeaders } from '@/lib/api-key-rate-limit';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ownerId = getAgentId(request);
  if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    const limit = await checkApiKeyRateLimit(`${ownerId}:read`, { limit: 120, window: 60000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429, headers: getRateLimitHeaders(limit) });
    const db = await getDb();
    const item = await db.collection('requests').findOne({ _id: new ObjectId(id), ownerId });
    return item ? NextResponse.json(requestView(item)) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) { return failure(error); }
}

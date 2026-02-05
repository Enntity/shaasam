import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { isValidAdminKey } from '@/lib/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isValidAdminKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const reviewStatus = url.searchParams.get('reviewStatus');
  const status = url.searchParams.get('status');
  const limit = Math.min(Number(url.searchParams.get('limit') || 25), 100);

  const query: Record<string, unknown> = {};
  if (reviewStatus) query.reviewStatus = reviewStatus;
  if (status) query.status = status;

  const db = await getDb();
  const users = await db
    .collection('users')
    .find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .project({ phone: 0, skillsNormalized: 0, categoriesNormalized: 0 })
    .toArray();

  return NextResponse.json({
    data: users.map((user) => ({
      id: user._id.toString(),
      displayName: user.displayName,
      email: user.email,
      headline: user.headline,
      skills: user.skills || [],
      categories: user.categories || [],
      reviewStatus: user.reviewStatus,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })),
  });
}

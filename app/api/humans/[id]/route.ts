import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { isValidApiKey } from '@/lib/api-key';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isValidApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const db = await getDb();
  const requireReview =
    process.env.REQUIRE_REVIEW === 'true' || process.env.NODE_ENV === 'production';
  const query: Record<string, unknown> = {
    _id: new ObjectId(id),
    verified: true,
    status: 'active',
  };
  if (requireReview) {
    query.reviewStatus = 'approved';
  }

  const human = await db.collection('users').findOne(query);
  if (!human) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: human._id.toString(),
    displayName: human.displayName,
    headline: human.headline,
    bio: human.bio,
    skills: human.skills || [],
    categories: human.categories || [],
    hourlyRate: human.hourlyRate,
    location: human.location,
    availability: human.availability,
    updatedAt: human.updatedAt,
  });
}

import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';

export const runtime = 'nodejs';

function requireApproved(user: { reviewStatus?: string; status?: string }) {
  const requireReview =
    process.env.REQUIRE_REVIEW === 'true' || process.env.NODE_ENV === 'production';
  if (requireReview && user.reviewStatus !== 'approved') {
    return { ok: false, error: 'Profile pending review.' };
  }
  if (user.status && user.status !== 'active') {
    return { ok: false, error: 'Account is not active.' };
  }
  return { ok: true };
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = await getDb();
  const user = await db.collection('users').findOne({ _id: new ObjectId(session.id) });
  if (!user) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  const gate = requireApproved(user);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 });
  }

  const userSkills = Array.isArray(user.skillsNormalized)
    ? user.skillsNormalized.map((skill: string) => String(skill).toLowerCase())
    : [];

  const skillFilter =
    userSkills.length > 0
      ? {
          $or: [
            { skillsNormalized: { $in: userSkills } },
            { skills: { $in: userSkills } },
            { skills: { $exists: false } },
            { skills: { $size: 0 } },
          ],
        }
      : {};

  const available = await db
    .collection('requests')
    .find({
      status: 'open',
      declinedBy: { $ne: user._id },
      ...skillFilter,
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  const mine = await db
    .collection('requests')
    .find({
      acceptedBy: user._id,
      status: { $in: ['accepted', 'in_progress', 'completed'] },
    })
    .sort({ updatedAt: -1 })
    .limit(50)
    .toArray();

  const mapRequest = (item: any) => ({
    id: item._id.toString(),
    title: item.title,
    description: item.description,
    skills: item.skills || [],
    budget: item.budget,
    requester: item.requester,
    status: item.status,
    acceptedAt: item.acceptedAt || null,
    startedAt: item.startedAt || null,
    completedAt: item.completedAt || null,
    createdAt: item.createdAt,
  });

  return NextResponse.json({
    available: available.map(mapRequest),
    mine: mine.map(mapRequest),
  });
}

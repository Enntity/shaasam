import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { normalizeCategories } from '@/lib/categories';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const MAX_SKILLS = 24;

function normalizeSkills(skills: unknown): { original: string[]; normalized: string[] } {
  if (!Array.isArray(skills)) {
    return { original: [], normalized: [] };
  }
  const cleaned = skills
    .map((skill) => String(skill).trim())
    .filter(Boolean)
    .slice(0, MAX_SKILLS);
  const normalized = Array.from(new Set(cleaned.map((skill) => skill.toLowerCase())));
  return { original: cleaned, normalized };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(user);
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
  const { original, normalized } = normalizeSkills(body?.skills);
  const { original: categoryOriginal, normalized: categoryNormalized } = normalizeCategories(
    body?.categories
  );

    const update = {
      email: body?.email ? String(body.email).slice(0, 160) : '',
      displayName: body?.displayName ? String(body.displayName).slice(0, 80) : '',
      headline: body?.headline ? String(body.headline).slice(0, 120) : '',
      bio: body?.bio ? String(body.bio).slice(0, 1200) : '',
      skills: original,
      skillsNormalized: normalized,
      categories: categoryOriginal,
      categoriesNormalized: categoryNormalized,
      hourlyRate: body?.hourlyRate ? Number(body.hourlyRate) : 0,
      location: body?.location ? String(body.location).slice(0, 120) : '',
      availability: body?.availability ? String(body.availability).slice(0, 32) : 'weekdays',
      updatedAt: new Date(),
    };

    const db = await getDb();
    const updated = await db
      .collection('users')
      .findOneAndUpdate(
        { _id: new ObjectId(user.id) },
        { $set: update },
        { returnDocument: 'after' }
      );

    const saved = updated?.value;
    if (!saved) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    await recordAudit({
      action: 'profile.update',
      actorType: 'human',
      actorId: user.id,
      subjectType: 'user',
      subjectId: user.id,
    });

    return NextResponse.json({
      id: saved._id.toString(),
      phone: saved.phone,
      email: saved.email,
      displayName: saved.displayName,
      headline: saved.headline,
      bio: saved.bio,
      skills: saved.skills || [],
      categories: saved.categories || [],
      hourlyRate: saved.hourlyRate,
      location: saved.location,
      availability: saved.availability,
      stripeAccountId: saved.stripeAccountId,
      reviewStatus: saved.reviewStatus,
      status: saved.status,
    });
  } catch (error) {
    console.error('Profile update failed', error);
    return NextResponse.json({ error: 'Unable to save profile.' }, { status: 500 });
  }
}

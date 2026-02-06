import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { validateAlias } from '@/lib/alias';
import { deriveCategoriesFromSkills, normalizeSkills } from '@/lib/skills';
import { recordAudit } from '@/lib/audit';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  // Rate limit: 100 requests per minute per IP
  const rateLimitResult = checkRateLimit(request, {
    limit: 100,
    window: 60 * 1000,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      {
        status: 429,
        headers: getRateLimitHeaders(rateLimitResult),
      }
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(user, {
    headers: getRateLimitHeaders(rateLimitResult),
  });
}

export async function POST(request: Request) {
  // Rate limit: 10 requests per minute per IP (strict for updates)
  const rateLimitResult = checkRateLimit(request, {
    limit: 10,
    window: 60 * 1000,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      {
        status: 429,
        headers: getRateLimitHeaders(rateLimitResult),
      }
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const fullName = body?.fullName ? String(body.fullName).trim().slice(0, 120) : '';
    if (!fullName) {
      return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });
    }

    const aliasCheck = validateAlias(body?.alias ? String(body.alias) : '');
    if (!aliasCheck.valid || !aliasCheck.normalized) {
      return NextResponse.json(
        { error: aliasCheck.reason || 'Alias is invalid.' },
        { status: 400 }
      );
    }

    const { original, normalized } = normalizeSkills(body?.skills);
    if (normalized.length === 0) {
      return NextResponse.json({ error: 'Select at least one skill.' }, { status: 400 });
    }

    const { categories, normalized: categoryNormalized } = deriveCategoriesFromSkills(original);
    const aliasNormalized = aliasCheck.normalized;
    const about = body?.about ? String(body.about).slice(0, 1200) : '';
    const rawRate = body?.hourlyRate ? Number(body.hourlyRate) : 0;
    const hourlyRate = Number.isFinite(rawRate) ? rawRate : 0;

    const update = {
      email: body?.email ? String(body.email).slice(0, 160) : '',
      fullName,
      alias: aliasNormalized,
      aliasNormalized,
      about,
      displayName: aliasNormalized,
      headline: '',
      bio: about,
      skills: original,
      skillsNormalized: normalized,
      categories,
      categoriesNormalized: categoryNormalized,
      hourlyRate,
      location: body?.location ? String(body.location).slice(0, 120) : '',
      availability: body?.availability ? String(body.availability).slice(0, 32) : 'weekdays',
      updatedAt: new Date(),
    };

    const db = await getDb();
    const aliasTaken = await db.collection('users').findOne({
      aliasNormalized,
      _id: { $ne: new ObjectId(user.id) },
    });
    if (aliasTaken) {
      return NextResponse.json({ error: 'Alias is already taken.' }, { status: 409 });
    }

    const updated = await db
      .collection('users')
      .findOneAndUpdate(
        { _id: new ObjectId(user.id) },
        { $set: update },
        { returnDocument: 'after' }
      );

    const saved =
      updated && 'value' in updated ? updated.value : updated;
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

    return NextResponse.json(
      {
        id: saved._id.toString(),
        phone: saved.phone,
        email: saved.email,
        fullName: saved.fullName,
        alias: saved.alias || saved.displayName,
        about: saved.about || saved.bio,
        skills: saved.skills || [],
        categories: saved.categories || [],
        hourlyRate: saved.hourlyRate,
        location: saved.location,
        availability: saved.availability,
        stripeAccountId: saved.stripeAccountId,
        reviewStatus: saved.reviewStatus,
        status: saved.status,
      },
      {
        headers: getRateLimitHeaders(rateLimitResult),
      }
    );
  } catch (error) {
    console.error('Profile update failed', error);
    return NextResponse.json({ error: 'Unable to save profile.' }, { status: 500 });
  }
}

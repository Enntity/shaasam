import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { isValidApiKey } from '@/lib/api-key';
import { normalizeCategories } from '@/lib/categories';

export const runtime = 'nodejs';

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseNumber(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function scoreHuman({
  human,
  q,
  skills,
  categories,
  availability,
  minRate,
  maxRate,
}: {
  human: any;
  q: string | undefined;
  skills: string[];
  categories: string[];
  availability: string | null;
  minRate: number;
  maxRate: number;
}) {
  let score = 0;

  if (skills.length && Array.isArray(human.skillsNormalized)) {
    const matchCount = human.skillsNormalized.filter((skill: string) =>
      skills.includes(skill)
    ).length;
    score += matchCount * 10;
  }

  if (categories.length && Array.isArray(human.categoriesNormalized)) {
    const matchCount = human.categoriesNormalized.filter((cat: string) =>
      categories.includes(cat)
    ).length;
    score += matchCount * 6;
  }

  if (availability && human.availability === availability) {
    score += 4;
  }

  if (q) {
    const safe = escapeRegex(q);
    const regex = new RegExp(safe, 'i');
    if (human.displayName && regex.test(human.displayName)) score += 6;
    if (human.headline && regex.test(human.headline)) score += 4;
    if (human.bio && regex.test(human.bio)) score += 2;
    if (Array.isArray(human.skills) && human.skills.some((skill: string) => regex.test(skill))) {
      score += 3;
    }
    if (
      Array.isArray(human.categories) &&
      human.categories.some((category: string) => regex.test(category))
    ) {
      score += 2;
    }
  }

  if (typeof human.hourlyRate === 'number') {
    const span = Math.max(maxRate - minRate, 1);
    const position = Math.min(Math.max(human.hourlyRate - minRate, 0), span);
    const rateScore = 4 * (1 - position / span);
    score += Math.max(0, rateScore);
  }

  if (human.updatedAt) {
    const updatedAt = new Date(human.updatedAt).getTime();
    if (!Number.isNaN(updatedAt)) {
      const hours = (Date.now() - updatedAt) / (1000 * 60 * 60);
      const freshness = Math.max(0, 6 - hours / 24);
      score += freshness;
    }
  }

  return Math.round(score * 100) / 100;
}

export async function GET(request: Request) {
  if (!isValidApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const qRaw = url.searchParams.get('q')?.trim();
  const q = qRaw && qRaw.length > 64 ? qRaw.slice(0, 64) : qRaw;
  const skillsParam = url.searchParams.get('skills');
  const categoriesParam = url.searchParams.get('categories');
  const availability = url.searchParams.get('availability');
  const minRate = parseNumber(url.searchParams.get('minRate'), 0);
  const maxRate = parseNumber(url.searchParams.get('maxRate'), 10000);
  const limit = Math.min(parseNumber(url.searchParams.get('limit'), 20), 50);
  const offset = Math.max(parseNumber(url.searchParams.get('offset'), 0), 0);
  const sort = url.searchParams.get('sort');
  const includeScores = url.searchParams.get('includeScores') === 'true';

  const skills = skillsParam
    ? skillsParam
        .split(',')
        .map((skill) => skill.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12)
    : [];

  const categories = categoriesParam
    ? normalizeCategories(categoriesParam).normalized.slice(0, 12)
    : [];

  const query: Record<string, unknown> = {
    verified: true,
    status: 'active',
  };

  const requireReview =
    process.env.REQUIRE_REVIEW === 'true' || process.env.NODE_ENV === 'production';
  if (requireReview) {
    query.reviewStatus = 'approved';
  }

  if (skills.length) {
    query.skillsNormalized = { $all: skills };
  }

  if (categories.length) {
    query.categoriesNormalized = { $all: categories };
  }

  if (availability) {
    query.availability = availability;
  }

  if (minRate || maxRate) {
    query.hourlyRate = { $gte: minRate, $lte: maxRate };
  }

  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    query.$or = [
      { displayName: regex },
      { headline: regex },
      { bio: regex },
      { skills: regex },
      { categories: regex },
    ];
  }

  const db = await getDb();
  const shouldScore =
    sort === 'score' || includeScores || q || skills.length || categories.length;
  const fetchLimit = Math.min(limit * 3, 100);

  const cursor = db
    .collection('users')
    .find(query)
    .sort({ updatedAt: -1 })
    .skip(offset)
    .limit(shouldScore ? fetchLimit : limit);

  const humans = await cursor
    .project({
      phone: 0,
      verified: 0,
    })
    .toArray();

  const withScores = shouldScore
    ? humans.map((human) => ({
        human,
        score: scoreHuman({
          human,
          q: q || undefined,
          skills,
          categories,
          availability,
          minRate,
          maxRate,
        }),
      }))
    : humans.map((human) => ({ human, score: null }));

  if (shouldScore) {
    withScores.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  const sliced = withScores.slice(0, limit);

  return NextResponse.json({
    data: sliced.map(({ human, score }) => ({
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
      score: includeScores ? score : undefined,
    })),
    meta: {
      count: sliced.length,
      limit,
      offset,
      sort: shouldScore ? 'score' : 'recent',
    },
  });
}

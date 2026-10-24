import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getDb } from '@/lib/mongodb';
import { getAgentId } from '@/lib/api-key';
import { recordAudit } from '@/lib/audit';
import { checkApiKeyRateLimit, getRateLimitHeaders } from '@/lib/api-key-rate-limit';
import { normalizeSkills } from '@/lib/skills';
import { failure, HttpError, readJson, textField } from '@/lib/http';
import { requestView } from '@/lib/requests';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const ownerId = getAgentId(request);
  if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const limit = await checkApiKeyRateLimit(`${ownerId}:create`, { limit: 30, window: 60000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429, headers: getRateLimitHeaders(limit) });
    const body = await readJson(request);
    const idempotencyKey = textField(request.headers.get('idempotency-key'), 'Idempotency-Key header', 128);
    const title = textField(body.title, 'title', 120);
    const description = textField(body.description, 'description', 2000);
    const acceptanceCriteria = textField(body.acceptanceCriteria, 'acceptanceCriteria', 2000);
    if (!Number.isSafeInteger(body.budgetCents) || body.budgetCents < 100 || body.budgetCents > 100000) throw new HttpError(400, 'budgetCents must be an integer from 100 to 100000 (USD).');
    if (!Number.isSafeInteger(body.durationMinutes) || body.durationMinutes < 1 || body.durationMinutes > 120) throw new HttpError(400, 'durationMinutes must be an integer from 1 to 120.');
    if (body.callbackUrl) throw new HttpError(400, 'Callbacks are disabled. Poll GET /api/requests/:id.');
    if (body.skills !== undefined && (!Array.isArray(body.skills) || body.skills.length > 12 || body.skills.some((s: unknown) => typeof s !== 'string' || normalizeSkills([s]).original.length !== 1))) throw new HttpError(400, 'Use up to 12 known skills from GET /api/skills, or [] for general tasks.');
    const skills = normalizeSkills(body.skills || []);
    const input = { title, description, acceptanceCriteria, budgetCents: body.budgetCents, durationMinutes: body.durationMinutes,
      skills: skills.original, skillsNormalized: skills.normalized,
      requester: { name: textField(body.requester?.name, 'requester.name', 120, false), org: textField(body.requester?.org, 'requester.org', 120, false) } };
    const feeBps = Number(process.env.SHAASAM_PLATFORM_FEE_BPS || 0);
    if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 3000) throw new HttpError(503, 'Pricing is unavailable.');
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const db = await getDb();
    try {
      await db.collection('requests').updateOne({ ownerId, idempotencyKey }, { $setOnInsert: {
        ...input, applicationFeeAmount: Math.round(body.budgetCents * feeBps / 10000), ownerId, idempotencyKey, fingerprint, status: 'open', currency: 'usd',
        declinedBy: [], createdAt: new Date(), updatedAt: new Date(),
      } }, { upsert: true });
    } catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
    const saved = await db.collection('requests').findOne({ ownerId, idempotencyKey });
    if (!saved || saved.fingerprint !== fingerprint) throw new HttpError(409, 'Idempotency key already used with different request details.');
    await recordAudit({ action: 'request.create', actorType: 'agent', actorId: ownerId, subjectType: 'request', subjectId: saved._id.toString() });
    return NextResponse.json(requestView(saved), { headers: getRateLimitHeaders(limit) });
  } catch (error) { return failure(error); }
}

export async function GET(request: Request) {
  const ownerId = getAgentId(request);
  if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const rate = await checkApiKeyRateLimit(`${ownerId}:read`, { limit: 120, window: 60000 });
    if (!rate.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429, headers: getRateLimitHeaders(rate) });
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    if (status && !['open', 'accepted', 'in_progress', 'completed', 'canceled'].includes(status)) throw new HttpError(400, 'Invalid status.');
    const limit = Number(url.searchParams.get('limit') || 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new HttpError(400, 'limit must be 1–50.');
    const db = await getDb();
    const results = await db.collection('requests').find({ ownerId, ...(status ? { status } : {}) }).sort({ createdAt: -1 }).limit(limit).toArray();
    return NextResponse.json({ data: results.map(requestView), meta: { count: results.length } });
  } catch (error) { return failure(error); }
}

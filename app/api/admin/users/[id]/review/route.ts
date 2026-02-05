import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { isValidAdminKey } from '@/lib/admin';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const ALLOWED_REVIEW_STATUSES = new Set(['pending', 'approved', 'rejected']);
const ALLOWED_ACCOUNT_STATUSES = new Set(['active', 'suspended']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isValidAdminKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json();
  const reviewStatus = body?.reviewStatus ? String(body.reviewStatus).toLowerCase() : null;
  const status = body?.status ? String(body.status).toLowerCase() : null;
  const notes = body?.notes ? String(body.notes).slice(0, 800) : null;

  if (reviewStatus && !ALLOWED_REVIEW_STATUSES.has(reviewStatus)) {
    return NextResponse.json({ error: 'Invalid reviewStatus.' }, { status: 400 });
  }

  if (status && !ALLOWED_ACCOUNT_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  if (!reviewStatus && !status) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (reviewStatus) update.reviewStatus = reviewStatus;
  if (status) update.status = status;
  if (notes) update.reviewNotes = notes;

  const db = await getDb();
  const result = await db.collection('users').findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: 'after' }
  );

  if (!result || !result.value) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  await recordAudit({
    action: 'admin.user.review',
    actorType: 'admin',
    subjectType: 'user',
    subjectId: id,
    meta: { reviewStatus, status },
  });

  return NextResponse.json({
    id: result.value._id.toString(),
    reviewStatus: result.value.reviewStatus,
    status: result.value.status,
    reviewNotes: result.value.reviewNotes || null,
  });
}

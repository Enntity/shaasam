import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { notifyCallback } from '@/lib/callbacks';

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json();
  const action = String(body?.action || '').toLowerCase();

  if (!['accept', 'decline', 'start', 'complete'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
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

  const now = new Date();
  let updated: any = null;

  if (action === 'accept') {
    const result = await db.collection('requests').findOneAndUpdate(
      { _id: new ObjectId(id), status: 'open' },
      {
        $set: {
          status: 'accepted',
          acceptedBy: user._id,
          acceptedAt: now,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' }
    );
    updated = result && 'value' in result ? result.value : result;
    if (!updated) {
      return NextResponse.json({ error: 'Request already claimed.' }, { status: 409 });
    }
  }

  if (action === 'decline') {
    await db.collection('requests').updateOne(
      { _id: new ObjectId(id) },
      { $addToSet: { declinedBy: user._id }, $set: { updatedAt: now } }
    );
  }

  if (action === 'start') {
    const result = await db.collection('requests').findOneAndUpdate(
      { _id: new ObjectId(id), acceptedBy: user._id, status: 'accepted' },
      { $set: { status: 'in_progress', startedAt: now, updatedAt: now } },
      { returnDocument: 'after' }
    );
    updated = result && 'value' in result ? result.value : result;
    if (!updated) {
      return NextResponse.json({ error: 'Unable to start request.' }, { status: 409 });
    }
  }

  if (action === 'complete') {
    const result = await db.collection('requests').findOneAndUpdate(
      {
        _id: new ObjectId(id),
        acceptedBy: user._id,
        status: { $in: ['accepted', 'in_progress'] },
      },
      { $set: { status: 'completed', completedAt: now, updatedAt: now } },
      { returnDocument: 'after' }
    );
    updated = result && 'value' in result ? result.value : result;
    if (!updated) {
      return NextResponse.json({ error: 'Unable to complete request.' }, { status: 409 });
    }
  }

  await recordAudit({
    action: `request.${action}`,
    actorType: 'human',
    actorId: session.id,
    subjectType: 'request',
    subjectId: id,
  });

  const requestDoc =
    updated || (await db.collection('requests').findOne({ _id: new ObjectId(id) }));

  if (requestDoc?.callbackUrl) {
    notifyCallback(requestDoc.callbackUrl, {
      event: `request.${action}`,
      requestId: id,
      status: requestDoc.status,
      humanId: session.id,
    });
  }

  return NextResponse.json({
    ok: true,
    status: requestDoc?.status || null,
  });
}

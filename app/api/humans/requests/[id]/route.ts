import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { isAllowedOrigin } from '@/lib/origin';
import { failure, HttpError, readJson, textField } from '@/lib/http';
import { getStripe } from '@/lib/stripe';
import { refreshPayment } from '@/lib/payments';
import { checkApiKeyRateLimit } from '@/lib/api-key-rate-limit';
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) throw new HttpError(400, 'Invalid id.');
    const rate = await checkApiKeyRateLimit(`human:${session.id}:action`, { limit: 30, window: 60000 });
    if (!rate.allowed) throw new HttpError(429, 'Too many actions. Try again shortly.');
    const body = await readJson(request);
    const action = body.action;
    if (!['accept', 'decline', 'start', 'complete', 'report'].includes(action)) throw new HttpError(400, 'Invalid action.');
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(session.id), verified: true, status: 'active' });
    if (!user) throw new HttpError(403, 'Account is not active.');
    if ((process.env.NODE_ENV === 'production' || process.env.REQUIRE_REVIEW === 'true') && user.reviewStatus !== 'approved') throw new HttpError(403, 'Profile pending review.');
    const task = await db.collection('requests').findOne({ _id: new ObjectId(id) });
    if (!task) throw new HttpError(404, 'Request not found.');
    const now = new Date();
    const filter: Record<string, any> = { _id: task._id };
    const update: Record<string, any> = { $set: { updatedAt: now } };
    if (action === 'accept') {
      if (!user.alias || !user.stripeAccountId) throw new HttpError(409, 'Save your profile and connect payouts before accepting work.');
      if (!task.ownerId || !Number.isSafeInteger(task.budgetCents)) throw new HttpError(409, 'This older request needs operator review.');
      const stripe = getStripe();
      if (!stripe) throw new HttpError(503, 'Payouts are unavailable.');
      const account = await stripe.accounts.retrieve(user.stripeAccountId);
      if (!account.payouts_enabled || account.capabilities?.transfers !== 'active') throw new HttpError(409, 'Finish your Stripe payout setup first.');
      if (task.skillsNormalized?.length && !task.skillsNormalized.some((s: string) => (user.skillsNormalized || []).includes(s))) throw new HttpError(409, 'This task requires a skill on your profile.');
      Object.assign(filter, { status: 'open', reportedAt: { $exists: false }, declinedBy: { $ne: user._id } });
      Object.assign(update.$set, { status: 'accepted', acceptedBy: user._id, acceptedAt: now });
    } else if (action === 'decline') {
      filter.status = 'open';
      update.$addToSet = { declinedBy: user._id };
    } else if (action === 'report') {
      if (!task.acceptedBy?.equals(user._id)) throw new HttpError(404, 'Request not found.');
      // Reporting and settlement compete on the same request document.
      filter.paymentOperation = { $exists: false };
      Object.assign(update.$set, { reportedAt: now, reportedBy: user._id, reportReason: textField(body.reason, 'reason', 2000) });
    } else {
      filter.acceptedBy = user._id;
      filter.reportedAt = { $exists: false };
      filter.paymentOperation = { $exists: false };
      if (!task.acceptedBy?.equals(user._id)) throw new HttpError(404, 'Request not found.');
      if (action === 'start') {
        const payment = task.paymentId && await db.collection('payments').findOne({ _id: task.paymentId, humanId: user._id, requestId: task._id });
        const stripe = getStripe();
        if (!payment || !stripe) throw new HttpError(409, 'Wait for the agent to fund this task before starting.');
        const current = await refreshPayment(payment, stripe);
        // Leave a day for review. Fail closed when a provider does not return hold expiry.
        if (current.status !== 'requires_capture' || !current.captureBefore || current.captureBefore.getTime() < Date.now() + (task.durationMinutes + 1440) * 60000) throw new HttpError(409, 'Payment is not authorized for long enough. Ask the agent to resolve funding.');
        Object.assign(filter, { status: 'accepted', paymentStatus: 'requires_capture' });
        Object.assign(update.$set, { status: 'in_progress', startedAt: now });
      } else {
        filter.status = 'in_progress';
        Object.assign(update.$set, { status: 'completed', completedAt: now, result: textField(body.result, 'result', 4000) });
      }
    }
    const updated = await db.collection('requests').findOneAndUpdate(filter, update, { returnDocument: 'after' });
    if (!updated) throw new HttpError(409, 'Task changed or action is unavailable. Refresh and try again.');
    await recordAudit({ action: `request.${action}`, actorType: 'human', actorId: session.id, subjectType: 'request', subjectId: id });
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error) { return failure(error); }
}

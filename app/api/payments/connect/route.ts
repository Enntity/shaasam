import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { isAllowedOrigin } from '@/lib/origin';
import { failure, HttpError, siteOrigin } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { checkApiKeyRateLimit } from '@/lib/api-key-rate-limit';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: 'Payout setup is unavailable.' }, { status: 501 });
  try {
    if (!(await checkApiKeyRateLimit(`connect:${session.id}`, { limit: 5, window: 60000 })).allowed) throw new HttpError(429, 'Please wait before trying again.');
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(session.id), verified: true, status: 'active' });
    if (!user) throw new HttpError(403, 'Account is not active.');
    const origin = siteOrigin();
    let accountId = user.stripeAccountId;
    if (!accountId) {
      // Persist the creation attempt before the external call. Do not reuse an expired Stripe key.
      await db.collection('users').updateOne({ _id: user._id, connectAttemptAt: { $exists: false } }, { $set: { connectAttemptAt: new Date() } });
      const pending = await db.collection('users').findOne({ _id: user._id });
      if (!pending?.connectAttemptAt || Date.now() - pending.connectAttemptAt.getTime() > 23 * 3600000) throw new HttpError(409, 'Payout setup needs support reconciliation.');
      const account = await stripe.accounts.create({ type: 'express', capabilities: { transfers: { requested: true } }, metadata: { humanId: session.id } }, { idempotencyKey: `connect:${session.id}` });
      accountId = account.id;
      await db.collection('users').updateOne({ _id: user._id }, { $set: { stripeAccountId: accountId, updatedAt: new Date() } });
    }
    const link = await stripe.accountLinks.create({ account: accountId, refresh_url: `${origin}/dashboard`, return_url: `${origin}/dashboard`, type: 'account_onboarding' });
    await recordAudit({ action: 'payout.connect', actorType: 'human', actorId: session.id, subjectType: 'user', subjectId: session.id });
    return NextResponse.json({ url: link.url });
  } catch (error) { return failure(error); }
}

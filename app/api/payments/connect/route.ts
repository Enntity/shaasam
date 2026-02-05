import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured.' }, { status: 501 });
  }

  const db = await getDb();
  const user = await db.collection('users').findOne({ _id: new ObjectId(session.id) });
  if (!user) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  const returnUrl =
    process.env.STRIPE_CONNECT_RETURN_URL || 'http://localhost:3000/dashboard';
  const refreshUrl =
    process.env.STRIPE_CONNECT_REFRESH_URL || 'http://localhost:3000/dashboard';

  let accountId = user.stripeAccountId as string | undefined;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: user.email || undefined,
      capabilities: {
        transfers: { requested: true },
      },
    });
    accountId = account.id;
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { stripeAccountId: accountId, updatedAt: new Date() } }
    );
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });

  return NextResponse.json({ url: link.url });
}

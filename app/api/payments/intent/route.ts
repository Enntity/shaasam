import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { isValidApiKey } from '@/lib/api-key';
import { getStripe } from '@/lib/stripe';
import { recordAudit } from '@/lib/audit';
import { checkApiKeyRateLimit, getRateLimitHeaders } from '@/lib/api-key-rate-limit';

export const runtime = 'nodejs';

const MIN_AMOUNT = 100; // $1.00 in cents
const ALLOWED_CURRENCIES = new Set(['usd']);

export async function POST(request: Request) {
  const apiKey = request.headers.get('x-api-key') || '';
  if (!isValidApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit: 20 requests per minute per API key (strict for payments)
  const rateLimitResult = checkApiKeyRateLimit(apiKey, {
    limit: 20,
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

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured.' }, { status: 501 });
  }

  try {
    const body = await request.json();
    const amount = Math.round(Number(body?.amount));
    const currency = String(body?.currency || 'usd').toLowerCase();
    const humanId = String(body?.humanId || '').trim();
    const requestId = body?.requestId ? String(body.requestId).trim() : null;

    if (!ObjectId.isValid(humanId)) {
      return NextResponse.json({ error: 'Invalid humanId.' }, { status: 400 });
    }

    if (Number.isNaN(amount) || amount < MIN_AMOUNT) {
      return NextResponse.json({ error: 'Amount must be at least $1.00.' }, { status: 400 });
    }

    if (!ALLOWED_CURRENCIES.has(currency)) {
      return NextResponse.json({ error: 'Unsupported currency.' }, { status: 400 });
    }

    if (requestId && !ObjectId.isValid(requestId)) {
      return NextResponse.json({ error: 'Invalid requestId.' }, { status: 400 });
    }

    const db = await getDb();
    const human = await db
      .collection('users')
      .findOne({ _id: new ObjectId(humanId), verified: true });

    if (!human) {
      return NextResponse.json({ error: 'Human not found.' }, { status: 404 });
    }

    if (!human.stripeAccountId) {
      return NextResponse.json({ error: 'Human payout account not connected.' }, { status: 409 });
    }

    if (requestId) {
      const requestDoc = await db
        .collection('requests')
        .findOne({ _id: new ObjectId(requestId) });
      if (!requestDoc) {
        return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
      }
    }

    const feeBps = Number(process.env.SHAASAM_PLATFORM_FEE_BPS || 0);
    const applicationFeeAmount = feeBps > 0 ? Math.round((amount * feeBps) / 10000) : 0;

    const intent = await stripe.paymentIntents.create({
      amount,
      currency,
      capture_method: 'manual',
      payment_method_types: ['card'],
      transfer_data: {
        destination: human.stripeAccountId,
      },
      application_fee_amount: applicationFeeAmount || undefined,
      metadata: {
        requestId: requestId || '',
        humanId,
      },
    });

    const doc = {
      requestId: requestId ? new ObjectId(requestId) : null,
      humanId: new ObjectId(humanId),
      amount,
      currency,
      stripePaymentIntentId: intent.id,
      status: intent.status,
      applicationFeeAmount,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection('payments').insertOne(doc);

    if (requestId) {
      await db.collection('requests').updateOne(
        { _id: new ObjectId(requestId) },
        {
          $set: {
            paymentId: result.insertedId,
            paymentStatus: intent.status,
            updatedAt: new Date(),
          },
        }
      );
    }

    await recordAudit({
      action: 'payment.intent.create',
      actorType: 'agent',
      subjectType: 'payment',
      subjectId: result.insertedId.toString(),
      meta: {
        requestId,
        humanId,
        amount,
        currency,
      },
    });

    return NextResponse.json(
      {
        id: result.insertedId.toString(),
        stripePaymentIntentId: intent.id,
        clientSecret: intent.client_secret,
        status: intent.status,
      },
      {
        headers: getRateLimitHeaders(rateLimitResult),
      }
    );
  } catch (error) {
    console.error('Payment intent failed', error);
    return NextResponse.json({ error: 'Unable to create payment.' }, { status: 500 });
  }
}

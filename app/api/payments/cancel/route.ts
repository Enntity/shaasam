import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { isValidApiKey } from '@/lib/api-key';
import { getStripe } from '@/lib/stripe';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isValidApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured.' }, { status: 501 });
  }

  try {
    const body = await request.json();
    const paymentId = body?.paymentId ? String(body.paymentId).trim() : null;
    const paymentIntentId = body?.paymentIntentId
      ? String(body.paymentIntentId).trim()
      : null;

    if (!paymentId && !paymentIntentId) {
      return NextResponse.json({ error: 'paymentId or paymentIntentId required.' }, { status: 400 });
    }

    const db = await getDb();
    const payment = await db.collection('payments').findOne(
      paymentId && ObjectId.isValid(paymentId)
        ? { _id: new ObjectId(paymentId) }
        : { stripePaymentIntentId: paymentIntentId }
    );

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
    }

    const intent = await stripe.paymentIntents.cancel(payment.stripePaymentIntentId);

    await db.collection('payments').updateOne(
      { _id: payment._id },
      {
        $set: {
          status: intent.status,
          updatedAt: new Date(),
          canceledAt: intent.status === 'canceled' ? new Date() : null,
        },
      }
    );

    if (payment.requestId) {
      await db.collection('requests').updateOne(
        { _id: payment.requestId },
        {
          $set: {
            paymentStatus: intent.status,
            updatedAt: new Date(),
          },
        }
      );
    }

    await recordAudit({
      action: 'payment.cancel',
      actorType: 'agent',
      subjectType: 'payment',
      subjectId: payment._id.toString(),
      meta: {
        stripePaymentIntentId: intent.id,
        status: intent.status,
      },
    });

    return NextResponse.json({
      stripePaymentIntentId: intent.id,
      status: intent.status,
    });
  } catch (error) {
    console.error('Cancel failed', error);
    return NextResponse.json({ error: 'Unable to cancel payment.' }, { status: 500 });
  }
}

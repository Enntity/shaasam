import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getDb } from '@/lib/mongodb';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: 'Stripe webhook not configured.' }, { status: 501 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  }

  let event: any;
  try {
    const payload = await request.text();
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    console.error('Webhook signature verification failed', error);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const db = await getDb();

  const updatePayment = async (intent: any) => {
    const payment = await db
      .collection('payments')
      .findOne({ stripePaymentIntentId: intent.id });
    if (!payment) return;

    await db.collection('payments').updateOne(
      { _id: payment._id },
      {
        $set: {
          status: intent.status,
          updatedAt: new Date(),
          capturedAt: intent.status === 'succeeded' ? new Date() : payment.capturedAt,
          canceledAt: intent.status === 'canceled' ? new Date() : payment.canceledAt,
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
  };

  switch (event.type) {
    case 'payment_intent.amount_capturable_updated':
    case 'payment_intent.processing':
    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed':
    case 'payment_intent.canceled': {
      const intent = event.data.object;
      await updatePayment(intent);
      await recordAudit({
        action: `stripe.${event.type}`,
        actorType: 'system',
        subjectType: 'payment',
        subjectId: intent.id,
      });
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object;
      if (charge?.payment_intent) {
        await updatePayment({ id: charge.payment_intent, status: 'refunded' });
      }
      await recordAudit({
        action: 'stripe.charge.refunded',
        actorType: 'system',
        subjectType: 'payment',
        subjectId: charge?.payment_intent || null,
      });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

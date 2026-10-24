import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { ObjectId } from 'mongodb';
import { getStripe } from '@/lib/stripe';
import { getDb } from '@/lib/mongodb';
import { recordAudit } from '@/lib/audit';
import { refreshPayment } from '@/lib/payments';
import { failure, HttpError } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: 'Webhook unavailable.' }, { status: 503 });
  let event: Stripe.Event;
  try {
    const payload = await request.text();
    if (Buffer.byteLength(payload) > 262144) return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
    event = stripe.webhooks.constructEvent(payload, request.headers.get('stripe-signature') || '', secret);
  } catch { return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 }); }
  try {
    const db = await getDb();
    if (await db.collection('stripe_events').findOne({ eventId: event.id })) return NextResponse.json({ received: true });
    const object = event.data.object as unknown as Record<string, any>;
    if (event.type.startsWith('payment_intent.') || event.type === 'checkout.session.completed' || event.type === 'checkout.session.expired' || event.type === 'charge.refunded') {
      const paymentId = object.metadata?.paymentId;
      const intentId = event.type.startsWith('payment_intent.') ? object.id : object.payment_intent;
      let payment = await db.collection('payments').findOne({ stripePaymentIntentId: intentId || 'none' });
      if (!payment && typeof paymentId === 'string' && ObjectId.isValid(paymentId)) payment = await db.collection('payments').findOne({ _id: new ObjectId(paymentId) });
      if (payment) {
        // Early delivery can precede persistence of the Stripe ID. Verify binding during refresh.
        const candidate = payment.stripePaymentIntentId ? payment : { ...payment, stripePaymentIntentId: intentId, ...(event.type.startsWith('checkout.session.') ? { checkoutSessionId: object.id } : {}) };
        if (!candidate.stripePaymentIntentId && !candidate.checkoutSessionId) throw new HttpError(503, 'Payment is not ready for reconciliation.');
        await refreshPayment(candidate, stripe);
        await recordAudit({ action: `stripe.${event.type}`, actorType: 'system', subjectType: 'payment', subjectId: payment._id.toString(), meta: { eventId: event.id } });
      } else if (paymentId) throw new HttpError(503, 'Payment record is not ready. Retry delivery.');
    }
    // Mark only after local state is durable; retries repair partial updates.
    await db.collection('stripe_events').updateOne({ eventId: event.id }, { $setOnInsert: { createdAt: new Date(), type: event.type } }, { upsert: true });
    return NextResponse.json({ received: true });
  } catch (error) { return failure(error); }
}

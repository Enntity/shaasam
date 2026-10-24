import { ObjectId, type Document, type WithId } from 'mongodb';
import type Stripe from 'stripe';
import { getDb } from './mongodb';
import { getStripe } from './stripe';
import { failure, HttpError, readJson, siteOrigin } from './http';
import { getAgentId } from './api-key';
import { NextResponse } from 'next/server';
import { recordAudit } from './audit';
import { checkApiKeyRateLimit, getRateLimitHeaders } from './api-key-rate-limit';

export function paymentView(payment: Document) {
  return { id: payment._id.toString(), requestId: payment.requestId.toString(), humanId: payment.humanId.toString(),
    amount: payment.amount, currency: payment.currency, status: payment.status,
    stripePaymentIntentId: payment.stripePaymentIntentId || null, checkoutUrl: payment.checkoutUrl || null,
    applicationFeeAmount: payment.applicationFeeAmount, humanReceivesCents: payment.amount - payment.applicationFeeAmount,
    captureBefore: payment.captureBefore || null, refundedCents: payment.refundedCents || 0 };
}

export async function refreshPayment(payment: WithId<Document>, stripe: Stripe) {
  const db = await getDb();
  let intentId = payment.stripePaymentIntentId;
  let update: Record<string, unknown>;
  if (!intentId && payment.checkoutSessionId) {
    const session = await stripe.checkout.sessions.retrieve(payment.checkoutSessionId);
    if (session.metadata?.paymentId !== payment._id.toString() || session.metadata?.requestId !== payment.requestId.toString() || session.metadata?.ownerId !== payment.ownerId) throw new HttpError(409, 'Checkout binding mismatch. Contact support.');
    intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!intentId && session.status !== 'expired') return payment;
    update = { status: 'canceled', checkoutUrl: null, updatedAt: new Date() };
  } else if (!intentId) return payment;
  if (intentId) {
    const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge'] });
    if (intent.metadata.paymentId !== payment._id.toString() || intent.metadata.requestId !== payment.requestId.toString() || intent.metadata.ownerId !== payment.ownerId || intent.amount !== payment.amount || intent.currency !== payment.currency || intent.transfer_data?.destination !== payment.destination || (intent.application_fee_amount || 0) !== payment.applicationFeeAmount || intent.capture_method !== 'manual') throw new HttpError(409, 'Payment binding mismatch. Contact support.');
    const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    const refundedCents = charge?.amount_refunded || 0;
    const status = refundedCents >= payment.amount ? 'refunded' : intent.status;
    const captureBefore = charge?.payment_method_details?.card?.capture_before;
    update = { stripePaymentIntentId: intent.id, status, refundedCents,
      captureBefore: captureBefore ? new Date(captureBefore * 1000) : null, updatedAt: new Date() };
  }
  // Optimistic versioning prevents an older in-flight observation overwriting a newer one.
  const changed = await db.collection('payments').findOneAndUpdate({ _id: payment._id, revision: payment.revision },
    { $set: update!, $inc: { revision: 1 } }, { returnDocument: 'after' });
  const current = changed || await db.collection('payments').findOne({ _id: payment._id });
  if (!current) throw new HttpError(404, 'Payment not found.');
  await db.collection('requests').updateOne({ _id: current.requestId, paymentId: current._id,
    $or: [{ paymentRevision: { $exists: false } }, { paymentRevision: { $lte: current.revision } }] },
    { $set: { paymentStatus: current.status, paymentRevision: current.revision, updatedAt: new Date() } });
  return current;
}

export async function createPayment(request: Request, mode: 'intent' | 'checkout') {
  const ownerId = getAgentId(request);
  if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: 'Payments are not configured.' }, { status: 501 });
  try {
    const rate = await checkApiKeyRateLimit(`${ownerId}:payment`, { limit: 20, window: 60000 });
    if (!rate.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429, headers: getRateLimitHeaders(rate) });
    const body = await readJson(request);
    if (typeof body.requestId !== 'string' || !ObjectId.isValid(body.requestId)) throw new HttpError(400, 'A valid requestId is required.');
    const db = await getDb();
    const task = await db.collection('requests').findOne({ _id: new ObjectId(body.requestId), ownerId });
    if (!task) throw new HttpError(404, 'Request not found.');
    if (task.status !== 'accepted' || !task.acceptedBy || task.reportedAt || task.paymentOperation) throw new HttpError(409, 'Request must be accepted and awaiting funding.');
    if (body.humanId !== undefined && body.humanId !== task.acceptedBy.toString()) throw new HttpError(400, 'humanId must match the assigned human.');
    if (body.amount !== undefined && body.amount !== task.budgetCents) throw new HttpError(400, 'Amount must match the agreed task budget in cents.');
    if (body.currency !== undefined && body.currency !== 'usd') throw new HttpError(400, 'Only USD is supported.');
    const human = await db.collection('users').findOne({ _id: task.acceptedBy, verified: true, status: 'active' });
    if (!human?.stripeAccountId || ((process.env.NODE_ENV === 'production' || process.env.REQUIRE_REVIEW === 'true') && human.reviewStatus !== 'approved')) throw new HttpError(409, 'Human is not ready for payouts.');
    let payment = await db.collection('payments').findOne({ requestId: task._id, ownerId });
    if (!payment) {
      const account = await stripe.accounts.retrieve(human.stripeAccountId);
      if (!account.payouts_enabled || account.capabilities?.transfers !== 'active') throw new HttpError(409, 'Human must finish Stripe payout setup.');
      const feeBps = Number(process.env.SHAASAM_PLATFORM_FEE_BPS || 0);
      if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 3000) throw new HttpError(503, 'Invalid platform fee configuration.');
      const doc = { _id: new ObjectId(), ownerId, requestId: task._id, humanId: task.acceptedBy,
        amount: task.budgetCents, currency: 'usd', destination: human.stripeAccountId,
        applicationFeeAmount: task.applicationFeeAmount, mode,
        status: 'creating', revision: 0, createdAt: new Date(), updatedAt: new Date() };
      try { await db.collection('payments').insertOne(doc); } catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
      payment = await db.collection('payments').findOne({ requestId: task._id, ownerId });
    }
    if (!payment || payment.mode !== mode) throw new HttpError(409, 'A different payment method already exists for this request.');
    const bound = await db.collection('requests').updateOne({ _id: task._id, ownerId, status: 'accepted', paymentOperation: { $exists: false } }, { $set: { paymentId: payment._id } });
    if (!bound.matchedCount) throw new HttpError(409, 'Request changed. Reload it before paying.');
    if (!payment.stripePaymentIntentId && !payment.checkoutSessionId) {
      // Stripe may prune idempotency keys after 24h. Ambiguous older attempts require reconciliation.
      if (Date.now() - payment.createdAt.getTime() > 23 * 3600000) throw new HttpError(409, 'Payment creation needs operator reconciliation. Do not create a second payment.');
      const metadata = { paymentId: payment._id.toString(), requestId: task._id.toString(), ownerId };
      const data = { capture_method: 'manual' as const, transfer_data: { destination: payment.destination },
        application_fee_amount: payment.applicationFeeAmount || undefined, metadata };
      if (mode === 'checkout') {
        const origin = siteOrigin();
        const checkout = await stripe.checkout.sessions.create({ mode: 'payment', payment_method_types: ['card'],
          line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: payment.amount, product_data: { name: task.title } } }],
          payment_intent_data: data, metadata,
          success_url: `${origin}/payment?result=returned`, cancel_url: `${origin}/payment?result=canceled`,
        }, { idempotencyKey: `payment:${payment._id}:checkout` });
        await db.collection('payments').updateOne({ _id: payment._id }, { $set: { checkoutSessionId: checkout.id, checkoutUrl: checkout.url } });
        await db.collection('payments').updateOne({ _id: payment._id, status: 'creating' }, { $set: { status: 'awaiting_payment' } });
      } else {
        const intent = await stripe.paymentIntents.create({ ...data, amount: payment.amount, currency: 'usd', payment_method_types: ['card'] }, { idempotencyKey: `payment:${payment._id}:intent` });
        await db.collection('payments').updateOne({ _id: payment._id, status: 'creating' }, { $set: { stripePaymentIntentId: intent.id, status: intent.status } });
      }
      payment = (await db.collection('payments').findOne({ _id: payment._id }))!;
    }
    payment = await refreshPayment(payment, stripe);
    await recordAudit({ action: 'payment.create', actorType: 'agent', actorId: ownerId, subjectType: 'payment', subjectId: payment._id.toString() });
    const clientSecret = mode === 'intent' ? (await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId)).client_secret : undefined;
    return NextResponse.json({ ...paymentView(payment), ...(clientSecret ? { clientSecret } : {}) });
  } catch (error) { return failure(error); }
}

export async function changePayment(request: Request, action: 'capture' | 'cancel') {
  const ownerId = getAgentId(request);
  if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: 'Payments are not configured.' }, { status: 501 });
  try {
    const rate = await checkApiKeyRateLimit(`${ownerId}:payment`, { limit: 20, window: 60000 });
    if (!rate.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429, headers: getRateLimitHeaders(rate) });
    const body = await readJson(request);
    if (typeof body.paymentId !== 'string' || !ObjectId.isValid(body.paymentId) || body.amount !== undefined) throw new HttpError(400, 'Use paymentId. Partial capture is not supported.');
    const db = await getDb();
    let payment = await db.collection('payments').findOne({ _id: new ObjectId(body.paymentId), ownerId });
    if (!payment) throw new HttpError(404, 'Payment not found.');
    payment = await refreshPayment(payment, stripe);
    const terminal = action === 'capture' ? 'succeeded' : 'canceled';
    if (payment.status !== terminal) {
      if (action === 'capture' && payment.status !== 'requires_capture') throw new HttpError(409, 'Funds are not authorized for capture.');
      const task = await db.collection('requests').findOneAndUpdate({ _id: payment.requestId, ownerId, paymentId: payment._id,
        status: action === 'capture' ? 'completed' : 'accepted', reportedAt: { $exists: false },
        $or: [{ paymentOperation: { $exists: false } }, { paymentOperation: action }] },
        { $set: { paymentOperation: action, updatedAt: new Date() } }, { returnDocument: 'after' });
      if (!task) throw new HttpError(409, action === 'capture' ? 'Capture requires completed, undisputed work.' : 'Cancellation is allowed only before work starts.');
      if (!payment.stripePaymentIntentId) {
        if (action !== 'cancel' || !payment.checkoutSessionId) throw new HttpError(409, 'Payment is not ready.');
        try {
          await stripe.checkout.sessions.expire(payment.checkoutSessionId, {}, { idempotencyKey: `payment:${payment._id}:expire` });
        } catch (error) {
          // Checkout may have completed or expired between retrieve and expire.
          payment = await refreshPayment(payment, stripe);
          if (payment.stripePaymentIntentId) await stripe.paymentIntents.cancel(payment.stripePaymentIntentId, {}, { idempotencyKey: `payment:${payment._id}:cancel` });
          else if (payment.status !== 'canceled') throw error;
        }
      } else {
        if (action === 'capture') await stripe.paymentIntents.capture(payment.stripePaymentIntentId, {}, { idempotencyKey: `payment:${payment._id}:capture` });
        else await stripe.paymentIntents.cancel(payment.stripePaymentIntentId, {}, { idempotencyKey: `payment:${payment._id}:cancel` });
      }
      payment = (await db.collection('payments').findOne({ _id: payment._id }))!;
      payment = await refreshPayment(payment, stripe);
    }
    if (action === 'cancel' && payment.status === 'canceled') await db.collection('requests').updateOne({ _id: payment.requestId, paymentId: payment._id, status: 'accepted' }, { $set: { status: 'canceled', paymentStatus: 'canceled', updatedAt: new Date() } });
    await recordAudit({ action: `payment.${action}`, actorType: 'agent', actorId: ownerId, subjectType: 'payment', subjectId: payment._id.toString() });
    return NextResponse.json(paymentView(payment));
  } catch (error) { return failure(error); }
}

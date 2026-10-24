import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { getAgentId } from '@/lib/api-key';
import { getStripe } from '@/lib/stripe';
import { failure } from '@/lib/http';
import { paymentView, refreshPayment } from '@/lib/payments';
import { checkApiKeyRateLimit, getRateLimitHeaders } from '@/lib/api-key-rate-limit';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ownerId = getAgentId(request);
  if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    const rate = await checkApiKeyRateLimit(`${ownerId}:payment-read`, { limit: 60, window: 60000 });
    if (!rate.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429, headers: getRateLimitHeaders(rate) });
    const db = await getDb();
    const payment = await db.collection('payments').findOne({ _id: new ObjectId(id), ownerId });
    if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const stripe = getStripe();
    return NextResponse.json(paymentView(stripe ? await refreshPayment(payment, stripe) : payment));
  } catch (error) { return failure(error); }
}

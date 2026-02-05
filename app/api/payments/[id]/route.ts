import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { isValidApiKey } from '@/lib/api-key';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isValidApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const db = await getDb();
  const payment = await db.collection('payments').findOne({ _id: new ObjectId(id) });
  if (!payment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: payment._id.toString(),
    requestId: payment.requestId ? payment.requestId.toString() : null,
    humanId: payment.humanId ? payment.humanId.toString() : null,
    amount: payment.amount,
    currency: payment.currency,
    stripePaymentIntentId: payment.stripePaymentIntentId,
    status: payment.status,
    applicationFeeAmount: payment.applicationFeeAmount,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    capturedAt: payment.capturedAt,
    canceledAt: payment.canceledAt,
  });
}

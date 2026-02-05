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
  const item = await db.collection('requests').findOne({ _id: new ObjectId(id) });
  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: item._id.toString(),
    title: item.title,
    description: item.description,
    skills: item.skills,
    budget: item.budget,
    callbackUrl: item.callbackUrl,
    requester: item.requester,
    status: item.status,
    paymentId: item.paymentId ? item.paymentId.toString() : null,
    paymentStatus: item.paymentStatus || null,
    createdAt: item.createdAt,
  });
}

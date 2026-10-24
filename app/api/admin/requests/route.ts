import { NextResponse } from 'next/server';
import { isValidAdminKey } from '@/lib/admin';
import { getDb } from '@/lib/mongodb';
import { failure } from '@/lib/http';
import { requestView } from '@/lib/requests';
export async function GET(request: Request) {
  if (!isValidAdminKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = await getDb();
    const tasks = await db.collection('requests').find({ reportedAt: { $exists: true } }).sort({ reportedAt: 1 }).limit(100).toArray();
    return NextResponse.json({ data: tasks.map(t => ({ ...requestView(t), reportReason: t.reportReason, reportedBy: t.reportedBy?.toString(), ownerId: t.ownerId })) });
  } catch (error) { return failure(error); }
}

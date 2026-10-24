import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { isValidAdminKey } from '@/lib/admin';
import { getDb } from '@/lib/mongodb';
import { failure, readJson, textField, HttpError } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidAdminKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) throw new HttpError(400, 'Invalid task ID.');
    const body = await readJson(request);
    const resolution = textField(body.resolution, 'resolution', 2000);
    const db = await getDb();
    // Preserve the report and resolution on the task itself before allowing settlement again.
    const task = await db.collection('requests').findOneAndUpdate({ _id: new ObjectId(id), reportedAt: { $exists: true }, paymentOperation: { $exists: false } }, [
      { $set: { reportHistory: { $concatArrays: [{ $ifNull: ['$reportHistory', []] }, [{ reportedAt: '$reportedAt', reportedBy: '$reportedBy', reason: '$reportReason', resolution: { $literal: resolution }, resolvedAt: '$$NOW' }]] }, updatedAt: '$$NOW' } },
      { $unset: ['reportedAt', 'reportedBy', 'reportReason'] },
    ], { returnDocument: 'after' });
    if (!task) throw new HttpError(409, 'Task is not awaiting report review.');
    await recordAudit({ action: 'admin.request.resolve', actorType: 'admin', subjectType: 'request', subjectId: id, meta: { resolution } });
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}

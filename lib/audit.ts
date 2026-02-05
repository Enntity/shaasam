import { getDb } from './mongodb';

type AuditEvent = {
  action: string;
  actorId?: string | null;
  actorType?: 'system' | 'human' | 'agent' | 'admin';
  subjectId?: string | null;
  subjectType?: 'user' | 'request' | 'payment';
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
};

export async function recordAudit(event: AuditEvent) {
  const db = await getDb();
  await db.collection('audit_logs').insertOne({
    ...event,
    createdAt: new Date(),
  });
}

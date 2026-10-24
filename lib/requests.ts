import type { Document } from 'mongodb';
export function requestView(item: Document) {
  return { id: item._id.toString(), title: item.title, description: item.description,
    acceptanceCriteria: item.acceptanceCriteria, skills: item.skills || [], budgetCents: item.budgetCents,
    durationMinutes: item.durationMinutes, currency: item.currency || 'usd', requester: item.requester,
    status: item.status, acceptedBy: item.acceptedBy?.toString() || null,
    paymentId: item.paymentId?.toString() || null, paymentStatus: item.paymentStatus || null,
    result: item.result || null, reportedAt: item.reportedAt || null,
    createdAt: item.createdAt, updatedAt: item.updatedAt, acceptedAt: item.acceptedAt || null,
    startedAt: item.startedAt || null, completedAt: item.completedAt || null };
}

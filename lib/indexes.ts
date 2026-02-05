import type { Db } from 'mongodb';

export async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection('users').createIndex({ phone: 1 }, { unique: true }),
    db.collection('users').createIndex({ verified: 1, updatedAt: -1 }),
    db.collection('users').createIndex({ skillsNormalized: 1 }),
    db.collection('users').createIndex({ categoriesNormalized: 1 }),
    db.collection('users').createIndex({ hourlyRate: 1 }),
    db.collection('users').createIndex({ availability: 1 }),
    db.collection('users').createIndex({ reviewStatus: 1 }),
    db.collection('users').createIndex({ status: 1 }),
    db.collection('users').createIndex({
      displayName: 'text',
      headline: 'text',
      bio: 'text',
      skills: 'text',
      categories: 'text',
    }),
    db.collection('verifications').createIndex({ phone: 1 }, { unique: true }),
    db.collection('verifications').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 }
    ),
    db.collection('requests').createIndex({ status: 1, createdAt: -1 }),
    db.collection('payments').createIndex({ requestId: 1 }),
    db.collection('payments').createIndex({ humanId: 1 }),
    db.collection('payments').createIndex({ status: 1 }),
    db.collection('payments').createIndex({ stripePaymentIntentId: 1 }, { unique: true }),
    db.collection('audit_logs').createIndex({ createdAt: -1 }),
    db.collection('audit_logs').createIndex({ actorId: 1 }),
  ]);
}

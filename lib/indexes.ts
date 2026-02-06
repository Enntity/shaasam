import type { Db } from 'mongodb';

export async function ensureIndexes(db: Db) {
  const users = db.collection('users');
  const textIndexName = 'user_text_search';
  const desiredWeights = {
    alias: 1,
    fullName: 1,
    about: 1,
    displayName: 1,
    headline: 1,
    bio: 1,
    skills: 1,
    categories: 1,
  };

  const existingIndexes = await users.indexes().catch(() => []);
  const textIndexes = existingIndexes.filter(
    (index) => index.weights && Object.keys(index.weights).length > 0
  );
  const hasMatchingTextIndex = textIndexes.some((index) => {
    if (index.name !== textIndexName) return false;
    const weights = index.weights || {};
    const keys = Object.keys(weights);
    const desiredKeys = Object.keys(desiredWeights);
    if (keys.length !== desiredKeys.length) return false;
    return desiredKeys.every((key) => weights[key] === 1);
  });

  if (!hasMatchingTextIndex && textIndexes.length > 0) {
    await Promise.all(textIndexes.map((index) => users.dropIndex(index.name)));
  }

  await Promise.all([
    users.createIndex({ phone: 1 }, { unique: true }),
    users.createIndex({ aliasNormalized: 1 }, { unique: true, sparse: true }),
    users.createIndex({ verified: 1, updatedAt: -1 }),
    users.createIndex({ skillsNormalized: 1 }),
    users.createIndex({ categoriesNormalized: 1 }),
    users.createIndex({ hourlyRate: 1 }),
    users.createIndex({ availability: 1 }),
    users.createIndex({ reviewStatus: 1 }),
    users.createIndex({ status: 1 }),
    users.createIndex(
      {
        alias: 'text',
        fullName: 'text',
        about: 'text',
        displayName: 'text',
        headline: 'text',
        bio: 'text',
        skills: 'text',
        categories: 'text',
      },
      { name: textIndexName }
    ),
    db.collection('verifications').createIndex({ phone: 1 }, { unique: true }),
    db.collection('verifications').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 }
    ),
    db.collection('requests').createIndex({ status: 1, createdAt: -1 }),
    db.collection('requests').createIndex({ status: 1, skillsNormalized: 1 }),
    db.collection('requests').createIndex({ acceptedBy: 1, updatedAt: -1 }),
    db.collection('payments').createIndex({ requestId: 1 }),
    db.collection('payments').createIndex({ humanId: 1 }),
    db.collection('payments').createIndex({ status: 1 }),
    db.collection('payments').createIndex({ stripePaymentIntentId: 1 }, { unique: true }),
    db.collection('audit_logs').createIndex({ createdAt: -1 }),
    db.collection('audit_logs').createIndex({ actorId: 1 }),
  ]);
}

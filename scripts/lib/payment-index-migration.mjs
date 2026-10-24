import { createHash } from 'node:crypto';
import { BSON } from 'mongodb';
const { EJSON } = BSON;

export const targets = [
  { collection: 'payments', key: { stripePaymentIntentId: 1 }, options: { name: 'stripePaymentIntentId_1', unique: true, sparse: true } },
  { collection: 'payments', key: { requestId: 1 }, options: { name: 'requestId_1', unique: true, partialFilterExpression: { ownerId: { $type: 'string' } } } },
  { collection: 'requests', key: { ownerId: 1, idempotencyKey: 1 }, options: { name: 'ownerId_1_idempotencyKey_1', unique: true, partialFilterExpression: { ownerId: { $type: 'string' } } } },
];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function indexSpec(index) {
  if (!index) return null;
  const { key, name, unique, sparse, partialFilterExpression, expireAfterSeconds, collation, hidden } = index;
  return { key, options: { name, ...(unique ? { unique } : {}), ...(sparse ? { sparse } : {}),
    ...(partialFilterExpression ? { partialFilterExpression } : {}), ...(expireAfterSeconds !== undefined ? { expireAfterSeconds } : {}),
    ...(collation ? { collation } : {}), ...(hidden ? { hidden } : {}) } };
}
async function indexes(db, collection) {
  try { return await db.collection(collection).indexes(); }
  catch (error) { if (error.code === 26) return []; throw error; }
}
async function dataState(db) {
  const state = {};
  for (const name of ['payments', 'requests']) {
    const digest = createHash('sha256'); let count = 0;
    for await (const doc of db.collection(name).find({}).sort({ _id: 1 })) {
      digest.update(EJSON.stringify(doc, { relaxed: false }) + '\n'); count++;
    }
    const info = await db.listCollections({ name }, { nameOnly: false }).next();
    state[name] = { count, digest: digest.digest('hex'), uuid: info?.info?.uuid?.toString('hex') || null };
  }
  return state;
}
async function hasDuplicates(db, collection, match, id) {
  return Boolean(await db.collection(collection).aggregate([
    { $match: match }, { $group: { _id: id, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $limit: 1 },
  ]).next());
}
export async function makePlan(db) {
  const data = await dataState(db);
  const blockers = [];
  const changes = [];
  for (const target of targets) {
    const existing = await indexes(db, target.collection);
    const before = indexSpec(existing.find(i => i.name === target.options.name));
    const after = { key: target.key, options: target.options };
    if (before && !equal(before.key, target.key)) blockers.push(`Unexpected key definition: ${target.collection}.${target.options.name}`);
    if (before?.options.collation || before?.options.expireAfterSeconds !== undefined || before?.options.hidden) blockers.push(`Custom index requires manual review: ${target.collection}.${target.options.name}`);
    if (!equal(before, after)) changes.push({ collection: target.collection, before, after });
  }
  // A sparse index includes explicit nulls; those must be included in duplicate checks.
  if (await hasDuplicates(db, 'payments', { stripePaymentIntentId: { $exists: true } }, '$stripePaymentIntentId')) blockers.push('Duplicate Stripe payment binding (including explicit nulls).');
  if (await hasDuplicates(db, 'payments', { ownerId: { $type: 'string' } }, '$requestId')) blockers.push('Duplicate owned payment request binding.');
  if (await hasDuplicates(db, 'requests', { ownerId: { $type: 'string' } }, { ownerId: '$ownerId', idempotencyKey: '$idempotencyKey' })) blockers.push('Duplicate agent request idempotency binding.');
  if (await db.collection('payments').countDocuments({ ownerId: { $type: 'string' }, requestId: { $not: { $type: 'objectId' } } })) blockers.push('Owned payment has invalid requestId.');
  const plan = { version: 1, database: db.databaseName, data, changes, blockers };
  return { ...plan, fingerprint: hash(plan) };
}
function validatePlan(plan) {
  const { fingerprint, ...body } = plan;
  if (plan.version !== 1 || fingerprint !== hash(body)) throw new Error('Invalid or edited migration plan. Generate a fresh plan.');
}
export async function applyPlan(db, plan, persistJournal) {
  validatePlan(plan);
  const current = await makePlan(db);
  if (current.fingerprint !== plan.fingerprint) throw new Error('Database changed since planning. Stop writers and generate a fresh plan.');
  if (plan.blockers.length) throw new Error(`Migration blocked: ${plan.blockers.join(' ')}`);
  const journal = { version: 1, status: 'prepared', plan, applied: [] };
  // This must be a durable, private, exclusive file before any index is dropped.
  await persistJournal(journal);
  try {
    for (const change of plan.changes) {
      const col = db.collection(change.collection);
      if (change.before) await col.dropIndex(change.before.options.name);
      await col.createIndex(change.after.key, change.after.options);
      journal.applied.push(change.after.options.name);
      await persistJournal(journal);
    }
    const after = await makePlan(db);
    if (after.changes.length || after.blockers.length) throw new Error('Post-migration index verification failed.');
    // Index creation may create previously absent empty collections; compare contents, not UUIDs.
    for (const name of Object.keys(plan.data)) if (after.data[name].digest !== plan.data[name].digest) throw new Error('Records changed during maintenance. Investigate before releasing traffic.');
    journal.status = 'complete';
    await persistJournal(journal);
    return journal;
  } catch (error) {
    // Do not hide a partially applied migration. The prewritten journal supports explicit rollback.
    journal.status = 'incomplete';
    await persistJournal(journal);
    throw error;
  }
}
export async function rollbackPlan(db, journal) {
  validatePlan(journal.plan);
  const plan = journal.plan;
  if (db.databaseName !== plan.database) throw new Error('Rollback database mismatch.');
  const data = await dataState(db);
  for (const name of Object.keys(plan.data)) {
    if (data[name].digest !== plan.data[name].digest || (plan.data[name].uuid && data[name].uuid !== plan.data[name].uuid)) throw new Error('Records or collections changed since migration. Rollback requires manual review.');
  }
  // Preflight every index before touching any of them.
  for (const change of plan.changes) {
    const current = indexSpec((await indexes(db, change.collection)).find(i => i.name === change.after.options.name));
    if (current && !equal(current, change.after) && !equal(current, change.before)) throw new Error('Index changed since migration. Rollback requires manual review.');
  }
  for (const change of [...plan.changes].reverse()) {
    const col = db.collection(change.collection);
    const current = indexSpec((await indexes(db, change.collection)).find(i => i.name === change.after.options.name));
    if (equal(current, change.before)) continue;
    if (current) await col.dropIndex(change.after.options.name);
    if (change.before) await col.createIndex(change.before.key, change.before.options);
  }
}

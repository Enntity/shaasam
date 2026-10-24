import { describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { makePlan, applyPlan, rollbackPlan } from '../../scripts/lib/payment-index-migration.mjs';

async function legacy() {
  const db = await getDb();
  await db.collection('payments').dropIndexes();
  await db.collection('requests').dropIndexes();
  await db.collection('payments').createIndex({ stripePaymentIntentId: 1 }, { unique: true });
  await db.collection('payments').createIndex({ requestId: 1 });
  await db.collection('payments').createIndex({ status: 1 });
  return db;
}

describe('maintenance index migration', () => {
  it('plans without mutations, upgrades legacy indexes, preserves documents, and rolls back', async () => {
    const db = await legacy();
    const doc = { _id: new ObjectId(), requestId: new ObjectId(), stripePaymentIntentId: 'pi_legacy', amount: 1234 };
    await db.collection('payments').insertOne(doc);
    const before = (await db.collection('payments').indexes()).sort((a, b) => a.name!.localeCompare(b.name!));
    const plan = await makePlan(db);
    expect(plan.changes).toHaveLength(3);
    expect((await db.collection('payments').indexes()).sort((a, b) => a.name!.localeCompare(b.name!))).toEqual(before);
    const journal = await applyPlan(db, plan, async () => {});
    expect(journal.status).toBe('complete');
    expect((await makePlan(db)).changes).toHaveLength(0);
    expect(await db.collection('payments').findOne({ _id: doc._id })).toEqual(doc);
    await rollbackPlan(db, journal);
    expect((await db.collection('payments').indexes()).sort((a, b) => a.name!.localeCompare(b.name!))).toEqual(before);
    expect(await db.collection('payments').findOne({ _id: doc._id })).toEqual(doc);
    await rollbackPlan(db, journal); // interrupted rollback can safely be retried
  });

  it('allows legacy duplicate request IDs outside the new partial index', async () => {
    const db = await legacy(); const id = new ObjectId();
    await db.collection('payments').insertMany([{ requestId: id, stripePaymentIntentId: 'pi_a' }, { requestId: id, stripePaymentIntentId: 'pi_b' }]);
    const plan = await makePlan(db);
    expect(plan.blockers).toEqual([]);
    await applyPlan(db, plan, async () => {});
    expect(await db.collection('payments').countDocuments()).toBe(2);
  });

  it('refuses owned duplicate request bindings without dropping indexes', async () => {
    const db = await legacy(); const requestId = new ObjectId();
    await db.collection('payments').insertMany([{ ownerId: 'a', requestId, stripePaymentIntentId: 'pi_a' }, { ownerId: 'b', requestId, stripePaymentIntentId: 'pi_b' }]);
    const before = (await db.collection('payments').indexes()).sort((a, b) => a.name!.localeCompare(b.name!));
    const plan = await makePlan(db);
    await expect(applyPlan(db, plan, async () => {})).rejects.toThrow('Migration blocked');
    expect((await db.collection('payments').indexes()).sort((a, b) => a.name!.localeCompare(b.name!))).toEqual(before);
  });

  it('detects explicit null duplicates in sparse payment intent index', async () => {
    const db = await legacy();
    await db.collection('payments').dropIndex('stripePaymentIntentId_1');
    await db.collection('payments').insertMany([{ stripePaymentIntentId: null }, { stripePaymentIntentId: null }]);
    expect((await makePlan(db)).blockers.join()).toContain('including explicit nulls');
  });

  it('rejects changed data, edited plans, and failed journal persistence before mutation', async () => {
    const db = await legacy(); const plan = await makePlan(db);
    await expect(applyPlan(db, { ...plan, database: 'other' }, async () => {})).rejects.toThrow('Invalid or edited');
    const before = (await db.collection('payments').indexes()).sort((a, b) => a.name!.localeCompare(b.name!));
    await expect(applyPlan(db, plan, async () => { throw new Error('disk full'); })).rejects.toThrow('disk full');
    expect((await db.collection('payments').indexes()).sort((a, b) => a.name!.localeCompare(b.name!))).toEqual(before);
    await db.collection('requests').insertOne({ title: 'concurrent write' });
    await expect(applyPlan(db, plan, async () => {})).rejects.toThrow('Database changed');
  });

  it('leaves a recoverable journal when persistence fails after a changed index', async () => {
    const db = await legacy(); const plan = await makePlan(db);
    const before = (await db.collection('payments').indexes()).sort((a, b) => a.name!.localeCompare(b.name!)); let calls = 0;
    await expect(applyPlan(db, plan, async () => { if (++calls > 1) throw new Error('disk full'); })).rejects.toThrow('disk full');
    await rollbackPlan(db, { plan });
    expect((await db.collection('payments').indexes()).sort((a, b) => a.name!.localeCompare(b.name!))).toEqual(before);
  });

  it('refuses rollback after writes resume', async () => {
    const db = await legacy(); const plan = await makePlan(db);
    const journal = await applyPlan(db, plan, async () => {});
    await db.collection('payments').insertOne({ ownerId: 'a', requestId: new ObjectId() });
    await expect(rollbackPlan(db, journal)).rejects.toThrow('Records or collections changed');
  });

  it('detects request idempotency conflicts and unrelated index definitions', async () => {
    const db = await legacy();
    await db.collection('requests').insertMany([{ ownerId: 'a', idempotencyKey: 'same' }, { ownerId: 'a', idempotencyKey: 'same' }]);
    await db.collection('payments').dropIndex('requestId_1');
    await db.collection('payments').createIndex({ amount: 1 }, { name: 'requestId_1' });
    const plan = await makePlan(db);
    expect(plan.blockers).toHaveLength(2);
    await expect(applyPlan(db, plan, async () => {})).rejects.toThrow('Migration blocked');
  });
});

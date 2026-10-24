// Synthetic records only. This never reads application Mongo/provider configuration.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BSON, MongoClient, ObjectId } from 'mongodb';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureIndexes } from '../lib/indexes.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'shaasam-migration-'));
let mongo; let client;
const run = (command, args, env = {}) => {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.error}`);
  return result.stdout;
};
const contents = async db => {
  const counts = {}; const digest = createHash('sha256');
  for (const name of ['users', 'requests', 'payments']) {
    const docs = await db.collection(name).find().sort({ _id: 1 }).toArray();
    counts[name] = docs.length; digest.update(BSON.EJSON.stringify(docs, { relaxed: false }));
  }
  return { counts, sha256: digest.digest('hex') };
};
try {
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' }, instance: { ip: '127.0.0.1' } });
  const uri = mongo.getUri();
  client = await new MongoClient(uri).connect();
  const source = client.db('shaasam_fixture'); const restored = client.db('shaasam_rehearsal');
  // Legacy definitions matched to production inspection; records are invented.
  const requestId = new ObjectId(); const humanId = new ObjectId();
  await source.collection('users').insertOne({ _id: humanId, phone: '+12025550143', alias: 'fixture-only', verified: true });
  await source.collection('users').createIndex({ phone: 1 }, { unique: true });
  await source.collection('requests').insertOne({ _id: requestId, ownerId: 'fixture-agent', idempotencyKey: 'fixture-task', budgetCents: 1500 });
  await source.collection('payments').insertOne({ requestId, humanId, ownerId: 'fixture-agent', stripePaymentIntentId: 'pi_fixture_only', amount: 1500 });
  await source.collection('payments').createIndex({ stripePaymentIntentId: 1 }, { unique: true });
  await source.collection('payments').createIndex({ requestId: 1 });
  await source.collection('payments').createIndex({ humanId: 1 });
  await source.collection('payments').createIndex({ status: 1 });
  const before = await contents(source);
  const archive = join(scratch, 'fixture.archive.gz');
  run('mongodump', ['--uri', uri, '--db', source.databaseName, `--archive=${archive}`, '--gzip']);
  run('mongorestore', ['--uri', uri, `--archive=${archive}`, '--gzip', '--nsInclude=shaasam_fixture.*', '--nsFrom=shaasam_fixture.*', '--nsTo=shaasam_rehearsal.*']);
  if ((await contents(restored)).sha256 !== before.sha256) throw new Error('Restored fixture content mismatch.');
  const env = { MONGODB_URI: uri, MONGO_URI: uri, MONGODB_DB: restored.databaseName };
  const plan = join(scratch, 'plan.json'); const journal = join(scratch, 'journal.json');
  run(process.execPath, ['scripts/migrate-payment-indexes.mjs', '--plan', plan], env);
  run(process.execPath, ['scripts/migrate-payment-indexes.mjs', '--apply', plan, '--journal', journal, '--maintenance-confirmed', '--backup-verified'], env);
  await ensureIndexes(restored); // proves application startup indexes are compatible after migration
  const noop = JSON.parse(run(process.execPath, ['scripts/migrate-payment-indexes.mjs'], env));
  if (noop.changes.length || noop.blockers.length) throw new Error('Re-run was not a no-op.');
  const after = await contents(restored);
  if (after.sha256 !== before.sha256) throw new Error('Migration changed records.');
  run(process.execPath, ['scripts/migrate-payment-indexes.mjs', '--rollback', journal, '--maintenance-confirmed'], env);
  if ((await contents(restored)).sha256 !== before.sha256) throw new Error('Rollback changed records.');
  const migrated = JSON.parse(await readFile(journal, 'utf8'));
  console.log(JSON.stringify({ scope: 'synthetic records and legacy production index shapes; no production data', backupRestore: 'passed', migration: migrated.status, applicationIndexes: 'passed', idempotentRerun: 'passed', rollback: 'passed', unchangedDocuments: before.counts, contentSha256: before.sha256 }, null, 2));
} finally {
  await client?.close(); await mongo?.stop(); await rm(scratch, { recursive: true, force: true });
}

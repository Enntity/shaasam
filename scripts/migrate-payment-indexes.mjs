// No .env autoload. Credentials and database must be selected explicitly by the operator.
import { MongoClient } from 'mongodb';
import { open, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { makePlan, applyPlan, rollbackPlan } from './lib/payment-index-migration.mjs';

const args = process.argv.slice(2);
const value = flag => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
const apply = value('--apply');
const rollback = value('--rollback');
const planPath = value('--plan');
const journalPath = value('--journal');
let client;
try {
  for (let i = 0; i < args.length; i++) {
    if (['--apply', '--rollback', '--plan', '--journal'].includes(args[i])) {
      if (!args[++i] || args[i].startsWith('--')) throw new Error('Missing argument value.');
    } else if (!['--maintenance-confirmed', '--backup-verified'].includes(args[i])) throw new Error('Unknown argument.');
  }
  if ([apply, rollback, planPath].filter(Boolean).length > 1) throw new Error('Select one of --plan FILE, --apply FILE, or --rollback FILE.');
  if ((apply || rollback) && !args.includes('--maintenance-confirmed')) throw new Error('Stop every app/worker writer before passing --maintenance-confirmed.');
  if (apply && (!args.includes('--backup-verified') || !journalPath)) throw new Error('Apply requires a restored backup (--backup-verified) and --journal FILE.');
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri || !process.env.MONGODB_DB) throw new Error('Set an explicit Mongo URI and MONGODB_DB.');
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB);
  if (rollback) {
    await rollbackPlan(db, JSON.parse(await readFile(rollback, 'utf8')));
    console.log('Original indexes restored. No documents changed. Keep writers stopped until the compatible image is selected.');
  } else if (apply) {
    const plan = JSON.parse(await readFile(apply, 'utf8'));
    let first = true;
    await applyPlan(db, plan, async journal => {
      const path = first ? journalPath : `${journalPath}.${process.pid}.tmp`;
      const file = await open(path, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(journal, null, 2) + '\n'); await file.sync(); }
      finally { await file.close(); }
      if (!first) await rename(path, journalPath);
      const directory = await open(dirname(journalPath), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
      first = false;
    });
    console.log('Migration verified. No documents changed. Keep the journal with the backup.');
  } else {
    const plan = await makePlan(db);
    if (planPath) { const file = await open(planPath, 'wx', 0o600); try { await file.writeFile(JSON.stringify(plan, null, 2) + '\n'); await file.sync(); } finally { await file.close(); } }
    console.log(JSON.stringify(plan, null, 2));
    if (plan.blockers.length) process.exitCode = 2;
  }
} catch (error) {
  // Driver messages can contain connection details. Only emit our own controlled validation errors.
  console.error(error.constructor === Error ? error.message : `Migration failed (${error.name}, code ${error.code || 'unknown'}). Preserve the journal and inspect privately.`);
  process.exitCode = 1;
} finally { await client?.close(); }

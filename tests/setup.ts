import { afterAll, beforeAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ensureIndexes } from '@/lib/indexes';

let mongo: MongoMemoryServer | null = null;

const env = process.env as Record<string, string | undefined>;
env.NODE_ENV = env.NODE_ENV || 'test';
env.AUTH_SECRET = env.AUTH_SECRET || 'test-secret';
env.SHAASAM_API_KEY = env.SHAASAM_API_KEY || 'test-api-key';
env.SHAASAM_ADMIN_KEY = env.SHAASAM_ADMIN_KEY || 'test-admin-key';

beforeAll(async () => {
  delete env.MONGODB_URI;
  delete env.MONGO_URI;
  delete env.STRIPE_SECRET_KEY;
  delete env.STRIPE_WEBHOOK_SECRET;
  delete env.TWILIO_ACCOUNT_SID;
  delete env.TWILIO_AUTH_TOKEN;
  delete env.TWILIO_FROM;
  delete env.TWILIO_API_KEY_SID;
  delete env.TWILIO_API_KEY_SECRET;
  delete env.TWILIO_VERIFY_SERVICE_SID;
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' }, instance: { ip: '127.0.0.1' } });
  env.MONGO_URI = mongo.getUri();
  env.MONGODB_DB = 'shaasam_test';
  env.SHAASAM_API_KEY = 'test-api-key';
  env.SHAASAM_ADMIN_KEY = 'test-admin-key';
  env.AUTH_SECRET = 'test-secret';
  env.NODE_ENV = 'test';
});

beforeEach(async () => {
  const { getDb } = await import('@/lib/mongodb');
  const db = await getDb();
  await db.dropDatabase();
  await ensureIndexes(db);
});

afterAll(async () => {
  const { closeDb } = await import('@/lib/mongodb');
  await closeDb();
  if (mongo) {
    await mongo.stop();
  }
});

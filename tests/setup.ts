import { afterAll, beforeAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { MongoClient } from 'mongodb';

let mongo: MongoMemoryServer | null = null;

const env = process.env as Record<string, string | undefined>;
env.NODE_ENV = env.NODE_ENV || 'test';
env.AUTH_SECRET = env.AUTH_SECRET || 'test-secret';
env.SHAASAM_API_KEY = env.SHAASAM_API_KEY || 'test-api-key';
env.SHAASAM_ADMIN_KEY = env.SHAASAM_ADMIN_KEY || 'test-admin-key';

function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  const contents = readFileSync(envPath, 'utf8');
  for (const line of contents.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key && !(key in process.env)) {
      env[key] = value;
    }
  }
}

function resolveMongoUri() {
  return (
    env.TEST_MONGO_URI ||
    env.MONGO_URI ||
    env.MONGODB_URI ||
    ''
  );
}

async function canConnect(uri: string) {
  try {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000,
    });
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    await client.close();
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  loadEnvFile();
  const existingUri = resolveMongoUri();
  if (existingUri && (await canConnect(existingUri))) {
    env.MONGO_URI = existingUri;
  } else {
    mongo = await MongoMemoryServer.create({
      instance: {
        ip: '127.0.0.1',
      },
    });
    env.MONGO_URI = mongo.getUri();
  }
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
});

afterAll(async () => {
  const { closeDb } = await import('@/lib/mongodb');
  await closeDb();
  if (mongo) {
    await mongo.stop();
  }
});

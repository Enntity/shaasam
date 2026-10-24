import { MongoClient } from 'mongodb';
import { ensureIndexes } from './indexes';

const globalWithMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
  _mongoIndexesPromise?: Promise<void>;
};

function getMongoUri() {
  const value = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!value) {
    throw new Error('Missing MONGODB_URI (or MONGO_URI)');
  }
  return value;
}

function getMongoDbName() {
  return process.env.MONGODB_DB || 'shaasam';
}

async function getClient() {
  if (!globalWithMongo._mongoClientPromise) {
    const client = new MongoClient(getMongoUri(), { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
    globalWithMongo._mongoClientPromise = client.connect().catch((error) => { globalWithMongo._mongoClientPromise = undefined; throw error; });
  }
  return globalWithMongo._mongoClientPromise;
}

export async function getDb() {
  const client = await getClient();
  const db = client.db(getMongoDbName());
  if (!globalWithMongo._mongoIndexesPromise) {
    globalWithMongo._mongoIndexesPromise = ensureIndexes(db).catch((error) => {
      globalWithMongo._mongoIndexesPromise = undefined;
      throw error;
    });
  }
  await globalWithMongo._mongoIndexesPromise;
  return db;
}

export async function closeDb() {
  if (!globalWithMongo._mongoClientPromise) {
    return;
  }
  const client = await globalWithMongo._mongoClientPromise;
  await client.close();
  globalWithMongo._mongoClientPromise = undefined;
  globalWithMongo._mongoIndexesPromise = undefined;
}

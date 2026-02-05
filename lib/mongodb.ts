import { MongoClient } from 'mongodb';
import { ensureIndexes } from './indexes';

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
const dbName = process.env.MONGODB_DB || 'shaasam';

if (!uri) {
  throw new Error('Missing MONGODB_URI (or MONGO_URI)');
}

const globalWithMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
  _mongoIndexesPromise?: Promise<void>;
};

let clientPromise: Promise<MongoClient>;

if (!globalWithMongo._mongoClientPromise) {
  const client = new MongoClient(uri);
  globalWithMongo._mongoClientPromise = client.connect();
}

clientPromise = globalWithMongo._mongoClientPromise;

export async function getDb() {
  const client = await clientPromise;
  const db = client.db(dbName);
  if (!globalWithMongo._mongoIndexesPromise) {
    globalWithMongo._mongoIndexesPromise = ensureIndexes(db).catch((error) => {
      console.warn('Index setup failed', error);
    });
  }
  await globalWithMongo._mongoIndexesPromise;
  return db;
}

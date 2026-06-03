import { MongoClient } from "mongodb";
import { config } from "./config.js";

let clientPromise = null;

function ensureMongoConfig() {
  if (!config.mongoUri || config.mongoUri.trim().length === 0) {
    throw new Error("STORAGE_MODE is set to mongo but MONGODB_URI is missing");
  }
}

async function getClient() {
  ensureMongoConfig();
  if (!clientPromise) {
    const client = new MongoClient(config.mongoUri, {
      maxPoolSize: 10,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 8000,
    });
    clientPromise = client.connect();
  }
  return clientPromise;
}

export async function getMongoDb() {
  const client = await getClient();
  return client.db(config.mongoDbName || "bdvs");
}

export async function getCollection(name) {
  const db = await getMongoDb();
  return db.collection(name);
}

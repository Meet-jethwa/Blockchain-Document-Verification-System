import { MongoClient } from "mongodb";
import { config } from "./config.js";

// If MONGODB_URI is not set, fail fast — we require MongoDB for persistence.
const mongoUri = config.mongodbUri;
if (!mongoUri) {
  throw new Error(
    "MONGODB_URI is not configured. Set MONGODB_URI env var to a MongoDB connection string to enable persistent storage."
  );
}

let mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 2500 });
let mongoDb = null;
let mongoConnectPromise = null;
let mongoConnectError = null;
async function ensureMongo() {
  if (!mongoClient) return null;
  if (mongoDb) return mongoDb;
  if (!mongoConnectPromise) {
    mongoConnectPromise = mongoClient
      .connect()
      .then(() => {
        mongoDb = mongoClient.db();
        return mongoDb;
      })
      .catch((err) => {
        mongoClient = null;
        mongoConnectPromise = null;
        mongoDb = null;
        mongoConnectError = err;
        // eslint-disable-next-line no-console
        console.error(
          `[documentStore] MongoDB connection failed: ${err instanceof Error ? err.message : String(err)}. ` +
            `Ensure MONGODB_URI is correct and the database is reachable.`,
        );
        throw err;
      });
  }
  return mongoConnectPromise;
}

async function getCollection() {
  const db = await ensureMongo();
  if (!db) {
    if (mongoConnectError) {
      throw new Error(
        `MongoDB not available: ${mongoConnectError instanceof Error ? mongoConnectError.message : String(mongoConnectError)}`,
      );
    }
    throw new Error('MongoDB not available: MONGODB_URI is missing or empty');
  }
  return db.collection("documents");
}

export async function putDocument(hash, doc) {
  if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
    throw new Error("putDocument: invalid hash");
  }

  const collection = await getCollection();
  const sanitized = {
    _id: hash,
    ipfs: doc?.ipfs ? { cid: doc.ipfs.cid ?? null, provider: doc.ipfs.provider ?? null } : null,
    encryption: doc?.encryption ? doc.encryption : null,
  };
  await collection.updateOne({ _id: hash }, { $set: sanitized }, { upsert: true });
}

export async function getDocument(hash) {
  if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
    throw new Error("getDocument: invalid hash");
  }

  const collection = await getCollection();
  const doc = await collection.findOne({ _id: hash }, { projection: { _id: 0 } });
  return doc ?? null;
}

export async function listDocuments() {
  const collection = await getCollection();
  const docs = await collection.find({}).toArray();
  return docs.map((doc) => {
    const { _id, ...rest } = doc;
    return { hash: _id, ...rest };
  });
}

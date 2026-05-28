import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "documents.json");

let writeQueue = Promise.resolve();

let mongoClient = null;
let mongoCollection = null;
const useMongo = Boolean(config.mongodbUri);

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function initMongo() {
  if (!useMongo) return;
  if (mongoClient) return;
  mongoClient = new MongoClient(config.mongodbUri, {});
  await mongoClient.connect();
  const dbName = new URL(config.mongodbUri).pathname.replace(/^\//, "") || "docvault";
  const db = mongoClient.db(dbName);
  mongoCollection = db.collection("documents");
  await mongoCollection.createIndex({ hash: 1 }, { unique: true });
}

async function loadStore() {
  await ensureDataDir();

  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid document store");
    if (!parsed.documents || typeof parsed.documents !== "object") {
      return { version: 1, documents: {} };
    }
    return { version: 1, documents: parsed.documents };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return { version: 1, documents: {} };
    }
    throw err;
  }
}

async function saveStore(store) {
  await ensureDataDir();
  const tmp = `${STORE_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, STORE_PATH);
}

function normalizeHash(hash) {
  return String(hash).toLowerCase();
}

export async function getDocument(hash) {
  if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
    throw new Error("getDocument: invalid hash");
  }

  const key = normalizeHash(hash);
  if (useMongo) {
    await initMongo();
    const doc = await mongoCollection.findOne({ hash: key });
    return doc ?? null;
  }

  const store = await loadStore();
  return store.documents[key] ?? null;
}

export async function listDocuments() {
  if (useMongo) {
    await initMongo();
    const docs = await mongoCollection.find({}).toArray();
    return docs;
  }
  const store = await loadStore();
  return Object.values(store.documents);
}

export async function putDocument(document) {
  if (!document || typeof document !== "object") {
    throw new Error("putDocument: invalid document");
  }

  if (typeof document.hash !== "string" || !document.hash.startsWith("0x") || document.hash.length !== 66) {
    throw new Error("putDocument: invalid hash");
  }

  const key = normalizeHash(document.hash);
  const nextDocument = {
    ...document,
    hash: document.hash,
    updatedAt: Date.now(),
  };

  if (useMongo) {
    await initMongo();
    await mongoCollection.updateOne({ hash: key }, { $set: nextDocument }, { upsert: true });
    return nextDocument;
  }

  writeQueue = writeQueue.then(async () => {
    const store = await loadStore();
    store.documents[key] = nextDocument;
    await saveStore(store);
  });

  await writeQueue;
  return nextDocument;
}
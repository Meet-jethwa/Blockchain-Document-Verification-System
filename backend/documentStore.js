import { MongoClient } from "mongodb";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "documents.json");

const mongoUri = process.env.MONGODB_URI?.trim();
let mongoClient = mongoUri ? new MongoClient(mongoUri, { serverSelectionTimeoutMS: 2500 }) : null;
let mongoDb = null;
let mongoConnectPromise = null;
let mongoDisabled = false;
let writeQueue = Promise.resolve();

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadJsonStore() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid store");
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

async function saveJsonStore(store) {
  await ensureDataDir();
  const tmp = `${STORE_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, STORE_PATH);
}

async function ensureMongo() {
  if (!mongoClient || mongoDisabled) return null;
  if (mongoDb) return mongoDb;
  if (!mongoConnectPromise) {
    mongoConnectPromise = mongoClient
      .connect()
      .then(() => {
        mongoDb = mongoClient.db();
        return mongoDb;
      })
      .catch((err) => {
        mongoDisabled = true;
        mongoClient = null;
        mongoConnectPromise = null;
        mongoDb = null;
        // eslint-disable-next-line no-console
        console.warn(
          `[documentStore] MongoDB unavailable (${err instanceof Error ? err.message : String(err)}); falling back to JSON store.`,
        );
        return null;
      });
  }
  return mongoConnectPromise;
}

async function getCollection() {
  const db = await ensureMongo();
  return db ? db.collection("documents") : null;
}

export async function putDocument(hash, doc) {
  if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
    throw new Error("putDocument: invalid hash");
  }

  writeQueue = writeQueue.then(async () => {
    const collection = await getCollection();
    if (collection) {
      await collection.updateOne(
        { _id: hash },
        { $set: { ...doc, _id: hash } },
        { upsert: true },
      );
      return;
    }

    const store = await loadJsonStore();
    store.documents[hash] = doc;
    await saveJsonStore(store);
  });

  await writeQueue;
}

export async function getDocument(hash) {
  if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
    throw new Error("getDocument: invalid hash");
  }

  const collection = await getCollection();
  if (collection) {
    const doc = await collection.findOne({ _id: hash }, { projection: { _id: 0 } });
    return doc ?? null;
  }

  const store = await loadJsonStore();
  return store.documents[hash] ?? null;
}

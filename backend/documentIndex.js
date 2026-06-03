import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { getCollection } from "./mongoStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "documents.json");

let writeQueue = Promise.resolve();

const DOCUMENTS_COLLECTION = "documents";

// MongoDB removed: always use local JSON store for document index

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// initMongo removed: using local JSON file store only

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

  if (config.storageMode === "mongo") {
    const collection = await getCollection(DOCUMENTS_COLLECTION);
    const record = await collection.findOne({ _id: key });
    if (!record) return null;
    const { _id, ...rest } = record;
    return rest;
  }

  const store = await loadStore();
  return store.documents[key] ?? null;
}

export async function listDocuments() {
  if (config.storageMode === "mongo") {
    const collection = await getCollection(DOCUMENTS_COLLECTION);
    const docs = await collection.find({}).toArray();
    return docs.map(({ _id, ...rest }) => rest);
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

  if (config.storageMode === "mongo") {
    const collection = await getCollection(DOCUMENTS_COLLECTION);
    await collection.updateOne(
      { _id: key },
      { $set: nextDocument },
      { upsert: true }
    );
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

export async function deleteDocument(hash) {
  if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
    throw new Error("deleteDocument: invalid hash");
  }

  const key = normalizeHash(hash);

  if (config.storageMode === "mongo") {
    const collection = await getCollection(DOCUMENTS_COLLECTION);
    const result = await collection.deleteOne({ _id: key });
    return result.deletedCount > 0;
  }

  let deleted = false;
  writeQueue = writeQueue.then(async () => {
    const store = await loadStore();
    if (store.documents[key]) {
      delete store.documents[key];
      deleted = true;
      await saveStore(store);
    }
  });

  await writeQueue;
  return deleted;
}
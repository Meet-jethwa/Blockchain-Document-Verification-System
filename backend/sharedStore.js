import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { getCollection } from "./mongoStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "shared.json");
let writeQueue = Promise.resolve();

const SHARED_COLLECTION = "shared";

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadStore() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid shared store");
    if (!parsed.shared || typeof parsed.shared !== "object") {
      return { version: 1, shared: {} };
    }
    return { version: 1, shared: parsed.shared };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return { version: 1, shared: {} };
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

function normalizeAddress(address) {
  return String(address).toLowerCase();
}

function normalizeHash(hash) {
  return String(hash).toLowerCase();
}

export async function listSharedDocuments(viewerAddress) {
  if (typeof viewerAddress !== "string" || !viewerAddress.startsWith("0x") || viewerAddress.length !== 42) {
    throw new Error("listSharedDocuments: invalid address");
  }

  const key = normalizeAddress(viewerAddress);

  if (config.storageMode === "mongo") {
    const collection = await getCollection(SHARED_COLLECTION);
    const record = await collection.findOne({ _id: key });
    return record?.documents ?? [];
  }

  const store = await loadStore();
  return store.shared[key] ?? [];
}

export async function putSharedDocument(viewerAddress, document) {
  if (typeof viewerAddress !== "string" || !viewerAddress.startsWith("0x") || viewerAddress.length !== 42) {
    throw new Error("putSharedDocument: invalid address");
  }
  if (!document || typeof document !== "object") {
    throw new Error("putSharedDocument: invalid document");
  }
  if (typeof document.hash !== "string" || !document.hash.startsWith("0x") || document.hash.length !== 66) {
    throw new Error("putSharedDocument: invalid hash");
  }

  const key = normalizeAddress(viewerAddress);
  const nextDocument = {
    ...document,
    hash: document.hash,
    updatedAt: Date.now(),
  };

  if (config.storageMode === "mongo") {
    const collection = await getCollection(SHARED_COLLECTION);
    const current = await collection.findOne({ _id: key });
    const docs = Array.isArray(current?.documents) ? current.documents : [];
    const docsByHash = new Map(docs.map((entry) => [normalizeHash(entry.hash), entry]));
    docsByHash.set(normalizeHash(nextDocument.hash), nextDocument);
    await collection.updateOne(
      { _id: key },
      { $set: { viewerAddress: key, documents: [...docsByHash.values()], updatedAt: Date.now() } },
      { upsert: true }
    );
    return nextDocument;
  }

  writeQueue = writeQueue.then(async () => {
    const store = await loadStore();
    const current = store.shared[key] ?? [];
    const currentByHash = new Map(current.map((entry) => [normalizeHash(entry.hash), entry]));
    currentByHash.set(normalizeHash(nextDocument.hash), nextDocument);
    store.shared[key] = [...currentByHash.values()];
    await saveStore(store);
  });

  await writeQueue;
  return nextDocument;
}

export async function listSharedDocumentsEnriched(viewerAddress) {
  if (typeof viewerAddress !== "string" || !viewerAddress.startsWith("0x") || viewerAddress.length !== 42) {
    throw new Error("listSharedDocumentsEnriched: invalid address");
  }

  const sharedDocs = await listSharedDocuments(viewerAddress);
  if (sharedDocs.length === 0) return [];

  // In mongo mode, cross-reference with the documents collection for full metadata
  if (config.storageMode === "mongo") {
    const docsCollection = await getCollection("documents");
    const hashes = sharedDocs.map((doc) => normalizeHash(doc.hash));
    const fullDocs = await docsCollection.find({ _id: { $in: hashes } }).toArray();
    const fullDocsByHash = new Map(fullDocs.map((doc) => [String(doc._id), doc]));

    return sharedDocs.map((sharedDoc) => {
      const key = normalizeHash(sharedDoc.hash);
      const fullDoc = fullDocsByHash.get(key) ?? null;
      return {
        hash: sharedDoc.hash,
        name: fullDoc?.name || sharedDoc.name || `Document ${sharedDoc.hash.slice(0, 10)}…${sharedDoc.hash.slice(-6)}`,
        owner: sharedDoc.owner || fullDoc?.owner || null,
        createdAt: sharedDoc.createdAt ?? fullDoc?.createdAt ?? null,
        verified: sharedDoc.verified ?? fullDoc?.verified ?? true,
        status: sharedDoc.status || fullDoc?.status || "Registered",
        cid: sharedDoc.cid || fullDoc?.ipfs?.cid || fullDoc?.cid || null,
        access: "shared",
        file: fullDoc?.file ?? null,
        ipfs: fullDoc?.ipfs ?? null,
        sharedAt: sharedDoc.updatedAt ?? null,
      };
    });
  }

  // JSON fallback: return shared docs as-is (no documents collection to cross-reference)
  return sharedDocs.map((doc) => ({
    hash: doc.hash,
    name: doc.name || `Document ${doc.hash.slice(0, 10)}…${doc.hash.slice(-6)}`,
    owner: doc.owner || null,
    createdAt: doc.createdAt ?? null,
    verified: doc.verified ?? true,
    status: doc.status || "Registered",
    cid: doc.cid || null,
    access: "shared",
    file: null,
    ipfs: null,
    sharedAt: doc.updatedAt ?? null,
  }));
}

export async function deleteSharedDocument(hash) {
  if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
    throw new Error("deleteSharedDocument: invalid hash");
  }

  const normalizedHash = normalizeHash(hash);

  if (config.storageMode === "mongo") {
    const collection = await getCollection(SHARED_COLLECTION);
    const result = await collection.updateMany(
      {},
      { $pull: { documents: { hash: normalizedHash } } }
    );
    return (result.modifiedCount ?? 0) > 0;
  }

  let deleted = false;
  writeQueue = writeQueue.then(async () => {
    const store = await loadStore();
    for (const viewer of Object.keys(store.shared)) {
      const next = (store.shared[viewer] ?? []).filter((entry) => normalizeHash(entry.hash) !== normalizedHash);
      if (next.length !== (store.shared[viewer] ?? []).length) {
        store.shared[viewer] = next;
        deleted = true;
      }
    }
    if (deleted) {
      await saveStore(store);
    }
  });

  await writeQueue;
  return deleted;
}

export async function deleteSharedDocumentForViewer(viewerAddress, hash) {
  if (typeof viewerAddress !== "string" || !viewerAddress.startsWith("0x") || viewerAddress.length !== 42) {
    throw new Error("deleteSharedDocumentForViewer: invalid address");
  }
  if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
    throw new Error("deleteSharedDocumentForViewer: invalid hash");
  }

  const viewerKey = normalizeAddress(viewerAddress);
  const normalizedHash = normalizeHash(hash);

  if (config.storageMode === "mongo") {
    const collection = await getCollection(SHARED_COLLECTION);
    const result = await collection.updateOne(
      { _id: viewerKey },
      { $pull: { documents: { hash: normalizedHash } } }
    );
    return (result.modifiedCount ?? 0) > 0 || (result.matchedCount ?? 0) > 0;
  }

  let deleted = false;
  writeQueue = writeQueue.then(async () => {
    const store = await loadStore();
    const current = store.shared[viewerKey] ?? [];
    const next = current.filter((entry) => normalizeHash(entry.hash) !== normalizedHash);
    deleted = next.length !== current.length;
    store.shared[viewerKey] = next;
    if (deleted) {
      await saveStore(store);
    }
  });

  await writeQueue;
  return deleted;
}
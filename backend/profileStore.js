import { MongoClient } from "mongodb";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "profiles.json");

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
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid profile store");
    if (!parsed.profiles || typeof parsed.profiles !== "object") {
      return { version: 1, profiles: {} };
    }
    return { version: 1, profiles: parsed.profiles };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return { version: 1, profiles: {} };
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
          `[profileStore] MongoDB unavailable (${err instanceof Error ? err.message : String(err)}); falling back to JSON store.`,
        );
        return null;
      });
  }
  return mongoConnectPromise;
}

async function getCollection() {
  const db = await ensureMongo();
  return db ? db.collection("profiles") : null;
}

function normalizeAddress(address) {
  return String(address).toLowerCase();
}

export function createDefaultProfile(address) {
  return {
    address,
    name: "My Profile",
    title: "Document owner",
    email: "",
    bio: "",
    photoDataUrl: null,
    preferredTheme: "dark",
    updatedAt: null,
  };
}

export async function getProfile(address) {
  if (typeof address !== "string" || !address.startsWith("0x") || address.length !== 42) {
    throw new Error("getProfile: invalid address");
  }

  const key = normalizeAddress(address);
  const collection = await getCollection();
  if (collection) {
    const doc = await collection.findOne({ _id: key }, { projection: { _id: 0 } });
    return doc ?? null;
  }

  const store = await loadJsonStore();
  return store.profiles[key] ?? null;
}

export async function putProfile(address, profile) {
  if (typeof address !== "string" || !address.startsWith("0x") || address.length !== 42) {
    throw new Error("putProfile: invalid address");
  }

  const key = normalizeAddress(address);
  const nextProfile = {
    ...createDefaultProfile(address),
    ...profile,
    address,
    updatedAt: Date.now(),
  };

  writeQueue = writeQueue.then(async () => {
    const collection = await getCollection();
    if (collection) {
      await collection.updateOne(
        { _id: key },
        { $set: { ...nextProfile, _id: key } },
        { upsert: true },
      );
      return;
    }

    const store = await loadJsonStore();
    store.profiles[key] = nextProfile;
    await saveJsonStore(store);
  });

  await writeQueue;
  return nextProfile;
}
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "profiles.json");
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
    preferredTheme: "light",
    updatedAt: null,
  };
}

export async function getProfile(address) {
  if (typeof address !== "string" || !address.startsWith("0x") || address.length !== 42) {
    throw new Error("getProfile: invalid address");
  }

  const key = normalizeAddress(address);
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
    const store = await loadJsonStore();
    store.profiles[key] = nextProfile;
    await saveJsonStore(store);
  });

  await writeQueue;
  return nextProfile;
}
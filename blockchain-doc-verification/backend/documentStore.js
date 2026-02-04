import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "documents.json");

let writeQueue = Promise.resolve();

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadStore() {
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

async function saveStore(store) {
  await ensureDataDir();
  const tmp = `${STORE_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, STORE_PATH);
}

export async function putDocument(hash, doc) {
  if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
    throw new Error("putDocument: invalid hash");
  }

  writeQueue = writeQueue.then(async () => {
    const store = await loadStore();
    store.documents[hash] = doc;
    await saveStore(store);
  });

  await writeQueue;
}

export async function getDocument(hash) {
  if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
    throw new Error("getDocument: invalid hash");
  }
  const store = await loadStore();
  return store.documents[hash] ?? null;
}

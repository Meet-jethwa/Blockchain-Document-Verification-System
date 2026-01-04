import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_STORE_PATH = fileURLToPath(new URL("./data/registry.json", import.meta.url));

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return {};
    }
    throw err;
  }
}

async function writeJsonFileAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp`;
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(tmpPath, json, "utf8");
  await fs.rename(tmpPath, filePath);
}

export class RegistryStore {
  constructor(filePath = DEFAULT_STORE_PATH) {
    this.filePath = filePath;
    this.map = new Map();
    this._loaded = false;
  }

  async init() {
    if (this._loaded) return;

    const obj = await readJsonFile(this.filePath);
    for (const [hash, record] of Object.entries(obj)) {
      if (typeof hash === "string" && record && typeof record === "object") {
        this.map.set(hash, record);
      }
    }

    this._loaded = true;
  }

  get(hash) {
    return this.map.get(hash) ?? null;
  }

  async upsert(hash, record) {
    this.map.set(hash, record);
    await this.flush();
  }

  async flush() {
    const obj = Object.fromEntries(this.map.entries());
    await writeJsonFileAtomic(this.filePath, obj);
  }
}

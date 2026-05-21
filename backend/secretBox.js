import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

const WRAP_CIPHER = "aes-256-gcm";

function parseKeyMaterial(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;

  // hex (with or without 0x)
  const hex = s.startsWith("0x") ? s.slice(2) : s;
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length === 64) {
    return Buffer.from(hex, "hex");
  }

  // base64
  try {
    const b = Buffer.from(s, "base64");
    if (b.length === 32) return b;
  } catch {
    // ignore
  }

  return null;
}

export function getMasterKeyFromEnv(value) {
  const key = parseKeyMaterial(value);
  if (!key) return null;
  if (key.length !== 32) return null;
  return key;
}

export function wrapSecret(plaintext, masterKey) {
  if (!Buffer.isBuffer(plaintext)) throw new TypeError("wrapSecret: plaintext must be a Buffer");
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) {
    throw new TypeError("wrapSecret: masterKey must be a 32-byte Buffer");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(WRAP_CIPHER, masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    alg: WRAP_CIPHER,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: ciphertext.toString("base64"),
  };
}

export function unwrapSecret(wrapped, masterKey) {
  if (!wrapped || typeof wrapped !== "object") {
    throw new TypeError("unwrapSecret: wrapped must be an object");
  }
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) {
    throw new TypeError("unwrapSecret: masterKey must be a 32-byte Buffer");
  }
  if (wrapped.alg !== WRAP_CIPHER) {
    throw new Error(`unwrapSecret: unsupported alg ${String(wrapped.alg)}`);
  }

  const iv = Buffer.from(String(wrapped.iv), "base64");
  const tag = Buffer.from(String(wrapped.tag), "base64");
  const data = Buffer.from(String(wrapped.data), "base64");

  const decipher = createDecipheriv(WRAP_CIPHER, masterKey, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function equalBytes(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const DEFAULT_CIPHER = "aes-256-gcm";

export function encryptFile(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("encryptFile: buffer must be a Buffer");
  }

  const key = randomBytes(32); // AES-256 (32 bytes)
  const iv = randomBytes(12);  // GCM IV (12 bytes recommended)

  const cipher = createCipheriv(DEFAULT_CIPHER, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16-byte authentication tag

  return { encrypted, key, iv, authTag, alg: DEFAULT_CIPHER };
}

export function decryptFile(encryptedBuffer, key, iv, authTag = null, alg = DEFAULT_CIPHER) {
  if (!Buffer.isBuffer(encryptedBuffer)) {
    throw new TypeError("decryptFile: encryptedBuffer must be a Buffer");
  }
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new TypeError("decryptFile: key must be a 32-byte Buffer");
  }

  const cipherAlg = alg || DEFAULT_CIPHER;

  if (cipherAlg === "aes-256-gcm") {
    if (!Buffer.isBuffer(iv) || iv.length !== 12) {
      throw new TypeError("decryptFile: AES-256-GCM requires a 12-byte IV");
    }
    if (!Buffer.isBuffer(authTag) || authTag.length !== 16) {
      throw new TypeError("decryptFile: AES-256-GCM requires a 16-byte authTag");
    }

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  }

  if (cipherAlg === "aes-256-cbc") {
    if (!Buffer.isBuffer(iv) || iv.length !== 16) {
      throw new TypeError("decryptFile: AES-256-CBC requires a 16-byte IV");
    }
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  }

  throw new Error(`decryptFile: unsupported algorithm '${cipherAlg}'`);
}


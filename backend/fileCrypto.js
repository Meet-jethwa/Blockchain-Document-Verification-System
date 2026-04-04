import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const FILE_CIPHER = "aes-256-cbc";

export function encryptFile(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("encryptFile: buffer must be a Buffer");
  }

  const key = randomBytes(32); // AES-256
  const iv = randomBytes(16); // CBC IV

  const cipher = createCipheriv(FILE_CIPHER, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);

  return { encrypted, key, iv, alg: FILE_CIPHER };
}

export function decryptFile(encryptedBuffer, key, iv) {
  if (!Buffer.isBuffer(encryptedBuffer)) {
    throw new TypeError("decryptFile: encryptedBuffer must be a Buffer");
  }
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new TypeError("decryptFile: key must be a 32-byte Buffer");
  }
  if (!Buffer.isBuffer(iv) || iv.length !== 16) {
    throw new TypeError("decryptFile: iv must be a 16-byte Buffer");
  }

  const decipher = createDecipheriv(FILE_CIPHER, key, iv);
  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
}

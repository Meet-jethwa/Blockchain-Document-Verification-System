import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const DEFAULT_CIPHER = "aes-256-gcm";
export const AAD_FIXED_LABEL = "BDVS-DOCUMENT-AAD:";
export const CIPHERTEXT_VERSION_BYTE = 0x01;

/**
 * Derives Additional Authenticated Data (AAD) for AES-256-GCM
 * by combining a fixed label and the document digest H.
 */
export function getDocumentAad(digest) {
  let digestStr;
  if (typeof digest === "string") {
    digestStr = digest.startsWith("0x") ? digest.toLowerCase() : "0x" + digest.toLowerCase();
  } else {
    digestStr = "0x" + Buffer.from(digest).toString("hex").toLowerCase();
  }
  return Buffer.from(AAD_FIXED_LABEL + digestStr, "utf8");
}

/**
 * Packs [version byte (0x01)][12-byte IV][ciphertext][16-byte authTag] for storage.
 */
export function packEncryptedBuffer(encrypted, iv, authTag, version = CIPHERTEXT_VERSION_BYTE) {
  return Buffer.concat([Buffer.from([version]), iv, encrypted, authTag]);
}

/**
 * Unpacks an encrypted buffer, extracting version, IV, ciphertext, and authTag.
 */
export function unpackEncryptedBuffer(buffer) {
  const IV_LENGTH = 12;
  const TAG_LENGTH = 16;
  const MIN_V1_LENGTH = 1 + IV_LENGTH + TAG_LENGTH;

  if (buffer.length >= MIN_V1_LENGTH && buffer[0] === CIPHERTEXT_VERSION_BYTE) {
    const iv = buffer.subarray(1, 1 + IV_LENGTH);
    const ciphertext = buffer.subarray(1 + IV_LENGTH, buffer.length - TAG_LENGTH);
    const authTag = buffer.subarray(buffer.length - TAG_LENGTH);
    return { version: CIPHERTEXT_VERSION_BYTE, iv, ciphertext, authTag };
  }

  if (buffer.length >= IV_LENGTH + TAG_LENGTH) {
    const iv = buffer.subarray(0, IV_LENGTH);
    const ciphertext = buffer.subarray(IV_LENGTH, buffer.length - TAG_LENGTH);
    const authTag = buffer.subarray(buffer.length - TAG_LENGTH);
    return { version: null, iv, ciphertext, authTag };
  }

  if (buffer.length >= TAG_LENGTH) {
    const ciphertext = buffer.subarray(0, buffer.length - TAG_LENGTH);
    const authTag = buffer.subarray(buffer.length - TAG_LENGTH);
    return { version: null, iv: Buffer.alloc(12, 0), ciphertext, authTag };
  }

  throw new Error("Encrypted buffer too short to contain valid ciphertext and auth tag");
}

export function encryptFile(buffer, aadOrDigest = null) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("encryptFile: buffer must be a Buffer");
  }

  const key = randomBytes(32); // AES-256 (32 bytes)
  const iv = randomBytes(12);  // GCM IV (12 bytes recommended)

  const cipher = createCipheriv(DEFAULT_CIPHER, key, iv);
  let aad = null;
  if (aadOrDigest) {
    aad = Buffer.isBuffer(aadOrDigest) && aadOrDigest.length !== 32
      ? aadOrDigest
      : getDocumentAad(aadOrDigest);
    cipher.setAAD(aad);
  }
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16-byte authentication tag

  return { encrypted, key, iv, authTag, alg: DEFAULT_CIPHER, aad };
}

export function decryptFile(encryptedBuffer, key, iv, authTag = null, alg = DEFAULT_CIPHER, aadOrDigest = null) {
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
    if (aadOrDigest) {
      const aad = Buffer.isBuffer(aadOrDigest) && aadOrDigest.length !== 32
        ? aadOrDigest
        : getDocumentAad(aadOrDigest);
      decipher.setAAD(aad);
    }
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



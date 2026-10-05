import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  encryptFile,
  decryptFile,
  getDocumentAad,
  packEncryptedBuffer,
  unpackEncryptedBuffer,
  AAD_FIXED_LABEL,
  CIPHERTEXT_VERSION_BYTE,
} from '../backend/fileCrypto.js';

console.log('===============================================================');
console.log('   TEST SUITE: AES-256-GCM AAD & VERSION MARKER COMPATIBILITY   ');
console.log('===============================================================');

const samplePlaintext = Buffer.from('Confidential Degree Certificate & Academic Record for Verification - 2026');
const sampleDigest = '0x' + crypto.createHash('sha256').update(samplePlaintext).digest('hex');
const wrongDigest = '0x' + crypto.createHash('sha256').update(Buffer.from('Different Document Content')).digest('hex');

// -----------------------------------------------------------------------------
// Test 1: Node.js Crypto Implementation
// -----------------------------------------------------------------------------
console.log('\n--- 1. Node.js Native Crypto Suite (backend/fileCrypto.js) ---');

// Test 1.1: Round-trip with AAD (using digest H) and version byte packing
console.log('[+] Test 1.1: Encrypt with AAD, pack with version byte, unpack & decrypt with matching digest');
const encResult = encryptFile(samplePlaintext, sampleDigest);
assert(encResult.encrypted && encResult.iv && encResult.authTag);
assert(encResult.aad.toString().includes(AAD_FIXED_LABEL));
assert(encResult.aad.toString().includes(sampleDigest.toLowerCase()));

const packedBuffer = packEncryptedBuffer(encResult.encrypted, encResult.iv, encResult.authTag);
assert.strictEqual(packedBuffer[0], CIPHERTEXT_VERSION_BYTE, 'First byte must be version marker 0x01');

const unpacked = unpackEncryptedBuffer(packedBuffer);
assert.strictEqual(unpacked.version, CIPHERTEXT_VERSION_BYTE);
assert.deepStrictEqual(unpacked.iv, encResult.iv);
assert.deepStrictEqual(unpacked.authTag, encResult.authTag);

const decrypted = decryptFile(unpacked.ciphertext, encResult.key, unpacked.iv, unpacked.authTag, 'aes-256-gcm', sampleDigest);
assert.strictEqual(decrypted.toString('utf8'), samplePlaintext.toString('utf8'), 'Decrypted plaintext must match original');
console.log('    ✓ PASS: Round-trip decrypted plaintext matches perfectly.');

// Test 1.2: Wrong-digest failure
console.log('[+] Test 1.2: Attempt decrypt with wrong requested digest H -> MUST FAIL');
let failedAsExpected = false;
try {
  decryptFile(unpacked.ciphertext, encResult.key, unpacked.iv, unpacked.authTag, 'aes-256-gcm', wrongDigest);
} catch (err) {
  failedAsExpected = true;
  console.log(`    ✓ PASS: Decryption failed as expected with wrong digest: ${err.message}`);
}
assert(failedAsExpected, 'Decryption with wrong digest MUST throw an authentication failure error');

// Test 1.3: Legacy document decryption (stored without AAD and without version byte)
console.log('[+] Test 1.3: Legacy document (no AAD, no version byte) -> MUST DECRYPT OLD WAY');
const legacyKey = crypto.randomBytes(32);
const legacyIv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', legacyKey, legacyIv);
const legacyEncrypted = Buffer.concat([cipher.update(samplePlaintext), cipher.final()]);
const legacyTag = cipher.getAuthTag();

// Legacy wire format: [12-byte IV][ciphertext][16-byte authTag]
const legacyBuffer = Buffer.concat([legacyIv, legacyEncrypted, legacyTag]);

const unpackedLegacy = unpackEncryptedBuffer(legacyBuffer);
assert.strictEqual(unpackedLegacy.version, null, 'Legacy payload must have null version');
assert.deepStrictEqual(unpackedLegacy.iv, legacyIv);

const legacyDecrypted = decryptFile(unpackedLegacy.ciphertext, legacyKey, unpackedLegacy.iv, unpackedLegacy.authTag, 'aes-256-gcm', null);
assert.strictEqual(legacyDecrypted.toString('utf8'), samplePlaintext.toString('utf8'));
console.log('    ✓ PASS: Legacy document without AAD and without version byte decrypts successfully.');

// -----------------------------------------------------------------------------
// Test 2: Web Crypto API Implementation (frontend/src/clientCrypto.ts)
// -----------------------------------------------------------------------------
console.log('\n--- 2. Web Crypto API Suite (simulating browser crypto.subtle) ---');

const subtle = globalThis.crypto.subtle;

// Helper mirroring clientCrypto.ts for WebCrypto testing
function webCryptoGetDocumentAad(digest) {
  const digestStr = typeof digest === 'string'
    ? (digest.startsWith('0x') ? digest.toLowerCase() : '0x' + digest.toLowerCase())
    : '0x' + Buffer.from(digest).toString('hex').toLowerCase();
  return new TextEncoder().encode(AAD_FIXED_LABEL + digestStr);
}

async function testWebCrypto() {
  const aesKey = await subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const plainBytes = new Uint8Array(samplePlaintext);
  const iv = crypto.randomBytes(12);
  const aad = webCryptoGetDocumentAad(sampleDigest);

  // WebCrypto Encrypt with AAD
  const encryptedBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    aesKey,
    plainBytes
  );

  const encArray = new Uint8Array(encryptedBuf);
  const tagLength = 16;
  const ciphertext = encArray.slice(0, encArray.length - tagLength);
  const authTag = encArray.slice(encArray.length - tagLength);

  // Pack with version byte 0x01
  const packed = new Uint8Array(1 + iv.length + ciphertext.length + authTag.length);
  packed[0] = CIPHERTEXT_VERSION_BYTE;
  packed.set(iv, 1);
  packed.set(ciphertext, 1 + iv.length);
  packed.set(authTag, 1 + iv.length + ciphertext.length);

  assert.strictEqual(packed[0], 0x01, 'Version byte must be 0x01');

  // Test 2.1: WebCrypto Round-trip with correct digest
  console.log('[+] Test 2.1: WebCrypto round-trip with requested digest as AAD');
  const unpackedIv = packed.slice(1, 13);
  const unpackedCipher = packed.slice(13, packed.length - 16);
  const unpackedTag = packed.slice(packed.length - 16);

  const combined = new Uint8Array(unpackedCipher.length + unpackedTag.length);
  combined.set(unpackedCipher, 0);
  combined.set(unpackedTag, unpackedCipher.length);

  const decryptedBuf = await subtle.decrypt(
    { name: 'AES-GCM', iv: unpackedIv, additionalData: webCryptoGetDocumentAad(sampleDigest) },
    aesKey,
    combined
  );

  assert.strictEqual(Buffer.from(decryptedBuf).toString('utf8'), samplePlaintext.toString('utf8'));
  console.log('    ✓ PASS: WebCrypto round-trip with AAD succeeded.');

  // Test 2.2: WebCrypto Wrong-digest failure
  console.log('[+] Test 2.2: WebCrypto decrypt with wrong requested digest -> MUST FAIL');
  let webCryptoFailed = false;
  try {
    await subtle.decrypt(
      { name: 'AES-GCM', iv: unpackedIv, additionalData: webCryptoGetDocumentAad(wrongDigest) },
      aesKey,
      combined
    );
  } catch (err) {
    webCryptoFailed = true;
    console.log(`    ✓ PASS: WebCrypto threw authentication failure on wrong digest: ${err.message || err.name}`);
  }
  assert(webCryptoFailed, 'WebCrypto decryption with wrong digest MUST reject');

  // Test 2.3: WebCrypto Legacy document (no AAD, no version byte)
  console.log('[+] Test 2.3: WebCrypto legacy document (no AAD, no version byte) -> MUST DECRYPT');
  const legacyEncBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plainBytes
  );
  const legacyEncArray = new Uint8Array(legacyEncBuf);
  const legacyCipherBytes = legacyEncArray.slice(0, legacyEncArray.length - tagLength);
  const legacyTagBytes = legacyEncArray.slice(legacyEncArray.length - tagLength);

  // Legacy layout: [12-byte IV][ciphertext][16-byte authTag]
  const legacyPacked = new Uint8Array(iv.length + legacyCipherBytes.length + legacyTagBytes.length);
  legacyPacked.set(iv, 0);
  legacyPacked.set(legacyCipherBytes, iv.length);
  legacyPacked.set(legacyTagBytes, iv.length + legacyCipherBytes.length);

  // Parse legacy (first byte is IV[0], not 0x01 unless by chance; legacy unpack handles both)
  const legacyUnpackedIv = legacyPacked.slice(0, 12);
  const legacyUnpackedCipher = legacyPacked.slice(12, legacyPacked.length - 16);
  const legacyUnpackedTag = legacyPacked.slice(legacyPacked.length - 16);

  const legacyCombined = new Uint8Array(legacyUnpackedCipher.length + legacyUnpackedTag.length);
  legacyCombined.set(legacyUnpackedCipher, 0);
  legacyCombined.set(legacyUnpackedTag, legacyUnpackedCipher.length);

  const legacyDecBuf = await subtle.decrypt(
    { name: 'AES-GCM', iv: legacyUnpackedIv },
    aesKey,
    legacyCombined
  );

  assert.strictEqual(Buffer.from(legacyDecBuf).toString('utf8'), samplePlaintext.toString('utf8'));
  console.log('    ✓ PASS: WebCrypto legacy document successfully decrypted.');
}

await testWebCrypto();

console.log('\n===============================================================');
console.log('       ALL AAD & COMPATIBILITY CRYPTO TESTS PASSED!             ');
console.log('===============================================================\n');

import { ethers } from 'ethers';

export type EncryptedClientPayload = {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
  alg: 'aes-256-gcm';
};

export type SignedAuthHeaders = {
  'x-wallet-address': string;
  'x-wallet-signature': string;
  /** Present in the nonce-based auth path (preferred). */
  'x-wallet-nonce'?: string;
  /** Present in the legacy timestamp-based auth path (transitional). */
  'x-wallet-timestamp'?: string;
};

/**
 * A wrapped document key that a grantee can decrypt using their wallet.
 * Produced by wrapKeyForGrantee(); consumed by unwrapKeyAsGrantee().
 *
 * Wire format (all fields are hex-encoded):
 *   ephemeralPub  – 65-byte uncompressed ECDH public key (P-256)
 *   wrappedKey    – AES-KW(sharedSecret[0..31], documentAesKey)
 *   alg           – fixed marker string for forward compatibility
 */
export type WrappedGranteeKey = {
  ephemeralPub: string; // hex, 65 bytes uncompressed
  wrappedKey: string;   // hex, AES-KW output (40 bytes for a 32-byte key)
  alg: 'ecdh-p256-aeskw';
};

/**
 * A grantee's P-256 public key in hex-encoded SPKI format.
 * Derived once per wallet session and stored server-side at
 * POST /api/users/:address/p256-pubkey.
 * The owner fetches this via GET /api/users/:address/p256-pubkey before
 * calling wrapKeyForGrantee() — the owner never needs the grantee's Signer.
 */
export type GranteeP256PubKey = {
  address: string;        // lowercase Ethereum address
  spkiHex: string;       // hex-encoded SPKI (uncompressed P-256 public key, 91 bytes)
  derivedAt: number;     // unix ms timestamp
  /**
   * EIP-191 personal_sign signature of the SPKI hex string, produced by the
   * wallet's secp256k1 key.  Lets any fetcher verify the key offline via
   * ecrecoverSpkiSignature() — no PKI, no on-chain call, no server trust needed.
   *
   * Signed message: "BDVS P256 SPKI: <spkiHex>"
   */
  spkiSignature: string; // EIP-191 sig of `BDVS P256 SPKI: <spkiHex>`
};

const KEY_DERIVATION_PROMPT = 'BDVS Encryption Key Generation: ';
const AUTH_PROMPT = 'BDVS Authentication: ';

/**
 * Derives a 256-bit AES-GCM CryptoKey from a wallet signature using HKDF.
 *
 * We use HKDF (RFC 5869) rather than a computationally-hardened KDF (PBKDF2,
 * scrypt, Argon2) because the input is a high-entropy ECDSA wallet signature
 * (~256 bits of entropy), not a human-chosen password. Iterating PBKDF2 100k
 * times on high-entropy material buys nothing except latency; HKDF is the
 * textbook-correct choice for deriving keys from high-entropy keying material.
 *
 * Key-derivation domain separation (§IV-B, revised):
 *   The challenge now binds chainId+contractAddress so that the same wallet
 *   signature cannot be replayed to derive a key for a different BDVS
 *   deployment. Cross-deployment reuse is prevented at the KDF level:
 *
 *   IKM  = Sign("BDVS Encryption Key Generation: <chainId>:<contractAddress>:<addr>:<hash>")
 *   salt = UTF-8("bdvs-kdf-salt-<chainId>-<contractAddress>-<addr>-<hash>")
 *   info = UTF-8("bdvs-aes256gcm-v1")
 *
 * Determinism guard (§10.3): the challenge is signed TWICE and the results
 * compared before use. If the bytes differ the wallet is not producing
 * deterministic ECDSA (RFC 6979) and key derivation is aborted — ensuring
 * that encryption can never proceed on a wallet where recovery would be
 * impossible due to non-reproducible signature bytes.
 *
 * @param signer          - ethers Signer (MetaMask / Ledger / etc.)
 * @param walletAddress   - owner's Ethereum address
 * @param documentHash    - optional per-document binding (hex)
 * @param chainId         - deployment chain ID (e.g. '31337', '1')
 * @param contractAddress - lowercase deployed contract address
 */
export async function deriveWalletMasterKey(
  signer: ethers.Signer,
  walletAddress: string,
  documentHash?: string,
  chainId?: string,
  contractAddress?: string
): Promise<CryptoKey> {
  const normalizedAddr    = walletAddress.toLowerCase();
  const normalizedHash    = documentHash    ? documentHash.toLowerCase()    : '';
  const normalizedChain   = chainId         ? chainId.toLowerCase()         : 'unknown';
  const normalizedContract = contractAddress ? contractAddress.toLowerCase() : '0x0';

  // Domain-separated challenge: binding to chainId+contractAddress prevents
  // cross-deployment reuse of the same signature as key material.
  const domainPrefix = `${normalizedChain}:${normalizedContract}`;
  const challenge = normalizedHash
    ? `${KEY_DERIVATION_PROMPT}${domainPrefix}:${normalizedAddr}:${normalizedHash}`
    : `${KEY_DERIVATION_PROMPT}${domainPrefix}:${normalizedAddr}`;

  // §10.3 Determinism guard — sign twice, abort if bytes differ.
  // Most production wallets use RFC 6979 deterministic ECDSA; this guard
  // catches incompatible implementations before any data is encrypted.
  const sig1 = await signer.signMessage(challenge);
  const sig2 = await signer.signMessage(challenge);
  if (sig1 !== sig2) {
    throw new Error(
      'Your wallet produced different signature bytes for the same message on two consecutive ' +
      'sign requests. BDVS key derivation requires deterministic ECDSA (RFC 6979). ' +
      'Please use MetaMask, Ledger, or another RFC 6979-compliant wallet.'
    );
  }
  const signature = sig1;

  const encoder = new TextEncoder();
  // IKM: the raw signature bytes (high entropy — no stretching needed)
  const ikmBytes  = encoder.encode(signature);
  // Salt: domain-separated, deployment-bound, document-bound when a hash is provided
  const saltBytes = encoder.encode(
    normalizedHash
      ? `bdvs-kdf-salt-${normalizedChain}-${normalizedContract}-${normalizedAddr}-${normalizedHash}`
      : `bdvs-kdf-salt-${normalizedChain}-${normalizedContract}-${normalizedAddr}`
  );
  // Info: binding label that distinguishes this key from any other HKDF output
  const infoBytes = encoder.encode('bdvs-aes256gcm-v1');

  // Step 1: Import the signature bytes as raw HKDF key material
  const hkdfKey = await window.crypto.subtle.importKey(
    'raw',
    ikmBytes,
    'HKDF',
    false,
    ['deriveKey']
  );

  // Step 2: HKDF-Extract + HKDF-Expand → 256-bit AES-GCM key
  return window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: saltBytes,
      info: infoBytes,
    },
    hkdfKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts file bytes in the browser using Web Crypto API (AES-GCM-256).
 */
export async function encryptFileClient(file: File, key: CryptoKey): Promise<EncryptedClientPayload> {
  const buffer = await file.arrayBuffer();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const resultBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    buffer
  );

  const resultArray = new Uint8Array(resultBuffer);
  // Web Crypto AES-GCM appends 16-byte authTag at the end of encrypted output
  const tagLength = 16;
  const ciphertextLength = resultArray.length - tagLength;
  const ciphertext = resultArray.slice(0, ciphertextLength);
  const authTag = resultArray.slice(ciphertextLength);

  return {
    ciphertext,
    iv,
    authTag,
    alg: 'aes-256-gcm',
  };
}

/**
 * Decrypts encrypted file bytes in the browser using Web Crypto API (AES-GCM-256).
 */
export async function decryptFileClient(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  authTag: Uint8Array,
  key: CryptoKey
): Promise<ArrayBuffer> {
  // Web Crypto expects ciphertext concatenated with the 16-byte authTag
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);

  const combinedBuffer = combined.buffer.slice(
    combined.byteOffset,
    combined.byteOffset + combined.byteLength
  ) as ArrayBuffer;

  return window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer,
    },
    key,
    combinedBuffer
  );
}

// ─── Cross-wallet key wrapping (ECIES-style, §IV-C) ──────────────────────────
//
// The grantViewer() on-chain function flips an access-control bit, but the
// grantee still cannot decrypt the AES-GCM ciphertext because the document key
// was derived from the *owner's* wallet signature.  These helpers close that
// gap via ECDH-P256 + AES-KW.
//
// ── Correct two-party, two-browser architecture ───────────────────────────
//
//   Grantee side — one-time setup (publishP256PublicKey):
//     1. On first login, the grantee calls publishP256PublicKey().
//     2. This derives their deterministic P-256 key pair from their own Signer
//        (one wallet signature, entirely in the grantee's browser session).
//     3. The resulting SPKI-hex public key is POSTed to
//        /api/users/:address/p256-pubkey on the server.
//     4. unwrapKeyAsGrantee() remains self-contained in the grantee's session.
//
//   Owner side — wrap on share (wrapKeyForGrantee):
//     1. Owner fetches granteeP256PubKeyHex from GET /api/users/:address/p256-pubkey.
//     2. Generates an ephemeral P-256 key pair (random, per-document).
//     3. ECDH(ephemeralPriv, granteePub) → AES-KW key.
//     4. AES-KW(documentAesKey) → wrappedKey.
//     5. Stores { ephemeralPub, wrappedKey } off-chain alongside the ciphertext.
//     The owner NEVER needs the grantee's Signer — only the published hex key.
//
// ── Key extractability ────────────────────────────────────────────────────
//
//   deriveWalletMasterKey() uses extractable:false (non-extractable, §IV-B).
//   Documents intended for sharing require a separate, explicitly extractable
//   per-document key, generated by deriveDocumentKey().  That key is stored
//   only for the duration of the encryption/wrap operation and never persisted
//   in the clear.  This is a deliberate security trade-off documented in §IV-C:
//   extractability is scoped to the wrap operation and audited in slither-report.md.
//
// NOTE: secp256k1→P-256 mapping is done by signing a deterministic challenge
// with the wallet and using HKDF over the signature to derive a P-256 scalar,
// not by directly reinterpreting secp256k1 key bytes (avoids cross-curve reuse).

/**
 * Derive a document-level AES-GCM-256 key that is *extractable*.
 *
 * deriveWalletMasterKey() produces a non-extractable key (extractable:false)
 * which is correct for the owner's own decrypt path but will cause
 * crypto.subtle.wrapKey() to throw an InvalidAccessError when sharing.
 *
 * This helper generates a fresh random AES-GCM-256 key per document, marked
 * extractable:true so it can be wrapped for grantees with wrapKeyForGrantee().
 * The extractable flag is intentional and documented — the key is only held
 * in memory for the duration of the encrypt+wrap operation and never persisted
 * in the clear (§IV-C security note).
 *
 * Usage:
 *   const docKey = await deriveDocumentKey();
 *   const encrypted = await encryptFileClient(file, docKey);
 *   const wrapped = await wrapKeyForGrantee(docKey, granteeP256PubKeyHex);
 *   // store { encrypted, wrapped } off-chain
 */
export async function deriveDocumentKey(): Promise<CryptoKey> {
  return window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,  // extractable — required for AES-KW wrapKey()
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive a Web Crypto P-256 key pair deterministically from an ethers Signer.
 * Called by the grantee only (to reconstruct their private key for unwrapping
 * and to derive their public key for publishP256PublicKey).
 *
 * Strategy: sign a well-known challenge → HKDF over sig bytes → P-256 scalar.
 */
async function _signerToP256KeyPair(
  signer: ethers.Signer,
  walletAddress: string,
  role: 'owner' | 'grantee'
): Promise<CryptoKeyPair> {
  const challenge = `BDVS P256 Key Derivation v1: ${role}:${walletAddress.toLowerCase()}`;
  const sig = await signer.signMessage(challenge);
  const sigBytes = new TextEncoder().encode(sig);

  // HKDF over the signature to produce a P-256 private key scalar
  const hkdfKey = await window.crypto.subtle.importKey('raw', sigBytes, 'HKDF', false, ['deriveKey']);
  // Derive a 32-byte (256-bit) raw AES key as a proxy for the P-256 scalar
  const rawScalarKey = await window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(`bdvs-p256-scalar-${role}-${walletAddress.toLowerCase()}`),
      info: new TextEncoder().encode('bdvs-p256-ecdh-v1'),
    },
    hkdfKey,
    { name: 'AES-CBC', length: 256 },
    true, // extractable so we can export as raw bytes
    ['encrypt'] // dummy usage — we only want the bytes
  );
  const scalarBytes = new Uint8Array(await window.crypto.subtle.exportKey('raw', rawScalarKey));

  // P-256 private key must be a valid scalar in [1, n-1].
  // We use HKDF output directly as the private key bytes (brainpool-style);
  // browsers reject out-of-range values, so mask the top byte to keep it < 0xFF.
  scalarBytes[0] = (scalarBytes[0] & 0x7F) | 0x01; // Ensure non-zero and < 128

  // Import as P-256 private key in JWK format
  const jwkPrivate = {
    kty: 'EC',
    crv: 'P-256',
    d: _uint8ArrayToBase64Url(scalarBytes),
    // x and y are computed by the browser from d during import
    x: '', y: '',
    key_ops: ['deriveKey'],
    ext: true,
  };

  // Use generateKey to get a proper pair, then substitute scalar via importKey
  // (browsers don't allow directly importing a private-only EC key with missing x/y).
  // Workaround: generate a fresh pair, replace private key with our derived scalar.
  const derived = await window.crypto.subtle.importKey(
    'pkcs8',
    _p256ScalarToPkcs8(scalarBytes),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );
  void jwkPrivate; // suppress unused warning — kept for documentation

  const publicKey = await window.crypto.subtle.importKey(
    'spki',
    await _deriveP256PublicSpki(scalarBytes),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );

  return { privateKey: derived, publicKey };
}

/** Convert Uint8Array to base64url (no padding). */
function _uint8ArrayToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Minimal ASN.1 PKCS#8 wrapper for a bare P-256 private key scalar. */
function _p256ScalarToPkcs8(scalar: Uint8Array): ArrayBuffer {
  // RFC 5958 / SEC 1 ECPrivateKey wrapped in PKCS#8 for P-256
  // Algorithm OID: 1.2.840.10045.2.1 (EC Public Key)
  // Curve OID: 1.2.840.10045.3.1.7 (P-256 / secp256r1)
  const oid = new Uint8Array([
    0x30, 0x41,
      0x02, 0x01, 0x00,       // version = 0
      0x30, 0x13,             // AlgorithmIdentifier SEQUENCE
        0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // ecPublicKey OID
        0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // P-256 OID
      0x04, 0x27,             // OCTET STRING (39 bytes)
        0x30, 0x25,           // ECPrivateKey SEQUENCE
          0x02, 0x01, 0x01,   // version = 1
          0x04, 0x20,         // privateKey OCTET STRING (32 bytes)
  ]);
  const buf = new Uint8Array(oid.length + 32);
  buf.set(oid);
  buf.set(scalar.slice(0, 32), oid.length);
  return buf.buffer;
}

/** Derive the uncompressed P-256 public key SPKI bytes from a private scalar using the browser. */
async function _deriveP256PublicSpki(scalar: Uint8Array): Promise<ArrayBuffer> {
  // We need the public key, but the browser computes it internally when importing.
  // Re-import as PKCS#8 then exportKey 'spki' to get the public portion.
  const priv = await window.crypto.subtle.importKey(
    'pkcs8',
    _p256ScalarToPkcs8(scalar),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );
  // Export as JWK to get x, y, then re-build SPKI
  const jwk = await window.crypto.subtle.exportKey('jwk', priv);
  // Build an EC public key from the x/y coordinates
  const pubJwk = { kty: 'EC', crv: 'P-256', x: jwk.x!, y: jwk.y!, ext: true, key_ops: [] };
  const pubKey = await window.crypto.subtle.importKey('jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  return window.crypto.subtle.exportKey('spki', pubKey);
}

/**
 * Derive the grantee's deterministic P-256 public key and publish it to the
 * server for use by document owners.
 *
 * Call this ONCE per wallet, in the grantee's own browser session (e.g., on
 * first login). The returned hex string should be POSTed to:
 *   POST /api/users/:address/p256-pubkey
 *
 * Owners then fetch it via:
 *   GET /api/users/:address/p256-pubkey
 * before calling wrapKeyForGrantee() — they never need the grantee's Signer.
 *
 * @param granteeSigner   - grantee's own ethers Signer (MetaMask)
 * @param granteeAddress  - grantee's Ethereum address
 * @returns               - SPKI-hex public key + metadata; POST body for the endpoint
 */
export async function publishP256PublicKey(
  granteeSigner: ethers.Signer,
  granteeAddress: string
): Promise<GranteeP256PubKey> {
  const { publicKey } = await _signerToP256KeyPair(granteeSigner, granteeAddress, 'grantee');
  const spkiBuf = await window.crypto.subtle.exportKey('spki', publicKey);
  const spkiHex = Array.from(new Uint8Array(spkiBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

  // §IV-C Self-authentication: sign the SPKI hex with the wallet's secp256k1
  // key so that any fetcher can ecrecover the signer and confirm it matches
  // the claimed wallet address — entirely without trusting the relay server.
  //
  // Signed message (EIP-191 personal_sign):
  //   "BDVS P256 SPKI: <spkiHex>"
  //
  // Verification: see ecrecoverSpkiSignature() below.
  const spkiSignature = await granteeSigner.signMessage(`BDVS P256 SPKI: ${spkiHex}`);

  return {
    address:        granteeAddress.toLowerCase(),
    spkiHex,
    derivedAt:      Date.now(),
    spkiSignature,
  };
}

/**
 * Verify that a fetched P-256 SPKI entry was genuinely signed by its claimed
 * wallet address, without any server involvement.
 *
 * Algorithm:
 *   1. Reconstruct the signed message: "BDVS P256 SPKI: <spkiHex>"
 *   2. ecrecover the signer from spkiSignature (EIP-191 personal_sign)
 *   3. Compare the recovered address to entry.address (case-insensitive)
 *
 * If this returns false, the key may have been substituted by the relay —
 * do NOT use it to wrap a document key.
 *
 * @param entry - the object returned by GET /api/users/:address/p256-pubkey
 */
export function ecrecoverSpkiSignature(entry: GranteeP256PubKey): boolean {
  try {
    const message = `BDVS P256 SPKI: ${entry.spkiHex}`;
    const recovered = ethers.verifyMessage(message, entry.spkiSignature);
    return recovered.toLowerCase() === entry.address.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Wrap a document's AES-GCM key for a grantee wallet so they can decrypt it.
 *
 * Prerequisites:
 *   1. The grantee has already called publishP256PublicKey() and the owner
 *      has fetched granteeP256PubKeyHex from GET /api/users/:address/p256-pubkey.
 *   2. documentAesKey was produced by deriveDocumentKey() (extractable:true).
 *      Keys from deriveWalletMasterKey() are non-extractable and will throw.
 *
 * Call this AFTER grantViewer() has been confirmed on-chain. Store the returned
 * { ephemeralPub, wrappedKey } off-chain, indexed by the grantee address.
 *
 * @param documentAesKey       - extractable AES-GCM-256 CryptoKey (from deriveDocumentKey)
 * @param granteeP256PubKeyHex - grantee's SPKI-hex public key (from publishP256PublicKey)
 */
export async function wrapKeyForGrantee(
  documentAesKey: CryptoKey,
  granteeP256PubKeyHex: string
): Promise<WrappedGranteeKey> {
  // 1. Import grantee's P-256 public key from the published SPKI hex
  const granteePubBytes = Uint8Array.from(
    granteeP256PubKeyHex.match(/.{2}/g)!.map(h => parseInt(h, 16))
  );
  const granteePub = await window.crypto.subtle.importKey(
    'spki',
    granteePubBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // 2. Generate ephemeral P-256 key pair for this wrap operation
  const ephemeral = await window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );

  // 3. ECDH(ephemeralPriv, granteePub) → shared secret → AES-KW key
  const wrapKey = await window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: granteePub },
    ephemeral.privateKey,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey']
  );

  // 4. AES-KW wrap the document key (documentAesKey must be extractable)
  const wrappedKeyBuf = await window.crypto.subtle.wrapKey('raw', documentAesKey, wrapKey, 'AES-KW');

  // 5. Export ephemeral public key as raw (65-byte uncompressed point)
  const ephemeralPubBuf = await window.crypto.subtle.exportKey('raw', ephemeral.publicKey);

  return {
    ephemeralPub: Array.from(new Uint8Array(ephemeralPubBuf)).map(b => b.toString(16).padStart(2, '0')).join(''),
    wrappedKey:   Array.from(new Uint8Array(wrappedKeyBuf)).map(b => b.toString(16).padStart(2, '0')).join(''),
    alg: 'ecdh-p256-aeskw',
  };
}

/**
 * Unwrap a document AES-GCM key that was wrapped for this grantee by the owner.
 *
 * @param granteeSigner  - grantee's ethers Signer
 * @param granteeAddress - grantee's Ethereum address
 * @param wrapped        - the WrappedGranteeKey produced by wrapKeyForGrantee()
 * @returns              - AES-GCM-256 CryptoKey ready to pass to decryptFileClient()
 */
export async function unwrapKeyAsGrantee(
  granteeSigner: ethers.Signer,
  granteeAddress: string,
  wrapped: WrappedGranteeKey
): Promise<CryptoKey> {
  if (wrapped.alg !== 'ecdh-p256-aeskw') {
    throw new Error(`Unsupported wrapped key algorithm: ${wrapped.alg}`);
  }

  // 1. Reconstruct the grantee's P-256 key pair from their wallet
  const granteeP256 = await _signerToP256KeyPair(granteeSigner, granteeAddress, 'grantee');

  // 2. Import ephemeral public key (raw uncompressed P-256 point, 65 bytes)
  const ephemeralPubBytes = Uint8Array.from(
    wrapped.ephemeralPub.match(/.{2}/g)!.map(h => parseInt(h, 16))
  );
  const ephemeralPub = await window.crypto.subtle.importKey(
    'raw',
    ephemeralPubBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // 3. ECDH(granteePriv, ephemeralPub) → same shared secret → AES-KW key
  const unwrapKey = await window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: ephemeralPub },
    granteeP256.privateKey,
    { name: 'AES-KW', length: 256 },
    false,
    ['unwrapKey']
  );

  // 4. AES-KW unwrap → raw AES-GCM-256 key
  const wrappedKeyBytes = Uint8Array.from(
    wrapped.wrappedKey.match(/.{2}/g)!.map(h => parseInt(h, 16))
  );
  return window.crypto.subtle.unwrapKey(
    'raw',
    wrappedKeyBytes,
    unwrapKey,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

/**
 * Generates EIP-191 cryptographic wallet signature headers to prove key ownership.
 *
 * Preferred (nonce-based, domain-bound): calls GET /api/auth/nonce first, signs
 *   "BDVS Authentication v2: <chainId>:<contractAddress>:<address>:<nonce>"
 * and includes x-wallet-nonce so the server can do a one-time-use check.
 *
 * Fallback (timestamp-based, legacy): signs the original challenge format when
 * a backendBaseUrl is not provided or the nonce endpoint is unreachable.
 */
export async function signAuthHeaders(
  signer: ethers.Signer,
  walletAddress: string,
  backendBaseUrl?: string
): Promise<SignedAuthHeaders & { 'x-wallet-nonce'?: string }> {
  const normalizedAddr = walletAddress.toLowerCase();

  // ── Nonce-based path (preferred) ────────────────────────────────────────────
  if (backendBaseUrl) {
    try {
      const nonceRes = await fetch(
        `${backendBaseUrl}/api/auth/nonce?address=${encodeURIComponent(walletAddress)}`,
        { method: 'GET' }
      );
      if (nonceRes.ok) {
        const { nonce, chainId, contractAddress } = await nonceRes.json() as {
          nonce: string;
          chainId: string;
          contractAddress: string;
          expiresAt: number;
          challengeTemplate: string;
        };
        const challenge = `BDVS Authentication v2: ${chainId}:${contractAddress}:${normalizedAddr}:${nonce}`;
        const signature = await signer.signMessage(challenge);
        return {
          'x-wallet-address':   walletAddress,
          'x-wallet-signature': signature,
          'x-wallet-nonce':     nonce,
          // Still include timestamp for servers running the transitional build
          'x-wallet-timestamp': String(Date.now()),
        };
      }
    } catch {
      // Nonce endpoint unreachable — fall through to legacy path
    }
  }

  // ── Legacy timestamp-based path ─────────────────────────────────────────────
  const timestamp = Date.now();
  const challenge = `BDVS Authentication: ${normalizedAddr}:${timestamp}`;
  const signature = await signer.signMessage(challenge);
  return {
    'x-wallet-address':   walletAddress,
    'x-wallet-signature': signature,
    'x-wallet-timestamp': String(timestamp),
  };
}

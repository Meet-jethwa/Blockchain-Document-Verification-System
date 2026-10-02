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
 * Supports document-bound key derivation:
 *   IKM  = Sign("BDVS Encryption Key Generation: <addr>:<hash>")
 *   salt = UTF-8("bdvs-salt-<addr>-<hash>")
 *   info = UTF-8("bdvs-aes256gcm-v1")
 *
 * Determinism guard (§10.3): the challenge is signed TWICE and the results
 * compared before use. If the bytes differ the wallet is not producing
 * deterministic ECDSA (RFC 6979) and key derivation is aborted — ensuring
 * that encryption can never proceed on a wallet where recovery would be
 * impossible due to non-reproducible signature bytes.
 */
export async function deriveWalletMasterKey(
  signer: ethers.Signer,
  walletAddress: string,
  documentHash?: string
): Promise<CryptoKey> {
  const normalizedAddr = walletAddress.toLowerCase();
  const normalizedHash = documentHash ? documentHash.toLowerCase() : '';
  const challenge = normalizedHash
    ? `${KEY_DERIVATION_PROMPT}${normalizedAddr}:${normalizedHash}`
    : `${KEY_DERIVATION_PROMPT}${normalizedAddr}`;

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
  // Salt: domain-specific, document-bound when a hash is provided
  const saltBytes = encoder.encode(
    normalizedHash
      ? `bdvs-salt-${normalizedAddr}-${normalizedHash}`
      : `bdvs-salt-${normalizedAddr}`
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

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
  'x-wallet-timestamp': string;
};

const KEY_DERIVATION_PROMPT = 'BDVS Encryption Key Generation: ';
const AUTH_PROMPT = 'BDVS Authentication: ';

/**
 * Derives a 256-bit AES-GCM CryptoKey from a wallet signature using PBKDF2.
 */
export async function deriveWalletMasterKey(signer: ethers.Signer, walletAddress: string): Promise<CryptoKey> {
  const normalizedAddr = walletAddress.toLowerCase();
  const challenge = `${KEY_DERIVATION_PROMPT}${normalizedAddr}`;
  const signature = await signer.signMessage(challenge);

  const encoder = new TextEncoder();
  const signatureBytes = encoder.encode(signature);
  const saltBytes = encoder.encode(`bdvs-salt-${normalizedAddr}`);

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    signatureBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
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
 */
export async function signAuthHeaders(signer: ethers.Signer, walletAddress: string): Promise<SignedAuthHeaders> {
  const timestamp = Date.now();
  const normalizedAddr = walletAddress.toLowerCase();
  const challenge = `${AUTH_PROMPT}${normalizedAddr}:${timestamp}`;
  const signature = await signer.signMessage(challenge);

  return {
    'x-wallet-address': walletAddress,
    'x-wallet-signature': signature,
    'x-wallet-timestamp': String(timestamp),
  };
}

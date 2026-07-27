# Revised Architecture & Security Report: Blockchain Document Verification System (BDVS)

**Document Date:** July 2026  
**Purpose:** Technical documentation of prototype architectural upgrades, cryptographic specifications, threat models, and peer-review response items.

---

## Executive Summary & Peer Review Responses

This document details the major architectural enhancements made to the **Blockchain Document Verification System (BDVS)** in response to universal paper review feedback.

| Review Feedback Item | Critique / Limitation | Implemented Architectural Solution |
| :--- | :--- | :--- |
| **Reviewers #1, #2, #3, #4** | **Overstated Privacy Claims:** Server held unencrypted plaintext, CID, key, and IV during processing. | **Zero-Knowledge Client-Side E2EE:** Integrated Web Crypto API (`AES-256-GCM`) in the browser. Plaintext never touches backend servers or disks. |
| **Reviewers #3, #4** | **Unauthenticated AES-CBC:** CBC mode lacks integrity checks against ciphertext modification. | **AES-256-GCM Authenticated Encryption:** Upgraded cipher to `AES-256-GCM` with 12-byte IVs and 16-byte authentication tags (`authTag`). |
| **Reviewers #3, #4** | **Weak Header Authorization:** `wallet-address` header can be spoofed by any HTTP client. | **EIP-191 Cryptographic Signature Authentication:** Requests enforce EVM wallet signatures (`ethers.verifyMessage`) over timestamped challenges. |

---

## 1. Updated System Architecture

```
[ User Browser / Frontend (Vite + React) ]
   │
   ├─► 1. Derive 256-bit AES-GCM Master Key via MetaMask (PBKDF2 over EIP-191 signature)
   ├─► 2. Encrypt document client-side with AES-256-GCM (12-byte IV, 16-byte authTag)
   ├─► 3. Generate EIP-191 Auth Challenge Signature (x-wallet-signature, x-wallet-timestamp)
   │
   ▼
[ Express.js REST API Backend (Zero-Knowledge Relay) ]
   │
   ├─► 4. Verify EIP-191 Wallet Signature (ethers.verifyMessage)
   ├─► 5. Receive & Store Ciphertext Payload directly to IPFS (Pinata/Gateway)
   │
   ▼
[ Ethereum Smart Contract (DocumentRegistry.sol) ]
   └─► 6. User's wallet signs transaction to register (hash, CID) on-chain
```

---

## 2. Cryptographic Specifications

### A. Client-Side End-to-End Encryption (E2EE)
- **Algorithm:** `AES-GCM` (256-bit key length)
- **Initialization Vector (IV):** 12 bytes (96 bits) randomly generated per file using `window.crypto.getRandomValues()`.
- **Authentication Tag:** 16 bytes (128 bits) produced by `crypto.subtle.encrypt()`.
- **Key Derivation (PBKDF2):**
  - **Base Material:** EIP-191 signature of challenge `BDVS Encryption Key Generation: <wallet_address>`
  - **Salt:** `bdvs-salt-<wallet_address>`
  - **Iterations:** 100,000 iterations of SHA-256
  - **Output Key:** 256-bit CryptoKey suitable for `AES-GCM` operations in browser memory.

### B. Server-Side Cryptographic Fallback (AES-256-GCM)
- **Module:** `backend/fileCrypto.js`
- **Cipher:** `aes-256-gcm`
- **Key Length:** 32 bytes (256 bits)
- **IV Length:** 12 bytes
- **Authentication Tag:** 16 bytes extracted via `cipher.getAuthTag()` and validated during `decipher.setAuthTag(tag)`.
- **Backward Compatibility:** Reads legacy `aes-256-cbc` records transparently.

---

## 3. Access Control & EIP-191 Signature Protocol

To eliminate header spoofing (`wallet-address`), all protected API endpoints accept signed request headers:

### Request Headers
- `x-wallet-address`: EVM checksum address of the requester (e.g. `0x123...`)
- `x-wallet-timestamp`: Unix epoch milliseconds timestamp
- `x-wallet-signature`: EIP-191 message signature over challenge string:
  ```
  BDVS Authentication: <x-wallet-address>:<x-wallet-timestamp>
  ```

### Verification Logic (`backend/server.js`)
1. Server extracts `address`, `timestamp`, and `signature`.
2. Verifies `Math.abs(Date.now() - timestamp) <= 600,000` (10-minute anti-replay window).
3. Reconstructs challenge string and verifies using `ethers.verifyMessage(challenge, signature)`.
4. If signature is invalid, expired, or address mismatch occurs, server returns `401 Unauthorized`.

---

## 4. Threat Model & Privacy Scope

### Privacy Guarantees
- **Public Observers (Blockchain & IPFS):** Zero unencrypted file content is exposed on Ethereum or public IPFS. All stored bytes are high-entropy `AES-256-GCM` ciphertext.
- **Untrusted Storage Nodes / Relays:** IPFS nodes and host servers holding ciphertext buffers cannot read file contents without the client-derived AES key.
- **Integrity Guarantee:** Any alteration of ciphertext or manifest data causes `AES-GCM` authentication tag verification to fail instantly, preventing corrupted or tampered file downloads.

---

## 5. File & Directory Reference

- **[frontend/src/clientCrypto.ts](file:///d:/clg/TY/blockchain%20project/Document%20Verification%20System/frontend/src/clientCrypto.ts):** Client-side Web Crypto API encryption, key derivation, and EIP-191 header signing.
- **[backend/fileCrypto.js](file:///d:/clg/TY/blockchain%20project/Document%20Verification%20System/backend/fileCrypto.js):** Server-side `AES-256-GCM` authenticated encryption module with `authTag` verification.
- **[backend/server.js](file:///d:/clg/TY/blockchain%20project/Document%20Verification%20System/backend/server.js):** REST API server implementing `ethers.verifyMessage` EIP-191 signature authentication middleware.
- **[frontend/src/App.tsx](file:///d:/clg/TY/blockchain%20project/Document%20Verification%20System/frontend/src/App.tsx):** React UI handling MetaMask transaction signing, client encryption, and upload/download flows.
- **[README.md](file:///d:/clg/TY/blockchain%20project/Document%20Verification%20System/README.md):** Main project documentation with revised paper abstract and threat model.

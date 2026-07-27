
# Blockchain Document Verification System (BDVS)

## Project Report

**Date:** July 2026 (Revised Prototype Architecture)  
**Project Type:** Web + Blockchain + IPFS (Zero-Knowledge & Client-Side Encryption)  
**Goal:** Prove document integrity on-chain while keeping file contents off-chain with authenticated encryption and cryptographic wallet ownership proof.

---

## 1) Abstract & Threat Model

This system verifies document authenticity using cryptographic hashes stored on an Ethereum smart contract (`DocumentRegistry.sol`). To ensure confidentiality, actual document files are stored off-chain on IPFS encrypted with **AES-256-GCM authenticated encryption** (including 16-byte authentication tags to prevent tampering). 

- **Privacy Scope:** Privacy is guaranteed against public observers on the Ethereum blockchain and the IPFS network. File bytes on IPFS remain strictly encrypted and unreadable by public nodes.
- **Client-Side E2EE & Zero-Knowledge Option:** Files are encrypted client-side using the Web Crypto API before transmission, ensuring the backend server receives zero plaintext data.
- **Cryptographic Access Control:** API endpoints enforce **EIP-191 signature authentication** (`ethers.verifyMessage`). Requesting callers must sign a timestamped challenge with their EVM wallet private key to prove ownership, eliminating header spoofing.

---

## 2) Objectives

1. **Integrity:** Detect document modification using SHA-256 / Keccak-256 hashes and AES-256-GCM authentication tags.
2. **Privacy:** Guarantee off-chain confidentiality from public blockchain and IPFS observers.
3. **Cryptographic Access Control:** Require EIP-191 wallet signature challenges to prove key ownership for protected operations.
4. **Authenticated Encryption:** Enforce AES-256-GCM (128-bit tag) over legacy unauthenticated CBC mode.
5. **Zero-Knowledge Architecture:** Support client-side Web Crypto API encryption so plaintext never touches backend disks or servers.

---

## 3) Technology Stack

**Smart Contract / Chain**
- Solidity smart contract: `contracts/DocumentRegistry.sol`
- Hardhat: compilation, local node, deployment scripts
- Ethers v6: contract interaction and EIP-191 signature verification

**Backend**
- Node.js (ES modules), Express.js REST API
- AES-256-GCM authenticated encryption (`node:crypto`)
- IPFS upload (Pinata or Web3.Storage) + gateway fetch
- EIP-191 wallet signature authentication (`x-wallet-signature`)

**Frontend**
- React + TypeScript + Vite
- Web Crypto API (`window.crypto.subtle`) for client-side AES-GCM encryption
- MetaMask integration for transaction signing & EIP-191 message authentication
# Blockchain Document Verification System

Lightweight project to register document integrity proofs on-chain while storing encrypted file contents off-chain (IPFS). The backend manages encryption keys and enforces download authorization.

## Quick Links
- Contract: [contracts/DocumentRegistry.sol](contracts/DocumentRegistry.sol)
- Backend entry: [backend/server.js](backend/server.js)
- Frontend (Vite): [frontend/src/App.tsx](frontend/src/App.tsx)
- Demo script: [scripts/demo.js](scripts/demo.js)

## Quick Start

Prerequisites: Node.js v18+, npm, MetaMask (for UI interactions).

1. Install dependencies (root, backend, frontend):

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
```

2. Run Hardhat local node (optional):

```bash
npx hardhat node
```

3. Compile & deploy contracts (example to local node):

```bash
npx hardhat compile
npx hardhat run scripts/deploy.js --network localhost
```

4. Configure backend: copy `backend/env.example` to `backend/.env` and set `RPC_URL`, `PRIVATE_KEY`, and `CONTRACT_ADDRESS` (set by deploy step). If you use Pinata or Web3.Storage, set `PINATA_JWT` or `WEB3_STORAGE_TOKEN`.

5. Start backend and frontend:

```bash
node backend/server.js
npm --prefix frontend run dev
```

6. Run demo (optional):

```bash
node scripts/demo.js
```

## What it does
- Uploads files via the backend, which computes a keccak256 hash of the raw bytes.
- Backend encrypts file bytes (AES-256-CBC) and uploads the encrypted blob to IPFS.
- Only the document hash is registered on-chain; CIDs and encryption keys remain off-chain.
- Download requests are authorized by querying the contract for view permissions; backend decrypts and streams files to authorized wallets.

## Project Layout

- [contracts/](contracts/) — Solidity contract(s).
- [scripts/](scripts/) — Hardhat deploy/demo scripts.
- [backend/](backend/) — Express API: upload, verify, download; see [backend/server.js](backend/server.js).
- [frontend/](frontend/) — React + Vite UI.

## Backend environment notes

- Copy `backend/env.example` to `backend/.env` and set values.
- Useful variables: `RPC_URL`, `PRIVATE_KEY`, `CONTRACT_ADDRESS`, `PINATA_JWT` or `WEB3_STORAGE_TOKEN`, `FILE_MASTER_KEY` (optional wrap key), `PORT`.

## Common commands

- Install all deps: `npm install && npm --prefix backend install && npm --prefix frontend install`
- Start backend: `node backend/server.js`
- Start frontend (dev): `npm --prefix frontend run dev`
- Compile contracts: `npx hardhat compile`
- Deploy to local: `npx hardhat run scripts/deploy.js --network localhost`

## Troubleshooting

- If backend port is in use, change `PORT` in `backend/.env`.
- If MetaMask shows wrong network, make sure `RPC_URL` and chain id match your wallet.
- If uploads fail, verify IPFS credentials or run with `IPFS_DISABLED=true` for local testing.

## Next steps

- Want me to: run the demo, deploy contracts to a testnet, or add a concise developer README for `backend/` and `frontend/`? Reply with which you'd like next.

### 10.1 Health

`GET /api/health`
- Confirms backend is running + chain connection is valid.

### 10.2 Upload (encrypted → IPFS)

`POST /api/upload`
- Content-Type: `multipart/form-data`
- Form field: `file`
- Required header: `wallet-address: 0x...`

Response includes:
- `hash` (document hash to register on-chain)
- `message` (UI guidance)
- `ipfs.cid` is intentionally `null` in responses

### 10.3 Verify

`POST /api/verify`
- Upload file; returns `{ hash, verified }`

`POST /api/verify-hash`
- Body: `{ "hash": "0x..." }`

### 10.4 Authorized download (server decrypt)

`GET /api/documents/:hash/download`
- Required header: `wallet-address: 0x...`
- Backend:
	1) checks access
	2) fetches encrypted bytes from IPFS using stored CID
	3) decrypts server-side
	4) streams the original file

---

## 11) Troubleshooting

### Backend won’t start (EADDRINUSE on 8080)

Cause: Another process is already using port 8080.

Fix:
- Stop the process using 8080, or
- Change `PORT` in `backend/.env` (e.g., 8081) and restart.

### “Not authorized to view this document”

Cause:
- Wallet address in `wallet-address` is not the owner and has not been granted access.

Fix:
- Connect the correct wallet, or
- Grant viewer access from the owner wallet.

### “Server misconfiguration: FILE_MASTER_KEY is required…”

Cause:
- Encryption keys were stored wrapped/encrypted, but backend is missing `FILE_MASTER_KEY`.

Fix:
- Set `FILE_MASTER_KEY` in `backend/.env` to the same value originally used.

### MetaMask shows wrong network

Fix:
- Switch MetaMask to the same network as `RPC_URL`.
- For local Hardhat: chain id is typically `31337`.

---

## 12) Conclusion

This project provides tamper-evident document verification by anchoring hashes on-chain while storing encrypted content off-chain on IPFS. The backend enforces access control and keeps encryption keys private, enabling practical privacy without losing the auditability benefits of a blockchain registry.

---

## 13) Methodology (Implementation Approach)

1. **Requirements analysis**
	- Identify which data must be public (hash) vs private (CID, keys, file bytes).
	- Define access control rules using wallet addresses.

2. **Smart contract design**
	- Store only `hash` (and permission metadata/events).
	- Provide read methods for verification and permission checks.
	- Provide revoke capabilities for versions and/or roots.

3. **Backend design**
	- Implement a single upload entry point that:
	  - hashes the uploaded bytes
	  - encrypts the bytes
	  - stores encrypted bytes on IPFS
	  - stores CID + encryption material server-side
	- Implement an authorized download endpoint that:
	  - verifies the caller address
	  - checks contract permissions (and always allows owner)
	  - fetches encrypted bytes from IPFS
	  - decrypts and streams the original file

4. **Frontend design**
	- Use MetaMask for wallet connection and user-approved transactions.
	- Provide clear user prompts:
	  - after upload: “Accept the transaction in MetaMask.”
	  - after confirmation: show success + hash
	- Provide “Download” actions that call the backend decrypt endpoint (CID not required in the UI).

---

## 14) Results and Observations

- **Integrity achieved:** any modification to a document changes its hash and fails verification.
- **Privacy improved:** file content and CID remain off-chain; encryption keys stay server-side.
- **Access control enforced:** viewers can download only after on-chain permission is granted.
- **Operational note:** backend port conflicts (e.g., 8080 already in use) must be handled via configuration.

---

## 15) Future Scope

1. Replace JSON file storage with a database (MongoDB/PostgreSQL) and add audit logs.
2. Add multi-admin ownership transfer and recovery mechanisms.
3. Add rate limiting, monitoring, and structured logging for production.
4. Add optional client-side hashing for large files (upload only after hash is computed).
5. Add stronger access policies for revoked documents (owner-only archive, viewer blocked, etc.).

---

## 16) References

- Ethereum / EVM concepts: transaction, events, keccak256
- IPFS content addressing
- AES encryption (CBC mode) and authenticated wrapping (GCM mode)


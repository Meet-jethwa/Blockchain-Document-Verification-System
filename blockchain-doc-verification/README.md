
# Blockchain Document Verification System (BDVS)

## Project Report

**Date:** February 2026  
**Project Type:** Web + Blockchain + IPFS (with server-side encryption)  
**Goal:** Prove document integrity on-chain while keeping file content off-chain.

---

## 1) Abstract

This system verifies document authenticity using a cryptographic hash stored on a blockchain smart contract. The actual document file is stored off-chain on IPFS, encrypted before upload. The encryption keys are stored only on the backend (never on-chain and never sent to the frontend). Authorized users (owner or permitted viewers) can download the original document through a backend endpoint that fetches the encrypted bytes from IPFS and decrypts them server-side.

---

## 2) Objectives

1. **Integrity:** Detect any document modification using a deterministic hash.
2. **Privacy:** Do not store the document itself on-chain.
3. **Access Control:** Allow only authorized wallets to download/view documents.
4. **Encryption:** Encrypt file bytes before IPFS upload; keep keys server-side.
5. **Usability:** Users interact via a web UI + MetaMask transactions.

---

## 3) Technology Stack

**Smart Contract / Chain**
- Solidity smart contract: `contracts/DocumentRegistry.sol`
- Hardhat: compilation, local node, deployment scripts
- Ethers v6: contract interaction

**Backend**
- Node.js (ES modules)
- Express.js REST API
- Multer (memory upload)
- IPFS upload (Pinata or Web3.Storage) + gateway fetch
- Crypto (Node built-in `crypto`)

**Frontend**
- React + TypeScript
- Vite
- MetaMask (wallet connection + signing/transactions)

---

## 4) System Architecture

### 4.1 High-level diagram

```text
User (Browser + MetaMask)
				|
				| 1) Upload file (HTTP)
				v
Frontend (React)
				|
				| 2) POST /api/upload (file + x-wallet-address)
				v
Backend (Express)
	 - hashes file
	 - encrypts bytes
	 - uploads encrypted bytes to IPFS
	 - stores CID + key/IV server-side
				|
				| 3) Frontend asks user to confirm tx
				v
Blockchain (DocumentRegistry)
	 - stores ONLY the document hash
	 - manages revoke + view permissions

Later (download)
Frontend -> Backend -> IPFS (fetch encrypted) -> Backend decrypt -> Browser download
```

### 4.2 What goes where

| Item | Stored On-Chain? | Stored In IPFS? | Stored Server-Side? | Sent to Frontend? |
|------|------------------|-----------------|---------------------|-------------------|
| Document hash (keccak256) | ✅ Yes | ❌ No | optional/cache | ✅ Yes |
| File content (plaintext) | ❌ No | ❌ No | ❌ No | ✅ (only after authorized download) |
| File content (encrypted) | ❌ No | ✅ Yes | ❌ No | ❌ No |
| CID | ❌ No | (content addressed) | ✅ Yes | ❌ No |
| Encryption key + IV | ❌ No | ❌ No | ✅ Yes | ❌ No |

---

## 5) Security & Encryption Model

### 5.1 File encryption

- Cipher: **AES-256-CBC**
- Per document:
	- Random 32-byte key
	- Random 16-byte IV
- Encryption occurs **in the backend before uploading to IPFS**.

### 5.2 Key custody

- The backend stores encryption material (key + IV) linked to the **owner wallet address**.
- Keys are never returned to the browser.
- Optional at-rest protection: if `FILE_MASTER_KEY` is configured, the backend wraps (encrypts) the stored per-document secrets using **AES-256-GCM**.

### 5.3 Authorization

The backend download endpoint checks access using the smart contract’s permissions:
- **Owner can always download their own document.**
- Shared viewers can download if the smart contract grants them access.

---

## 6) Repository Structure

```text
contracts/                 Solidity smart contract
scripts/                   Hardhat deploy/demo scripts
backend/                   Express API (upload/verify/download)
	server.js
	chain.js
	ipfs.js
	fileCrypto.js
	documentStore.js         Lightweight JSON store (server-side)
	data/documents.json
frontend/                  React app (Vite)
	src/App.tsx
	src/api.ts
```

---

## 7) Setup & Installation

### 7.1 Prerequisites

- Node.js (recommended: v18+)
- MetaMask extension
- An IPFS provider credential (Pinata or Web3.Storage) OR run with `IPFS_DISABLED=true` for local testing.

### 7.2 Install dependencies

Install Node.js dependencies for both the root project and the frontend application.

### 7.3 Configure backend environment

Create `backend/.env` (copy values from `backend/env.example`) and set network + IPFS credentials.

Edit `backend/.env`:
- `RPC_URL` (Hardhat local default is `http://127.0.0.1:8545`)
- `PRIVATE_KEY` (funded account for selected network)
- `CONTRACT_ADDRESS` (set after deploying the contract)
- IPFS credentials:
	- `PINATA_JWT` **or** `WEB3_STORAGE_TOKEN`
- Optional:
	- `FILE_MASTER_KEY` (recommended for production)
	- `PORT` (default 8080)

---

## 8) Deployment & Operation (Summary)

This system runs as three cooperating components:

1. **Blockchain network + deployed contract**
	- A network is selected (local Hardhat or a public testnet).
	- The `DocumentRegistry` contract is deployed once per network.
	- The deployed contract address is configured in `backend/.env` as `CONTRACT_ADDRESS`.

2. **Backend API (Express)**
	- Provides upload, verification, and authorized download endpoints.
	- Encrypts files before IPFS upload and stores encryption material server-side.
	- Common operational issue: port conflicts. If the default port is already in use, update `PORT` in `backend/.env`.

3. **Frontend (React + Vite)**
	- Provides the user interface.
	- Uses MetaMask for wallet connection and transaction confirmation.

---

## 9) Website Workflow (Detailed)

This section describes the user-facing workflow and the internal system actions for the two main features:

1) **Registration (upload + on-chain hash)**
2) **Sharing (grant/revoke viewer access)**

### 9.1 Roles and assumptions

- **Owner:** the wallet address that registers the document hash on-chain.
- **Viewer:** a wallet address that receives permission to download/view a document.
- **MetaMask:** used for wallet connection and signing/confirming transactions.
- **Important design rule:** the contract stores **only the document hash**. The CID and encryption keys remain off-chain.

### 9.2 Registration workflow (Upload → Encrypt → IPFS → Register on-chain)

#### A) User steps (what the owner does)

1. Connect the wallet in MetaMask.
2. Select a document file in **Upload Document**.
3. Click **Upload**.
4. When prompted, **accept the transaction in MetaMask**.
5. After confirmation, the document appears in **My Documents**.

#### B) System steps (what happens inside the system)

The registration pipeline is intentionally split into two phases: **off-chain storage** and **on-chain proof**.

**Phase 1 — Off-chain (Backend + IPFS):**

1. Frontend sends the selected file to the backend endpoint `POST /api/upload` with header `x-wallet-address`.
2. Backend computes the document hash (keccak256) from the raw bytes.
3. Backend encrypts the file bytes using **AES-256-CBC** with a fresh random key and IV.
4. Backend uploads the encrypted bytes to IPFS (Pinata/Web3.Storage), receiving a CID.
5. Backend stores the following server-side (not sent to the browser):
	- `CID`
	- encryption key + IV
	- file metadata (name, type, size)
	- owner wallet address

**Phase 2 — On-chain (MetaMask + Smart contract):**

6. Frontend requests MetaMask to create a blockchain transaction calling `registerDocument(hash, cid)`.
7. The frontend passes an empty CID value (`""`) so that **CID is not stored on-chain**.
8. MetaMask prompts the user to confirm the transaction (gas fees apply on public networks).
9. After confirmation, the contract permanently records the document hash, forming an immutable proof of registration.

**Registration sequence (summary):**

```text
Owner -> Frontend -> Backend: upload file
Backend: hash + encrypt -> IPFS: store encrypted bytes -> Backend: store CID + key/IV
Frontend -> MetaMask -> Contract: registerDocument(hash, "")
```

#### C) Output of registration

- **On-chain:** document hash is registered.
- **Off-chain:** encrypted file exists in IPFS; backend retains CID and key/IV.
- **UI:** success message and the hash shown under **My Documents**.

#### D) Common failure cases (registration)

- MetaMask rejected transaction → the upload may be stored off-chain but not registered on-chain.
- Wrong network in MetaMask → registration fails until the network matches the selected RPC network.
- Missing IPFS credentials → upload fails unless `IPFS_DISABLED=true` is used for local/demo mode.

### 9.3 Sharing workflow (Grant / Revoke viewer access)

Sharing is enforced by the smart contract for access decisions, and by the backend at download time.

#### A) User steps (what the owner does)

1. Open **My Documents** and locate the document hash.
2. Enter a viewer wallet address in the share input field.
3. Click **Grant** to give access.
4. To remove access later, enter the viewer address again and click **Revoke**.

#### B) System steps (what happens inside the system)

1. Frontend requests MetaMask to submit a transaction to the contract:
	- **Grant:** stores permission that the viewer can access the hash (or root hash).
	- **Revoke:** removes that permission.
2. After confirmation, the blockchain emits access control events (grant/revoke).
3. When a viewer attempts to download:
	- Viewer calls the backend download endpoint with `x-wallet-address`.
	- Backend checks permission using the contract (e.g., `canViewDocument(hash, viewer)`).
	- If allowed, backend fetches the encrypted file by CID from IPFS, decrypts, and returns the original bytes.

**Sharing + download sequence (summary):**

```text
Owner -> MetaMask -> Contract: grant/revoke access

Viewer -> Frontend -> Backend: GET /api/documents/:hash/download (viewer address)
Backend -> Contract: canViewDocument(hash, viewer)
Backend -> IPFS: fetch encrypted bytes
Backend: decrypt -> Viewer: file download
```

#### C) Notes on CID visibility

- CID may be displayed as “kept off-chain”. This is expected.
- Downloads do not require CID in the UI because the backend fetches by CID from its own server-side storage.

### 9.4 Owner download workflow

- The owner can download their own documents from **My Documents** using **Download**.
- The backend always allows the stored owner address to download their own document.

### 9.5 Verification workflow (Integrity check)

Verification checks whether the file’s computed hash exists on-chain.

1. User selects a file in the **Verify** section.
2. Backend computes the hash and calls the contract read method to check existence.
3. UI reports whether the document is registered.

### 9.6 Revocation workflow (Invalidating versions)

- Revocation marks a document version (or a root) as revoked on-chain.
- The UI labels revoked versions as **Revoked**.
- Access checks can be configured to block revoked versions for viewers; the backend enforces authorization and download policy.

---

## 10) API Documentation (Backend)

Base URL (local): `http://localhost:8080`

### 10.1 Health

`GET /api/health`
- Confirms backend is running + chain connection is valid.

### 10.2 Upload (encrypted → IPFS)

`POST /api/upload`
- Content-Type: `multipart/form-data`
- Form field: `file`
- Required header: `x-wallet-address: 0x...`

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
- Required header: `x-wallet-address: 0x...`
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
- Wallet address in `x-wallet-address` is not the owner and has not been granted access.

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


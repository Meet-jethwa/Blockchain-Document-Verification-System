# Code Guide

This document explains how the blockchain document verification system is wired together, where the main pieces live, and how data moves through the app.

## 1. What the system does

The app verifies documents by storing a document fingerprint on-chain and keeping the real file off-chain.

- The blockchain stores the document hash and access-control state.
- The backend stores the encrypted file bytes in IPFS and keeps the decryption material server-side.
- The frontend lets a user connect a wallet, upload files, verify files, and manage sharing.

The important design rule is that the smart contract does **not** store the actual file contents. It stores proof and permissions only.

## 2. Main code areas

### Smart contract

File: `contracts/DocumentRegistry.sol`

This is the core on-chain data layer. It handles:

- registering a document hash
- tracking document ownership
- granting and revoking viewer access
- root-level versioning support
- revocation checks
- read-only verification helpers

The contract stores only the document hash and related metadata. The `cid` field exists in the struct for compatibility, but registration requires an empty CID, and the contract rejects attempts to store CID data on-chain.

### Backend

Folder: `backend/`

This is the server-side workflow layer. It:

- receives uploads from the frontend
- hashes the raw file bytes with keccak256
- encrypts the file with AES-256-CBC before IPFS upload
- uploads the encrypted file to IPFS
- stores the CID and encryption material in a local JSON store
- checks blockchain permissions before serving downloads
- decrypts the file server-side and returns the original bytes to authorized users

### Frontend

Folder: `frontend/src/`

This is the user interface. It:

- connects to MetaMask
- shows the backend health/config state
- uploads documents for registration
- reads the user’s registered documents from the contract
- grants and revokes viewer access
- downloads decrypted files through the backend
- handles version and shared-document views

## 3. Contract usage

The frontend and backend both use the same contract, but for different jobs.

### Registration

The registration flow is split into two parts:

1. Backend computes the document hash and stores the encrypted file in IPFS.
2. Frontend asks MetaMask to send the transaction that calls `registerDocument(hash, "")`.

This means:

- the backend prepares the off-chain payload
- the user wallet signs the on-chain transaction
- the blockchain gets an immutable proof of registration

### Viewer access

The contract exposes viewer permission functions:

- `grantViewer(hash, viewer)` and `revokeViewer(hash, viewer)` for a single document
- `grantRootViewer(rootHash, viewer)` and `revokeRootViewer(rootHash, viewer)` for root-level access
- `canViewDocument(hash, user)` to check whether a wallet may view a document

The backend uses the access check before returning a decrypted download.

### Verification

The contract exposes read methods such as:

- `verifyDocument(hash)`
- `getMyDocuments()`
- `getDocumentMeta(hash)`
- `getDocumentVersion(hash)`
- `isDocumentRevoked(hash)`

These are used to build the document list and verify whether a file hash exists on-chain.

## 4. Backend file map

### `backend/server.js`

Main Express server and route definitions.

Important routes:

- `GET /api/health` - checks chain connectivity and backend config
- `POST /api/upload` - uploads, hashes, encrypts, stores in IPFS, and prepares registration
- `POST /api/register` - legacy alias for upload
- `POST /api/verify` - verifies by uploaded file
- `POST /api/verify-hash` - verifies by hash only
- `GET /api/documents/:hash/download` - authorized download, decrypts server-side

This file is the main orchestration layer. It connects the config, chain client, IPFS uploader, crypto helpers, and document store.

### `backend/config.js`

Loads and validates environment variables.

This file defines:

- RPC URL
- backend signing key
- contract address
- IPFS provider settings
- CORS origin
- optional file master key for wrapping stored secrets

If this file fails, the backend will not start.

### `backend/chain.js`

Wraps all blockchain calls using Ethers.

Responsibilities:

- creates the RPC provider and wallet
- connects to the deployed `DocumentRegistry` contract
- checks that the contract is deployed at the configured address
- exposes helpers for document existence, metadata, access checks, and registration

This is the main abstraction between the server and the contract.

### `backend/ipfs.js`

Handles IPFS upload and fetch logic.

It supports:

- Pinata uploads
- Web3.Storage uploads
- gateway reads for download
- a disabled mode for local/demo testing

### `backend/fileCrypto.js`

Contains the file encryption and decryption primitives.

It uses:

- AES-256-CBC
- a random 32-byte key per file
- a random 16-byte IV per file

### `backend/secretBox.js`

Wraps and unwraps the per-document key/IV material when `FILE_MASTER_KEY` is configured.

This protects the stored secrets at rest.

### `backend/documentStore.js`

A small JSON-backed storage layer for document metadata.

It stores:

- owner address
- CID
- file metadata
- encryption metadata
- timestamps and related local fields

Data is written to `backend/data/documents.json`.

### `backend/public/`

A simple static test UI for backend-only workflows.

It is separate from the React app and mainly useful for direct API checks.

## 5. Frontend file map

### `frontend/src/App.tsx`

This is the main React UI.

It:

- loads backend health info on startup
- connects to MetaMask
- builds an Ethers browser contract using the deployed address
- uploads documents through `postFile`
- calls contract methods for registration, sharing, revocation, and version lookup
- downloads authorized files from the backend

The contract ABI is embedded here so the browser can call the deployed contract directly.

### `frontend/src/api.ts`

Frontend HTTP helper layer.

It defines the response shapes for upload and verification requests and provides `postFile()` for multipart form uploads.

### `frontend/src/main.tsx`

Bootstraps the React application.

### `frontend/src/App.css` and `frontend/src/index.css`

UI styling for the application.

## 6. Deployment and scripts

### Root scripts

File: `package.json`

Useful scripts include:

- `npm run compile` - compiles the Solidity contract with Hardhat
- `npm run node` - starts a local Hardhat blockchain
- `npm run deploy:localhost` - deploys the contract to the local network
- `npm run backend` - starts the Express backend

### `scripts/deploy.js`

Deploys `DocumentRegistry` and prints the contract address.

That address must be copied into `backend/.env` as `CONTRACT_ADDRESS`.

### `scripts/demo.js`

Demo script for end-to-end workflow testing.

## 7. End-to-end data flow

### Upload and register

1. User selects a file in the frontend.
2. Frontend sends the file to `POST /api/upload`.
3. Backend hashes the raw bytes.
4. Backend encrypts the file bytes.
5. Backend uploads the encrypted bytes to IPFS.
6. Backend stores CID and key material in `backend/data/documents.json`.
7. Frontend asks MetaMask to call `registerDocument(hash, "")`.
8. Contract records the hash and ownership on-chain.

### Verify

1. User uploads a file to verify.
2. Backend hashes the file.
3. Backend checks the contract with `verifyDocument(hash)`.
4. The UI shows verified or not verified.

### Download

1. User clicks download in the UI.
2. Backend checks the caller’s wallet address.
3. Backend asks the contract if the wallet can view the document.
4. Backend fetches encrypted bytes from IPFS.
5. Backend decrypts the file.
6. Backend returns the original file bytes to the browser.

## 8. Important implementation notes

- The file hash is the on-chain source of truth for integrity.
- The CID stays off-chain.
- The encryption key and IV stay off-chain.
- The owner wallet always has access to its own document.
- Viewer access is enforced by the smart contract and checked again by the backend before download.
- If the contract address or RPC URL is wrong, backend startup or contract calls will fail early.

## 9. Quick source map

- Contract logic: `contracts/DocumentRegistry.sol`
- Backend API: `backend/server.js`
- Blockchain client: `backend/chain.js`
- IPFS client: `backend/ipfs.js`
- File crypto: `backend/fileCrypto.js`
- Secret wrapping: `backend/secretBox.js`
- Local metadata store: `backend/documentStore.js`
- Frontend UI: `frontend/src/App.tsx`
- Frontend API helper: `frontend/src/api.ts`
- Deployment: `scripts/deploy.js`

## 10. Practical setup reminder

Before running the app, make sure:

- the contract is deployed
- `backend/.env` has `CONTRACT_ADDRESS`
- the backend has RPC and private key settings
- IPFS credentials are configured, or IPFS is explicitly disabled for local testing
- the frontend is pointed at the running backend

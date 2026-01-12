# Blockchain Document Verification System

Verify documents using a simple, tamper-evident flow:

- **Register**: upload file → backend uploads to IPFS + returns CID + hash → your wallet stores (hash, CID) on-chain
- **Verify**: upload file → frontend hashes it → checks on-chain that *your wallet* registered that hash (prevents relay/replay in-app)

Repository layout:

- Smart contract + Hardhat project: `blockchain-doc-verification/`
- Backend (Express): `blockchain-doc-verification/backend/`
- Frontend (React/Vite): `blockchain-doc-verification/frontend/`

## Prerequisites

- Node.js 18+ (recommended)
- npm 9+
- Windows PowerShell (or any shell)

## Quick Start (Local Development)

You will run 3 things:

1) Local blockchain (Hardhat node)
2) Deploy contract to that chain
3) Backend + React frontend

### 1) Install dependencies

Open PowerShell and run:

```powershell
cd "blockchain-doc-verification"
npm install
```

### 2) Start local blockchain (Hardhat)

In Terminal 1:

```powershell
cd "blockchain-doc-verification"
npm run node
```

This starts the JSON-RPC server at:

- `http://127.0.0.1:8545`

Keep this terminal running.

### 3) Deploy the contract

In Terminal 2:

```powershell
cd "blockchain-doc-verification"
npm run deploy:localhost
```

You will see output like:

```text
DocumentRegistry deployed to: 0x...
```

Copy that address.

### 4) Configure backend environment

The backend reads env vars from:

- `blockchain-doc-verification/backend/.env`

If you don’t have it, create it from the example:

```powershell
cd "blockchain-doc-verification"
Copy-Item backend\env.example backend\.env
```

Edit `backend/.env` and set:

- `RPC_URL=http://127.0.0.1:8545`
- `PRIVATE_KEY=` (for local Hardhat node you can use account #0 private key printed by `npm run node`)
- `CONTRACT_ADDRESS=` (paste the deployed address from step 3)

IPFS options:

- Recommended: set `PINATA_JWT=...`
- Alternative: set `WEB3_STORAGE_TOKEN=...`
- Dev-only: set `IPFS_DISABLED=true` to skip IPFS uploads

### 5) Start the backend

In Terminal 3:

```powershell
cd "blockchain-doc-verification"
npm run backend
```

Backend runs at:

- `http://localhost:8080`

Health check:

- `http://localhost:8080/api/health`

### 6) Start the React frontend

In Terminal 4:

```powershell
cd "blockchain-doc-verification\frontend"
npm install
npm run dev
```

Frontend runs at:

- `http://localhost:5173`

The frontend proxies API calls to the backend (`/api/*` → `http://localhost:8080`).

## Using the App

Open the frontend and try:

- **Register Document**: choose a PDF (or any file) → click Register → you should see “Registered Successfully” + hash + tx
- **Verify Document**: upload the same file → click Verify → you should see “Document Verified”

If you upload a different file, it should show “Not Verified”.

## API Endpoints

Backend endpoints (multipart file field name is `file`):

- `GET /api/health`
- `POST /api/register`
- `POST /api/verify`
- `POST /api/verify-hash` (JSON body: `{ "hash": "0x..." }`)

## Troubleshooting

### `connect ECONNREFUSED 127.0.0.1:8545`

Cause: your local blockchain is not running.

Fix:

- Start it: `npm run node`
- Keep that terminal open

### Backend shows `contractAddress: 0x000...` in `/api/health`

Cause: `backend/.env` has an unset/old `CONTRACT_ADDRESS`, or the backend wasn’t restarted after updating `.env`.

Fix:

- Run `npm run deploy:localhost` and copy the new address
- Update `backend/.env`
- Restart backend

### `listen EADDRINUSE: address already in use :::8080`

Cause: backend is already running on port 8080.

Fix:

- Stop the existing backend process (close its terminal or stop the process)
- Then run `npm run backend` again

### Register returns `500`

Most common causes:

- Wrong RPC URL / chain not running
- Wrong `CONTRACT_ADDRESS`
- IPFS credentials missing/invalid

Quick test:

- Set `IPFS_DISABLED=true` in `backend/.env` and restart backend

### `could not decode result data (code=BAD_DATA)` when registering/verifying

Cause: your `CONTRACT_ADDRESS` is not the `DocumentRegistry` contract on the current RPC network (common when you restart `npm run node`, which resets the chain).

Fix:

- Ensure Hardhat node is running (`npm run node`)
- Redeploy (`npm run deploy:localhost`)
- Copy the printed **deployed address** (NOT the deployment tx hash) into `backend/.env` as `CONTRACT_ADDRESS`
- Restart backend

## Notes

- Every time you restart `npm run node`, the chain resets. You must redeploy and update `CONTRACT_ADDRESS`.

## Security (important)

- Never commit secrets to GitHub. Your `.env` may contain sensitive values like `PINATA_JWT` and `PRIVATE_KEY`.
- If you accidentally published a secret, rotate/revoke it immediately (Pinata dashboard / wallet key).

## Making it public (later)

When you deploy publicly, you cannot use `RPC_URL=http://127.0.0.1:8545` (that only works on your own machine).

- Deploy the contract to a public network (e.g. Sepolia).
- Use a real RPC provider URL (Infura/Alchemy/QuickNode) as `RPC_URL`.
- Set `CONTRACT_ADDRESS` to your deployed contract address on that network.
- Host backend + frontend and configure environment variables via your hosting provider.




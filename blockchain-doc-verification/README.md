# Hardhat + Smart Contract

This folder contains the Solidity contract and Hardhat scripts used by the backend.

## Smart contract

- Contract: [contracts/DocumentRegistry.sol](contracts/DocumentRegistry.sol)
- Stores a document hash (bytes32) on-chain.
- Prevents duplicates (same hash can’t be registered twice).

Key functions:

- `registerDocument(bytes32 hash, string cid)`
- `verifyDocument(bytes32 hash) → bool`
- `verifyMyDocument(bytes32 hash) → bool`
- `getMyDocuments() → bytes32[]`
- `getDocument(bytes32 hash) → (owner, cid, createdAt)`

## Local development (Hardhat)

From this folder:

```bash
npm install
```

Terminal A (keep running):

```bash
npm run node
```

This starts a local RPC at `http://127.0.0.1:8545`.

Terminal B (deploy):

```bash
npm run deploy:localhost
```

Copy the address printed as:

```text
DocumentRegistry deployed to: 0x...
```

That value is your backend `CONTRACT_ADDRESS`.

## Quick demo

Runs deploy + register + verify in one go:

```bash
npm run demo
```

## Public network (Sepolia / Amoy)

Hardhat reads network settings from `.env`.

1) Create a local env file:

```powershell
Copy-Item .env.example .env
```

2) Set values in `.env`:

- `DEPLOYER_PRIVATE_KEY=0x...` (funded wallet for that network)
- `SEPOLIA_RPC_URL=https://...` (Infura/Alchemy/etc.)
- `AMOY_RPC_URL=https://...` (Infura/Alchemy/etc.)

Deploy:

- `npm run deploy:sepolia`
- `npm run deploy:amoy`

Tip: for public deployment, you’ll use the deployed contract address as `CONTRACT_ADDRESS` in the backend, and a public `RPC_URL` (not `127.0.0.1`).

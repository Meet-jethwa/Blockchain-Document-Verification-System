# Backend (Week 2)

This backend implements Week 2: file upload → hash → IPFS → store hash on-chain.

## Prereqs

- A deployed `DocumentRegistry` contract (see `npm run deploy:localhost`, `deploy:sepolia`, `deploy:amoy`)
- An RPC URL and a funded private key for the target network
- An IPFS provider credential:
  - Pinata: `PINATA_JWT`
  - Web3.Storage: `WEB3_STORAGE_TOKEN`

## Setup

1) Create your backend env file:

```bash
cp backend/env.example backend/.env
```

2) Fill in:

- `RPC_URL`
- `PRIVATE_KEY`
- `CONTRACT_ADDRESS`
- one of `PINATA_JWT` or `WEB3_STORAGE_TOKEN`

## Run

```bash
npm run backend
```

## API

- `GET /api/health`
- `POST /api/register` (multipart form-data, field: `file`)
- `POST /api/verify` (multipart form-data, field: `file`)
- `POST /api/verify-hash` (json: `{ "hash": "0x..." }`)



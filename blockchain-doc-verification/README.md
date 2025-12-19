# What’s implemented (detailed)

This project already has a working Hardhat + Solidity setup, a `DocumentRegistry` smart contract, and scripts to compile, deploy, and do a quick end‑to‑end demo.

## 1) Smart contract

Contract file: [contracts/DocumentRegistry.sol](contracts/DocumentRegistry.sol)

### Storage

- Uses `mapping(bytes32 => bool) private documents;`
- Each document is represented by a `bytes32` hash (usually a Keccak‑256 hash).

### Functions

- `registerDocument(bytes32 hash)`
  - Rejects duplicates (`require(!documents[hash], "Document already exists")`)
  - Stores the hash on-chain (`documents[hash] = true`)
  - Emits `DocumentRegistered(hash, msg.sender)`

- `verifyDocument(bytes32 hash) view returns (bool)`
  - Returns `true` if the hash was registered, otherwise `false`

## 2) Hardhat configuration

Config file: [hardhat.config.js](hardhat.config.js)

- Solidity compiler version is set to `0.8.20`.
- Uses `@nomicfoundation/hardhat-ethers` (ethers v6 integration).
- Loads environment variables from `.env` using `dotenv/config`.

### Optional public networks (enabled via `.env`)

If you provide RPC URLs in your `.env`, the config enables:
- `sepolia` (Ethereum testnet)
- `amoy` (Polygon testnet)

The deployer account is taken from `DEPLOYER_PRIVATE_KEY`.

## 3) Scripts you can run

All commands run from the project root.

### Environment check

```bash
node -v
npm -v
```

### Compile

```bash
npm run compile
```

Expected: compilation succeeds with Solidity `0.8.20`.

### Quick demo (deploy + register + verify)

```bash
npm run demo
```

What it does (in one run):
- Deploys `DocumentRegistry`
- Creates a sample hash (Keccak‑256)
- Calls `registerDocument(hash)`
- Calls `verifyDocument(hash)`

Expected output includes:
- `DocumentRegistry deployed to: 0x...`
- `verifyDocument(hash): true`

Demo script: [scripts/demo.js](scripts/demo.js)

### Local blockchain server + deploy to localhost

Terminal A (keep running):
```bash
npm run node
```

Terminal B:
```bash
npm run deploy:localhost
```

Expected: prints the deployed contract address (and the deployment tx hash).

Deploy script: [scripts/deploy.js](scripts/deploy.js)

## 4) Public testnet deploy (Sepolia / Amoy)

### Set up `.env`

1) Create your local env file:
```bash
copy .env.example .env
```

2) Fill in `.env`:
- `DEPLOYER_PRIVATE_KEY` (test wallet private key)
- `SEPOLIA_RPC_URL` and/or `AMOY_RPC_URL`

### Deploy

- Sepolia:
```bash
npm run deploy:sepolia
```

- Amoy:
```bash
npm run deploy:amoy
```

Expected: prints `DocumentRegistry deployed to: 0x...` and `Deployment tx: 0x...`.

## 5) What counts as “done” (proof)

You can treat the work as complete if:
- `npm run compile` completes without errors
- `npm run demo` prints `verifyDocument(hash): true`
- A deploy command prints a contract address (`deploy:localhost` or a public testnet deploy)

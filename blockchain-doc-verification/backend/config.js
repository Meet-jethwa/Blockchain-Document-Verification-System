/**
 * @fileoverview Configuration module that loads and validates environment variables
 * @description This file ensures all required configuration is present before the backend starts
 * 
 * EXPLANATION FOR PROFESSOR:
 * - Environment variables allow different settings for development vs production
 * - We validate all required values upfront to fail fast if misconfigured
 * - Provides sensible defaults for local development (localhost blockchain, default wallet key)
 */

import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// Load environment variables from backend/.env file
// This works regardless of where the process was started from (unlike default dotenv behavior)
// "import.meta.url" is the current file's URL, we use it to find the .env file relative to this file
dotenv.config({
  path: fileURLToPath(new URL("./.env", import.meta.url)),
});

/**
 * Gets a required environment variable or throws an error
 * @param {string} name - The environment variable name
 * @returns {string} The trimmed value
 * @throws {Error} If the variable is missing or empty
 */
function mustGet(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required env var: ${name}. ` +
        `Create backend/.env (copy from backend/env.example) or set the variable in your shell.`
    );
  }
  return value.trim();
}

function getOptional(name, fallback = undefined) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) return fallback;
  return value.trim();
}

function isHex(value, hexChars) {
  return typeof value === "string" && new RegExp(`^0x[0-9a-fA-F]{${hexChars}}$`).test(value);
}

/**
 * Gets and validates an Ethereum address (20 bytes = 40 hex characters)
 * @param {string} name - The environment variable name
 * @returns {string} The validated address
 * @throws {Error} If not a valid Ethereum address format
 * 
 * EXPLANATION: Ethereum addresses are 20 bytes (40 hex chars) with "0x" prefix
 * Example: 0x5FbDB2315678afecb367f032d93F642f64180aa3
 */
function mustGetAddress(name) {
  const value = mustGet(name);
  if (!isHex(value, 40)) {
    const hint = isHex(value, 64)
      ? "(looks like a transaction hash; use the deployed contract address printed as 'DocumentRegistry deployed to: 0x...')"
      : "(expected 0x + 40 hex chars)";
    throw new Error(`Invalid ${name}: ${value} ${hint}`);
  }
  return value;
}

function mustGetPrivateKey(name) {
  const value = mustGet(name);
  if (!isHex(value, 64)) {
    throw new Error(`Invalid ${name}: expected 0x + 64 hex chars`);
  }
  return value;
}

// Local-only default key provided by `hardhat node` (account #0).
const HARDHAT_LOCAL_DEFAULT_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function getPrivateKeyOrDefault() {
  const value = getOptional("PRIVATE_KEY", HARDHAT_LOCAL_DEFAULT_KEY);
  if (!isHex(value, 64)) {
    throw new Error(`Invalid PRIVATE_KEY: expected 0x + 64 hex chars`);
  }
  return value;
}

/**
 * Main configuration object exported for use throughout the backend
 * 
 * EXPLANATION FOR PROFESSOR:
 * - port: HTTP server port (default 8080)
 * - corsOrigin: Cross-Origin Resource Sharing - allows frontend from different domain to access API
 * - rpcUrl: Blockchain node URL (Ethereum RPC endpoint to send transactions)
 * - privateKey: Wallet private key used by backend to pay for gas fees
 * - contractAddress: Address of deployed DocumentRegistry smart contract
 * - IPFS settings: For storing actual document files off-chain
 */
export const config = {
  port: Number(getOptional("PORT", "8080")),
  corsOrigin: getOptional("CORS_ORIGIN", "*"), // "*" allows all origins (dev only, restrict in production)

  // Blockchain connection settings
  // Defaults make local dev smoother when backend/.env is missing.
  // For production/public networks, set these explicitly via backend/.env or hosting env vars.
  rpcUrl: getOptional("RPC_URL", "http://127.0.0.1:8545"), // Local Hardhat node by default
  privateKey: getPrivateKeyOrDefault(), // Wallet key for signing transactions
  contractAddress: mustGetAddress("CONTRACT_ADDRESS"), // REQUIRED: Where the smart contract is deployed

  // IPFS (InterPlanetary File System) configuration
  ipfsDisabled: getOptional("IPFS_DISABLED", "false").toLowerCase() === "true",

  // IPFS provider credentials (choose one):
  // - Pinata: Popular IPFS pinning service (recommended)
  // - Web3.Storage: Free IPFS service by Protocol Labs
  pinataJwt: getOptional("PINATA_JWT"),
  web3StorageToken: getOptional("WEB3_STORAGE_TOKEN"),
  ipfsGatewayBaseUrl: getOptional("IPFS_GATEWAY_BASE_URL", "https://ipfs.io/ipfs/"), // Public gateway to view files

  // Optional: used to encrypt per-document file keys/IVs at rest (NOT used for the file encryption itself)
  // Accepts 32-byte hex (with or without 0x) or 32-byte base64
  fileMasterKey: getOptional("FILE_MASTER_KEY"),
};



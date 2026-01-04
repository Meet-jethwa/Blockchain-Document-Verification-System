import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// Load env vars from backend/.env regardless of current working directory.
// (dotenv's default behavior only loads .env from process.cwd())
dotenv.config({
  path: fileURLToPath(new URL("./.env", import.meta.url)),
});

function mustGet(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
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

export const config = {
  port: Number(getOptional("PORT", "8080")),
  corsOrigin: getOptional("CORS_ORIGIN", "*"),

  rpcUrl: mustGet("RPC_URL"),
  privateKey: mustGetPrivateKey("PRIVATE_KEY"),
  contractAddress: mustGetAddress("CONTRACT_ADDRESS"),

  ipfsDisabled: getOptional("IPFS_DISABLED", "false").toLowerCase() === "true",

  // Choose one:
  // - PINATA_JWT (recommended)
  // - WEB3_STORAGE_TOKEN
  pinataJwt: getOptional("PINATA_JWT"),
  web3StorageToken: getOptional("WEB3_STORAGE_TOKEN"),
  ipfsGatewayBaseUrl: getOptional("IPFS_GATEWAY_BASE_URL", "https://ipfs.io/ipfs/"),
};



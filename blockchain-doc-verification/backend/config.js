import "dotenv/config";

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

export const config = {
  port: Number(getOptional("PORT", "8080")),
  corsOrigin: getOptional("CORS_ORIGIN", "*"),

  rpcUrl: mustGet("RPC_URL"),
  privateKey: mustGet("PRIVATE_KEY"),
  contractAddress: mustGet("CONTRACT_ADDRESS"),

  ipfsDisabled: getOptional("IPFS_DISABLED", "false").toLowerCase() === "true",

  // Choose one:
  // - PINATA_JWT (recommended)
  // - WEB3_STORAGE_TOKEN
  pinataJwt: getOptional("PINATA_JWT"),
  web3StorageToken: getOptional("WEB3_STORAGE_TOKEN"),
  ipfsGatewayBaseUrl: getOptional("IPFS_GATEWAY_BASE_URL", "https://ipfs.io/ipfs/"),
};



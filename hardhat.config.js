import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";

import "dotenv/config";

function normalizePrivateKey(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

const deployerKey = normalizePrivateKey(process.env.DEPLOYER_PRIVATE_KEY);
const accounts = deployerKey ? [deployerKey] : [];

// Default key provided by `hardhat node` (local development only).
const HARDHAT_LOCAL_DEFAULT_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const localhostAccounts = deployerKey ? [deployerKey] : [HARDHAT_LOCAL_DEFAULT_KEY];

const networks = {};

// Local hardhat node (http://127.0.0.1:8545)
networks.localhost = {
  type: "http",
  url: "http://127.0.0.1:8545",
  accounts: localhostAccounts,
};

if (process.env.SEPOLIA_RPC_URL) {
  networks.sepolia = {
    type: "http",
    url: process.env.SEPOLIA_RPC_URL,
    accounts,
  };
}

if (process.env.AMOY_RPC_URL) {
  networks.amoy = {
    type: "http",
    url: process.env.AMOY_RPC_URL,
    accounts,
  };
}

export default defineConfig({
  solidity: "0.8.20",
  plugins: [hardhatEthers],
  networks,
});

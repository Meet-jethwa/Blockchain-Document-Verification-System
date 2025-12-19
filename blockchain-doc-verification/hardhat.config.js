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

const networks = {};

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

import { ethers } from "ethers";

// Minimal ABI for Week 1 contract.
const DOCUMENT_REGISTRY_ABI = [
  "function registerDocument(bytes32 hash) external",
  "function verifyDocument(bytes32 hash) external view returns (bool)",
  "event DocumentRegistered(bytes32 hash, address indexed sender)",
];

export function makeChainClient({ rpcUrl, privateKey, contractAddress }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, DOCUMENT_REGISTRY_ABI, wallet);

  return {
    provider,
    wallet,
    contract,
    async registerDocumentHash(hash) {
      // Pre-check to avoid a revert (which can surface as "missing revert data" during estimateGas)
      // and to return a deterministic error message for duplicates.
      const exists = await contract.verifyDocument(hash);
      if (exists) {
        throw new Error("Document already exists");
      }
      const tx = await contract.registerDocument(hash);
      const receipt = await tx.wait();
      return { txHash: tx.hash, receipt };
    },
    async verifyDocumentHash(hash) {
      return await contract.verifyDocument(hash);
    },
  };
}

export function hashFileKeccak256(buffer) {
  // Returns a 0x-prefixed bytes32 hex string.
  return ethers.keccak256(buffer);
}



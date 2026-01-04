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
  const normalizedAddress = ethers.getAddress(contractAddress);
  const contract = new ethers.Contract(normalizedAddress, DOCUMENT_REGISTRY_ABI, wallet);

  let contractChecked = false;
  async function assertContractDeployed() {
    if (contractChecked) return;

    const [network, code] = await Promise.all([provider.getNetwork(), provider.getCode(normalizedAddress)]);
    if (!code || code === "0x") {
      throw new Error(
        `No contract deployed at ${normalizedAddress} on chainId=${network.chainId}. ` +
          `Did you restart 'hardhat node' without redeploying and updating CONTRACT_ADDRESS?`
      );
    }

    contractChecked = true;
  }

  function rethrowAbiMismatch(err) {
    if (err && typeof err === "object" && "code" in err && err.code === "BAD_DATA") {
      throw new Error(
        `Contract call failed to decode. The address ${normalizedAddress} may not be a DocumentRegistry contract ` +
          `on this network. Double-check CONTRACT_ADDRESS and RPC_URL.`
      );
    }
    throw err;
  }

  return {
    provider,
    wallet,
    contract,
    async registerDocumentHash(hash) {
      await assertContractDeployed();
      // Pre-check to avoid a revert (which can surface as "missing revert data" during estimateGas)
      // and to return a deterministic error message for duplicates.
      let exists;
      try {
        exists = await contract.verifyDocument(hash);
      } catch (err) {
        rethrowAbiMismatch(err);
      }
      if (exists) {
        throw new Error("Document already exists");
      }
      const tx = await contract.registerDocument(hash);
      const receipt = await tx.wait();
      return { txHash: tx.hash, receipt };
    },
    async verifyDocumentHash(hash) {
      await assertContractDeployed();
      try {
        return await contract.verifyDocument(hash);
      } catch (err) {
        rethrowAbiMismatch(err);
      }
    },
  };
}

export function hashFileKeccak256(buffer) {
  // Returns a 0x-prefixed bytes32 hex string.
  return ethers.keccak256(buffer);
}



import { ethers } from "ethers";

/**
 * ABI for the DocumentRegistry smart contract.
 * CID is NOT stored on-chain; only the hash, owner, and timestamp are.
 */
const DOCUMENT_REGISTRY_ABI = [
  "function registerDocument(bytes32 hash) external",
  "function addDocumentVersion(bytes32 rootHash, bytes32 hash) external",
  "function verifyDocument(bytes32 hash) external view returns (bool)",
  "function verifyMyDocument(bytes32 hash) external view returns (bool)",
  "function canViewDocument(bytes32 hash, address user) external view returns (bool)",
  "function getDocumentMeta(bytes32 hash) external view returns (address owner, uint256 createdAt)",
  "function getMyDocuments() external view returns (bytes32[] memory)",
  "function getDocumentVersion(bytes32 hash) external view returns (bytes32 rootHash, uint256 version)",
  "function getDocumentVersions(bytes32 rootHash) external view returns (bytes32[] memory)",
  "function revokeDocument(bytes32 hash) external",
  "function revokeDocumentRoot(bytes32 rootHash) external",
  "function isDocumentRevoked(bytes32 hash) external view returns (bool)",
  "function grantViewer(bytes32 hash, address viewer) external",
  "function revokeViewer(bytes32 hash, address viewer) external",
  "function grantRootViewer(bytes32 rootHash, address viewer) external",
  "function revokeRootViewer(bytes32 rootHash, address viewer) external",
  "event DocumentRegistered(bytes32 indexed hash, address indexed owner)",
  "event DocumentVersionAdded(bytes32 indexed rootHash, bytes32 indexed hash, address indexed owner, uint256 version)",
  "event ViewerAccessGranted(bytes32 indexed hash, address indexed owner, address indexed viewer)",
  "event ViewerAccessRevoked(bytes32 indexed hash, address indexed owner, address indexed viewer)",
  "event RootViewerAccessGranted(bytes32 indexed rootHash, address indexed owner, address indexed viewer)",
  "event RootViewerAccessRevoked(bytes32 indexed rootHash, address indexed owner, address indexed viewer)",
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

    async canViewDocument(hash, userAddress) {
      await assertContractDeployed();
      try {
        return await contract.canViewDocument(hash, userAddress);
      } catch (err) {
        rethrowAbiMismatch(err);
      }
    },

    async getDocumentMeta(hash) {
      await assertContractDeployed();
      try {
        const [owner, createdAt] = await contract.getDocumentMeta(hash);
        return { owner, createdAt };
      } catch (err) {
        rethrowAbiMismatch(err);
      }
    },

    async documentExists(hash) {
      await assertContractDeployed();
      try {
        await contract.getDocumentMeta(hash);
        return true;
      } catch (err) {
        if (err && typeof err === "object" && "code" in err && err.code === "BAD_DATA") {
          rethrowAbiMismatch(err);
        }
        return false;
      }
    },

    async isDocumentRevoked(hash) {
      await assertContractDeployed();
      try {
        return await contract.isDocumentRevoked(hash);
      } catch (err) {
        rethrowAbiMismatch(err);
      }
    },
  };
}

export function hashFileKeccak256(buffer) {
  return ethers.keccak256(buffer);
}

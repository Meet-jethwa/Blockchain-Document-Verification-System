/**
 * @fileoverview Blockchain interaction module using Ethers.js
 * @description Provides functions to interact with the DocumentRegistry smart contract
 * 
 * EXPLANATION FOR PROFESSOR:
 * - This file abstracts all blockchain operations so other parts of the backend don't need to know about Web3
 * - Uses Ethers.js library (industry-standard for Ethereum interactions in JavaScript)
 * - Contains the contract ABI (Application Binary Interface) - defines function signatures
 * - Provides functions to: register documents, verify documents, retrieve document data
 */

import { ethers } from "ethers";

/**
 * ABI (Application Binary Interface) for the DocumentRegistry smart contract
 * 
 * EXPLANATION FOR PROFESSOR:
 * - ABI is like an API specification for smart contracts
 * - It tells JavaScript how to encode function calls and decode return values
 * - Generated when you compile the Solidity contract (we extracted just what we need)
 * - Contains: function names, parameter types, return types, and events
 * 
 * This ABI allows us to call the contract's functions from JavaScript:
 * - registerDocument(hash, cid) - Write function (costs gas)
 * - verifyDocument(hash) - Read function (free, view-only)
 * - verifyMyDocument(hash) - Read function (checks ownership)
 * - getDocument(hash) - Read function (returns full document data)
 * - getMyDocuments() - Read function (returns array of user's document hashes)
 */
const DOCUMENT_REGISTRY_ABI =[
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "bytes32",
				"name": "hash",
				"type": "bytes32"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "cid",
				"type": "string"
			}
		],
		"name": "DocumentRegistered",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "hash",
				"type": "bytes32"
			}
		],
		"name": "isDocumentRevoked",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "hash",
				"type": "bytes32"
			}
		],
		"name": "getDocumentMeta",
		"outputs": [
			{
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "createdAt",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "hash",
				"type": "bytes32"
			}
		],
		"name": "getDocument",
		"outputs": [
			{
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"internalType": "string",
				"name": "cid",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "createdAt",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getMyDocuments",
		"outputs": [
			{
				"internalType": "bytes32[]",
				"name": "",
				"type": "bytes32[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "hash",
				"type": "bytes32"
			},
			{
				"internalType": "string",
				"name": "cid",
				"type": "string"
			}
		],
		"name": "registerDocument",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "hash",
				"type": "bytes32"
			}
		],
		"name": "verifyDocument",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "hash",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "user",
				"type": "address"
			}
		],
		"name": "canViewDocument",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "hash",
				"type": "bytes32"
			}
		],
		"name": "verifyMyDocument",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];

/**
 * Creates a blockchain client for interacting with the DocumentRegistry contract
 * @param {Object} params - Configuration parameters
 * @param {string} params.rpcUrl - Ethereum node RPC URL (e.g., http://127.0.0.1:8545 for local)
 * @param {string} params.privateKey - Private key of wallet to use for transactions
 * @param {string} params.contractAddress - Address where DocumentRegistry is deployed
 * @returns {Object} Client object with functions to interact with blockchain
 * 
 * EXPLANATION:
 * - Provider: Connection to blockchain (reads data)
 * - Wallet: Account with private key (can sign transactions and send them)
 * - Contract: Represents the smart contract, allows calling its functions
 */
export function makeChainClient({ rpcUrl, privateKey, contractAddress }) {
  // Create provider (connection to Ethereum node)
  // JsonRpcProvider connects via HTTP to an Ethereum RPC endpoint
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  // Create wallet from private key and connect to provider
  // Wallet can sign transactions to modify blockchain state
  const wallet = new ethers.Wallet(privateKey, provider);
  
  // Normalize address to checksum format (ensures valid format)
  const normalizedAddress = ethers.getAddress(contractAddress);
  
  // Create contract instance - combination of ABI + address + wallet
  // This allows us to call contract functions as if they were JavaScript functions
  const contract = new ethers.Contract(normalizedAddress, DOCUMENT_REGISTRY_ABI, wallet);

  // Flag to track if we've verified the contract exists (optimization - only check once)
  let contractChecked = false;
  
  /**
   * Verifies that a contract is actually deployed at the specified address
   * @throws {Error} If no contract code found at address
   * 
   * EXPLANATION: Before calling contract functions, we verify it exists
   * This prevents confusing errors if you forgot to deploy or restarted local blockchain
   */
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

  /**
   * Helper function to provide better error messages when contract ABI doesn't match
   * @param {Error} err - The error to check and potentially rethrow with better message
   * @throws {Error} Enhanced error message if ABI mismatch detected
   */
  function rethrowAbiMismatch(err) {
		if (err && typeof err === "object" && "code" in err && err.code === "BAD_DATA") {
			throw new Error(
        `Contract call failed to decode. The address ${normalizedAddress} may not be a DocumentRegistry contract ` +
          `on this network. Double-check CONTRACT_ADDRESS and RPC_URL.`
      );
    }
    throw err;
  }

  // Return object with all blockchain interaction methods
  return {
    provider,  // Expose provider for health checks
    wallet,    // Expose wallet to show which address is being used
    contract,  // Expose contract for advanced usage
    
    /**
     * Registers a document hash on the blockchain
     * @param {string} hash - bytes32 hash of the document (0x + 64 hex chars)
     * @param {string} cid - IPFS Content Identifier (optional, default empty string)
     * @returns {Promise<Object>} Transaction hash and receipt
     * @throws {Error} If document already exists or transaction fails
     * 
     * EXPLANATION FOR PROFESSOR:
     * - This is a WRITE operation (modifies blockchain state, costs gas)
     * - Pre-checks if document exists to avoid wasting gas on failed transaction
     * - Sends transaction and waits for it to be mined into a block
     * - Returns transaction hash (proof of registration) and receipt (confirmation)
     */
    async registerDocumentHash(hash, cid = "") {
      await assertContractDeployed(); // Verify contract exists first
      
      // Pre-check: See if document already exists (prevents wasting gas on revert)
      // Pre-checking saves money - failed transactions still cost gas!
      let exists;
      try {
        exists = await contract.verifyDocument(hash);
      } catch (err) {
        rethrowAbiMismatch(err);
      }
      if (exists) {
				throw new Error("Document already exists");
      }
      
      // Send transaction to blockchain
			// This returns immediately with a pending transaction object
			const tx = await contract.registerDocument(hash, cid);
      
			// Wait for transaction to be mined (included in a block)
			// This can take seconds to minutes depending on network congestion
			const receipt = await tx.wait();
      
      return { txHash: tx.hash, receipt };
    },
    
    /**
     * Checks if a document hash exists on the blockchain
     * @param {string} hash - bytes32 hash to verify
     * @returns {Promise<boolean>} True if exists, false otherwise
     * 
     * EXPLANATION: This is a READ operation (view function) - FREE, no gas cost
     */
    async verifyDocumentHash(hash) {
      await assertContractDeployed();
      try {
        return await contract.verifyDocument(hash);
      } catch (err) {
        rethrowAbiMismatch(err);
      }
    },

		/**
		 * Checks whether a user is allowed to view a given document.
		 * This is a READ operation (view) - no gas.
		 */
		async canViewDocument(hash, userAddress) {
			await assertContractDeployed();
			try {
				return await contract.canViewDocument(hash, userAddress);
			} catch (err) {
				rethrowAbiMismatch(err);
			}
		},
    
    /**
     * Retrieves full document details from blockchain
     * @param {string} hash - bytes32 hash to look up
     * @returns {Promise<Object>} Object with {owner, cid, createdAt}
     * @throws {Error} If document not found
     * 
     * EXPLANATION: Gets all metadata stored on-chain for a document
     */
    async getDocument(hash) {
      await assertContractDeployed();
      try {
        // Contract returns array: [owner, cid, createdAt]
				// We destructure it into named variables
				const [owner, cid, createdAt] = await contract.getDocument(hash);
        return { owner, cid, createdAt };
      } catch (err) {
        rethrowAbiMismatch(err);
      }
    },

		/**
		 * Retrieves non-sensitive document metadata (owner + createdAt)
		 * @param {string} hash - bytes32 hash to look up
		 * @returns {Promise<Object>} Object with {owner, createdAt}
		 */
		async getDocumentMeta(hash) {
			await assertContractDeployed();
			try {
				const [owner, createdAt] = await contract.getDocumentMeta(hash);
				return { owner, createdAt };
			} catch (err) {
				rethrowAbiMismatch(err);
			}
		},

		/**
		 * Checks existence regardless of revocation.
		 * (verifyDocument() may be false for revoked documents.)
		 */
		async documentExists(hash) {
			await assertContractDeployed();
			try {
				await contract.getDocumentMeta(hash);
				return true;
			} catch (err) {
				// If it's an ABI mismatch, surface it. Otherwise treat as non-existent.
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

/**
 * Computes the Keccak-256 hash of a file buffer
 * @param {Buffer} buffer - File contents as Buffer
 * @returns {string} 0x-prefixed bytes32 hex string (66 characters total)
 * 
 * EXPLANATION FOR PROFESSOR:
 * - Keccak-256 is the hashing algorithm used by Ethereum (similar to SHA-3)
 * - Input: Any sized file → Output: Always 32 bytes (256 bits) = 64 hex characters
 * - Same file = same hash, Different file = completely different hash
 * - Even 1 bit change in file produces completely different hash (avalanche effect)
 * - This is a one-way function: hash cannot be reversed to get original file
 * Example hash: 0x1234...abcd (0x prefix + 64 hex chars = 66 total chars)
 */
export function hashFileKeccak256(buffer) {
  // ethers.keccak256 computes the hash and returns it in Ethereum's 0x-prefixed format
  return ethers.keccak256(buffer);
}



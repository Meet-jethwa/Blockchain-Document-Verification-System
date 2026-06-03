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

import { createHash } from "node:crypto";
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
					"indexed": true,
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
  
	// Create separate contract instances for reads and writes.
	// Read calls use the provider so we can supply `from` overrides for msg.sender-dependent views.
	// Write calls use the wallet so transactions can be signed.
	const readContract = new ethers.Contract(normalizedAddress, DOCUMENT_REGISTRY_ABI, provider);
	const writeContract = new ethers.Contract(normalizedAddress, DOCUMENT_REGISTRY_ABI, wallet);

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

	// Some managed RPC providers (e.g. Google Blockchain RPC) enforce tiny eth_getLogs ranges.
	// Keep each request to 5 blocks (inclusive) by using a span of 4.
	const LOG_QUERY_MAX_SPAN = 4;
	let cachedRegistrationLogs = [];
	let cachedRegistrationLatestBlock = -1;

	// To avoid scanning the entire chain on first run (which can be millions of blocks),
	// only scan the most recent N blocks initially. This keeps development/debug runs
	// and managed RPC providers responsive. Increase if you need full historical indexing.
	const INITIAL_SCAN_BACKLOG = 10000; // scan up to the last 10k blocks on cold start

	async function getLogsInChunks({ topics, fromBlock = 0, toBlock }) {
		const startBlock = Number(fromBlock);
		const endBlock = Number(toBlock ?? (await provider.getBlockNumber()));
		const logs = [];

		if (!Number.isFinite(startBlock) || !Number.isFinite(endBlock) || endBlock < startBlock) {
			return logs;
		}

		for (let chunkStart = startBlock; chunkStart <= endBlock; chunkStart += LOG_QUERY_MAX_SPAN + 1) {
			const chunkEnd = Math.min(chunkStart + LOG_QUERY_MAX_SPAN, endBlock);
			const chunkLogs = await provider.getLogs({
				address: normalizedAddress,
				topics,
				fromBlock: ethers.toQuantity(chunkStart),
				toBlock: ethers.toQuantity(chunkEnd),
			});
			logs.push(...chunkLogs);
		}

		return logs;
	}

	async function getLogsInChunksRange({ topics, fromBlock, toBlock }) {
		return getLogsInChunks({ topics, fromBlock, toBlock });
	}

	async function getDocumentRegisteredLogs() {
		const latestBlock = await provider.getBlockNumber();
		const fragment = readContract.interface.getEvent('DocumentRegistered');
		// Compute topic hash for the event signature. `ethers.id` returns keccak256 of the string.
		const eventTopic = ethers.id('DocumentRegistered(bytes32,address,string)');
		if (cachedRegistrationLatestBlock > latestBlock) {
			cachedRegistrationLogs = [];
			cachedRegistrationLatestBlock = -1;
		}

		const fromBlock = cachedRegistrationLatestBlock >= 0
			? cachedRegistrationLatestBlock + 1
			: Math.max(0, latestBlock - INITIAL_SCAN_BACKLOG);
		let freshLogs = [];
		if (fromBlock <= latestBlock) {
			try {
				freshLogs = await getLogsInChunksRange({
					topics: [eventTopic],
					fromBlock,
					toBlock: latestBlock,
				});
			} catch (err) {
				// Log and continue; avoid throwing to callers so they can handle gracefully
				// eslint-disable-next-line no-console
				console.warn('getDocumentRegisteredLogs: getLogsInChunksRange failed', String(err));
				freshLogs = [];
			}
		}

		if (freshLogs.length > 0 || cachedRegistrationLogs.length === 0) {
			const decodedFreshLogs = freshLogs
			.map((log) => {
				try {
					const decoded = readContract.interface.decodeEventLog(fragment, log.data, log.topics);
					const hash = decoded?.hash ?? decoded?.[0] ?? null;
					const owner = decoded?.owner ?? decoded?.[1] ?? null;
					const cid = decoded?.cid ?? decoded?.[2] ?? null;
					return {
						hash: typeof hash === 'string' ? hash : null,
						owner: typeof owner === 'string' ? owner : null,
						cid: typeof cid === 'string' ? cid : null,
						blockNumber: log.blockNumber ?? null,
					};
				} catch {
					return null;
				}
			})
			.filter((entry) => entry && typeof entry.hash === 'string' && entry.hash.startsWith('0x') && entry.hash.length === 66);

			cachedRegistrationLogs = [...cachedRegistrationLogs, ...decodedFreshLogs];
			cachedRegistrationLatestBlock = latestBlock;
		}

		return cachedRegistrationLogs;
	}

	async function getViewerGrantedLogs(viewerAddress) {
		await assertContractDeployed();
		const normalizedViewer = ethers.getAddress(viewerAddress);
		const signature = 'ViewerAccessGranted(bytes32,address,address)';
		const fragment = readContract.interface.getEvent(signature);
		const eventTopic = ethers.id(signature);
		const latestBlock = await provider.getBlockNumber();
		const fromBlock = Math.max(0, latestBlock - INITIAL_SCAN_BACKLOG);
		const logs = await getLogsInChunks({
			topics: [eventTopic, null, null, ethers.zeroPadValue(normalizedViewer, 32)],
			fromBlock,
			toBlock: latestBlock,
		});

		return logs
			.map((log) => {
				try {
					const decoded = readContract.interface.decodeEventLog(fragment, log.data, log.topics);
					const hash = decoded?.hash ?? decoded?.[0] ?? null;
					const owner = decoded?.owner ?? decoded?.[1] ?? null;
					const viewer = decoded?.viewer ?? decoded?.[2] ?? null;
					return {
						hash: typeof hash === 'string' ? hash : null,
						owner: typeof owner === 'string' ? owner : null,
						viewer: typeof viewer === 'string' ? viewer : null,
						blockNumber: log.blockNumber ?? null,
					};
				} catch {
					return null;
				}
			})
			.filter((entry) => entry && typeof entry.hash === 'string' && entry.hash.startsWith('0x') && entry.hash.length === 66);
	}

	async function getRootViewerGrantedLogs(viewerAddress) {
		await assertContractDeployed();
		const normalizedViewer = ethers.getAddress(viewerAddress);
		const signature = 'RootViewerAccessGranted(bytes32,address,address)';
		const fragment = readContract.interface.getEvent(signature);
		const eventTopic = ethers.id(signature);
		const latestBlock = await provider.getBlockNumber();
		const fromBlock = Math.max(0, latestBlock - INITIAL_SCAN_BACKLOG);
		const logs = await getLogsInChunks({
			topics: [eventTopic, null, null, ethers.zeroPadValue(normalizedViewer, 32)],
			fromBlock,
			toBlock: latestBlock,
		});

		return logs
			.map((log) => {
				try {
					const decoded = readContract.interface.decodeEventLog(fragment, log.data, log.topics);
					const rootHash = decoded?.rootHash ?? decoded?.[0] ?? null;
					const owner = decoded?.owner ?? decoded?.[1] ?? null;
					const viewer = decoded?.viewer ?? decoded?.[2] ?? null;
					return {
						rootHash: typeof rootHash === 'string' ? rootHash : null,
						owner: typeof owner === 'string' ? owner : null,
						viewer: typeof viewer === 'string' ? viewer : null,
						blockNumber: log.blockNumber ?? null,
					};
				} catch {
					return null;
				}
			})
			.filter((entry) => entry && typeof entry.rootHash === 'string' && entry.rootHash.startsWith('0x') && entry.rootHash.length === 66);
	}

  // Return object with all blockchain interaction methods
  return {
    provider,  // Expose provider for health checks
    wallet,    // Expose wallet to show which address is being used
	contract: readContract,  // Expose read-only contract for advanced usage
    
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
		exists = await writeContract.verifyDocument(hash);
      } catch (err) {
        rethrowAbiMismatch(err);
      }
      if (exists) {
				throw new Error("Document already exists");
      }
      
      // Send transaction to blockchain
			// This returns immediately with a pending transaction object
			const tx = await writeContract.registerDocument(hash, cid);
      
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
		return await readContract.verifyDocument(hash);
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
				return await readContract.canViewDocument(hash, userAddress);
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
		async getDocument(hash, callerAddress = null) {
      await assertContractDeployed();
      try {
				const overrides = callerAddress ? { from: callerAddress } : undefined;
				const [owner, cid, createdAt] = overrides
					? await readContract.getDocument(hash, overrides)
					: await readContract.getDocument(hash);
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
				const [owner, createdAt] = await readContract.getDocumentMeta(hash);
				return { owner, createdAt };
			} catch (err) {
				rethrowAbiMismatch(err);
			}
		},

		async getRegistrationProof(hash) {
			await assertContractDeployed();
			try {
				const registrations = await getDocumentRegisteredLogs();
				const log = registrations.find((entry) => entry.hash.toLowerCase() === String(hash).toLowerCase());
				if (!log) return null;
				const [owner, createdAt] = await readContract.getDocumentMeta(hash);
				return {
					owner,
					createdAt,
					blockNumber: log.blockNumber ?? null,
				};
			} catch (err) {
				rethrowAbiMismatch(err);
			}
		},

		async listRegisteredHashes() {
			await assertContractDeployed();
			try {
				const registrations = await getDocumentRegisteredLogs();
				return registrations
					.map((entry) => entry.hash)
					.filter((hash) => typeof hash === 'string' && hash.startsWith('0x') && hash.length === 66);
			} catch (err) {
				rethrowAbiMismatch(err);
			}
		},

		async listRegisteredDocuments() {
			await assertContractDeployed();
			try {
				return await getDocumentRegisteredLogs();
			} catch (err) {
				rethrowAbiMismatch(err);
			}
		},

		async listSharedDocuments(viewerAddress) {
			await assertContractDeployed();
			try {
				const [directShares, rootShares] = await Promise.all([
					getViewerGrantedLogs(viewerAddress),
					getRootViewerGrantedLogs(viewerAddress),
				]);
				const rootHashSet = new Set(rootShares.map((entry) => entry.rootHash.toLowerCase()));
				const rootDocs = rootHashSet.size === 0 ? [] : await Promise.all([...rootHashSet].map((rootHash) => readContract.getDocumentVersions(rootHash).catch(() => [])));
				const rootVersionHashes = rootDocs.flat().map((hashValue) => String(hashValue));
				return Array.from(new Set([...directShares.map((entry) => entry.hash), ...rootVersionHashes]));
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
				await readContract.getDocumentMeta(hash);
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
				return await readContract.isDocumentRevoked(hash);
			} catch (err) {
				rethrowAbiMismatch(err);
			}
		},
  };
}

/**
 * Computes the keccak256 hash of a file buffer (0x-prefixed bytes32 hex string).
 * Historically the project used SHA-256; the code now prefers keccak256 to match
 * on-chain usage. A legacy SHA-256 helper is available as
 * `hashFileSha256Legacy` for compatibility with older registrations.
 */
export function hashFileSha256(buffer) {
	// Historically this project used SHA-256; switch to keccak256 to match
	// on-chain semantics in the paper. Keep the exported name for
	// compatibility with the rest of the codebase.
	const bytes = Buffer.isBuffer(buffer) ? Uint8Array.from(buffer) : Uint8Array.from(Buffer.from(buffer));
	return ethers.keccak256(bytes);
}

export function hashFileKeccak256(buffer) {
	return hashFileSha256(buffer);
}

/**
 * Legacy SHA-256 hash function kept for compatibility with older
 * on-chain registrations. Returns 0x-prefixed 32-byte hex string.
 */
export function hashFileSha256Legacy(buffer) {
	const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
	return `0x${createHash("sha256").update(buf).digest("hex")}`;
}



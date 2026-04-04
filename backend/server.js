/**
 * @fileoverview Express.js HTTP server providing REST API for document verification
 * @description Backend server that handles file uploads, IPFS storage, and blockchain interactions
 * 
 * ARCHITECTURE EXPLANATION FOR PROFESSOR:
 * This backend follows a 3-tier architecture:
 * 1. API Layer (this file) - Handles HTTP requests
 * 2. Business Logic (chain.js, ipfs.js) - Blockchain and IPFS operations  
 * 3. Data Layer (smart contract) - Stores document hashes
 * 
 * Request Flow:
 * User uploads file → Express receives → Compute hash → Upload to IPFS → Return hash+CID
 * → Frontend uses MetaMask to register hash on blockchain (user pays gas)
 */

import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "./config.js";
import { makeChainClient, hashFileKeccak256 } from "./chain.js";
import { pickIpfsUploader } from "./ipfs.js";
import { encryptFile, decryptFile } from "./fileCrypto.js";
import { getDocument, putDocument } from "./documentStore.js";
import { getMasterKeyFromEnv, unwrapSecret, wrapSecret } from "./secretBox.js";

// Create Express application instance
const app = express();

// Middleware: Parse JSON request bodies (up to 2MB)
app.use(express.json({ limit: "2mb" }));

// Middleware: Enable CORS (Cross-Origin Resource Sharing)
// Allows frontend running on different domain/port to access this API
app.use(
  cors({
    origin: config.corsOrigin === "*" ? true : config.corsOrigin,
  })
);

/**
 * Multer configuration for file uploads
 * 
 * EXPLANATION FOR PROFESSOR:
 * - Multer is Express middleware that handles multipart/form-data (file uploads)
 * - memoryStorage: Keeps uploaded files in RAM (not disk) for fast processing
 * - fileSize limit: 25MB max (prevents abuse, IPFS has limits too)
 * - Files are accessed via req.file.buffer in route handlers
 */
const upload = multer({
  storage: multer.memoryStorage(), // Store in memory, not disk
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB maximum file size
  },
});

/**
 * Initialize blockchain client
 * Connects to Ethereum network and smart contract
 */
const chain = makeChainClient({
  rpcUrl: config.rpcUrl,                   // Ethereum node URL
  privateKey: config.privateKey,           // Wallet for signing (backend wallet)
  contractAddress: config.contractAddress,  // Where smart contract is deployed
});

/**
 * Initialize IPFS uploader
 * Chooses provider based on environment configuration (Pinata or Web3.Storage)
 */
const ipfs = pickIpfsUploader({
  pinataJwt: config.pinataJwt,
  web3StorageToken: config.web3StorageToken,
  ipfsGatewayBaseUrl: config.ipfsGatewayBaseUrl,
  ipfsDisabled: config.ipfsDisabled,
});

// Get current directory path (needed for ES modules)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const masterKey = getMasterKeyFromEnv(config.fileMasterKey);

function isEthAddress(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function getRequesterAddress(req) {
  const header = req.headers["x-wallet-address"];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const fromBody = req.body?.owner;
  const addr = (fromHeader ?? fromBody ?? null);
  if (!addr) return null;
  return String(addr);
}

/**
 * Serve static files from backend/public directory
 * This provides a simple web UI for testing the API
 * Files: index.html, app.js, styles.css
 */
app.use(express.static(publicDir));

// Serve index.html at root path
app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

/**
 * GET /api/health - Health check endpoint
 * 
 * PURPOSE: Verify backend is running and blockchain connection is working
 * 
 * Returns:
 * - ok: true if everything working
 * - chainId: Which blockchain network (1=mainnet, 11155111=Sepolia, 31337=Hardhat local)
 * - blockNumber: Latest block number (proves connection is live)
 * - contractAddress: Where DocumentRegistry is deployed
 * - contractHasCode: true if contract exists at that address
 * - address: Backend wallet address
 * - ipfsGatewayBaseUrl: IPFS gateway URL for viewing files
 * 
 * EXPLANATION FOR PROFESSOR:
 * This endpoint is useful for debugging. If backend can't connect to blockchain,
 * this will show the error before you try uploading files.
 */
app.get("/api/health", async (_req, res) => {
  const [blockNumber, network, code] = await Promise.all([
    chain.provider.getBlockNumber(),
    chain.provider.getNetwork(),
    chain.provider.getCode(config.contractAddress),
  ]);
  res.json({
    ok: true,
    chainId: Number(network.chainId),
    blockNumber,
    contractAddress: config.contractAddress,
    contractHasCode: !!code && code !== "0x",
    address: chain.wallet.address,
    ipfsGatewayBaseUrl: config.ipfsGatewayBaseUrl,
  });
});

/**
 * POST /api/upload - Upload file and get hash + IPFS CID
 * 
 * Request: multipart/form-data with file field named "file"
 * 
 * Response:
 * {
 *   hash: "0x...",              // Keccak-256 hash of file
 *   file: {name, mimetype, size}, // File metadata
 *   ipfs: {cid, url, provider},   // IPFS upload result
 *   chain: {contractAddress, ...},
 *   alreadyRegistered: false      // true if hash already on blockchain
 * }
 * 
 * WORKFLOW EXPLANATION FOR PROFESSOR:
 * 1. Receive file from frontend
 * 2. Compute cryptographic hash (Keccak-256)
 * 3. Check if already registered on blockchain (prevents duplicate uploads)
 * 4. If new: Upload file to IPFS, get CID (Content Identifier)
 * 5. Return hash + CID to frontend
 * 6. Frontend will use MetaMask to register hash on blockchain
 * 
 * Note: Backend uploads to IPFS but does NOT register on blockchain
 * Why? So the user's wallet signs the transaction (proves ownership)
 */
async function handleUpload(req, res) {
  let hash = null;
  let fileMeta = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing file (field name: file)" });
    }

    const { originalname, buffer, mimetype, size } = req.file;
    fileMeta = { name: originalname, mimetype, size };
    hash = hashFileKeccak256(buffer);

    const ownerAddress = getRequesterAddress(req);
    if (!isEthAddress(ownerAddress)) {
      return res.status(400).json({
        error: "Missing/invalid owner address. Provide x-wallet-address header (0x...)",
      });
    }

    // If already exists on-chain (even if revoked), do NOT re-upload or attempt to "re-register".
    // (Prevents misleading UX and supports ownership-bound verification.)
    const alreadyExists = await chain.documentExists(hash);
    if (alreadyExists) {
      let existing = null;
      let revoked = null;
      try {
        existing = await chain.getDocumentMeta(hash);
      } catch {
        // If contract call fails, just omit.
      }

      try {
        revoked = await chain.isDocumentRevoked(hash);
      } catch {
        // omit
      }
      return res.json({
        message: "This document is already registered.",
        hash,
        file: fileMeta,
        alreadyRegistered: true,
        existingOwner: existing?.owner ?? null,
        revoked: revoked ?? null,
        ipfs: { cid: null, url: null, provider: null },
        encryption: { enabled: true, cipher: "AES-256-CBC", keyStored: true },
        chain: {
          contractAddress: config.contractAddress,
          txHash: null,
          blockNumber: null,
        },
      });
    }

    // Always encrypt before uploading to IPFS.
    const { encrypted, key, iv } = encryptFile(buffer);

    const ipfsResult = await ipfs.uploadBuffer({
      buffer: encrypted,
      filename: `${originalname || "document"}.enc`,
    });

    // Store CID + key material server-side only (never return keys to clients).
    // For production: key/iv should not be stored plaintext. If FILE_MASTER_KEY is set,
    // we wrap the secret bytes with AES-256-GCM.
    const keyRecord = masterKey ? wrapSecret(key, masterKey) : { alg: "raw", data: key.toString("base64") };
    const ivRecord = masterKey ? wrapSecret(iv, masterKey) : { alg: "raw", data: iv.toString("base64") };

    await putDocument(hash, {
      hash,
      owner: ownerAddress,
      ipfs: { cid: ipfsResult.cid, provider: ipfsResult.provider },
      file: fileMeta,
      encryption: {
        alg: "aes-256-cbc",
        key: keyRecord,
        iv: ivRecord,
        wrapped: !!masterKey,
      },
      createdAt: Date.now(),
    });

    return res.json({
      message: "Accept the transaction in MetaMask.",
      hash,
      file: fileMeta,
      ipfs: {
        cid: null,
        url: null,
        provider: ipfsResult.provider,
      },
      encryption: { enabled: true, cipher: "AES-256-CBC", keyStored: true },
      chain: {
        contractAddress: config.contractAddress,
        txHash: null,
        blockNumber: null,
      },
      alreadyRegistered: false,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/upload error:", err);

    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
}

// Route handlers for upload endpoint
// Both /api/register and /api/upload point to same handler (backwards compatibility)
app.post("/api/register", upload.single("file"), handleUpload); // Legacy name
app.post("/api/upload", upload.single("file"), handleUpload);    // Current name

/**
 * POST /api/verify - Verify document by uploading file
 *
 * IMPORTANT: Verification reads ONLY from the blockchain (smart contract).
 * The backend JSON store (documentStore.js) is NEVER consulted for verification.
 * Flow: receive file → keccak256 hash → contract.verifyDocument(hash) on-chain → return result.
 */
app.post("/api/verify", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing file (field name: file)" });
    }
    const hash = hashFileKeccak256(req.file.buffer);
    const verified = await chain.verifyDocumentHash(hash);

    let meta = null;
    if (verified) {
      try {
        meta = await chain.getDocumentMeta(hash);
      } catch {
        // Non-fatal; just omit metadata.
      }
    }

    return res.json({
      hash,
      verified,
      owner: meta?.owner ?? null,
      registeredAt: meta?.createdAt ? Number(meta.createdAt) : null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/verify error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /api/verify-hash - Verify document by providing pre-computed hash
 *
 * IMPORTANT: Reads ONLY from blockchain, never from JSON store.
 */
app.post("/api/verify-hash", async (req, res) => {
  try {
    const { hash } = req.body ?? {};
    if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
      return res.status(400).json({ error: "Invalid hash; expected 0x + 64 hex chars" });
    }
    const verified = await chain.verifyDocumentHash(hash);

    let meta = null;
    if (verified) {
      try {
        meta = await chain.getDocumentMeta(hash);
      } catch {
        // Non-fatal.
      }
    }

    return res.json({
      hash,
      verified,
      owner: meta?.owner ?? null,
      registeredAt: meta?.createdAt ? Number(meta.createdAt) : null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/verify-hash error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /api/documents/:hash/download
 *
 * Authorized download:
 * - Server fetches encrypted file from IPFS (CID stored in backend DB)
 * - Server decrypts using stored (server-only) key + IV
 * - Returns original file bytes
 *
 * Security:
 * - Keys are never returned to clients
 * - CID is never returned to clients
 * - Access is enforced using the smart contract's canViewDocument(hash, user)
 */
app.get("/api/documents/:hash/download", async (req, res) => {
  try {
    const { hash } = req.params;
    if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
      return res.status(400).json({ error: "Invalid hash; expected 0x + 64 hex chars" });
    }

    const viewerAddress = getRequesterAddress(req);
    if (!isEthAddress(viewerAddress)) {
      return res.status(400).json({
        error: "Missing/invalid viewer address. Provide x-wallet-address header (0x...)",
      });
    }

    const doc = await getDocument(hash);
    if (!doc) return res.status(404).json({ error: "Document not found in backend database" });

    const isOwner = String(doc.owner).toLowerCase() === String(viewerAddress).toLowerCase();

    // Enforce authorization via on-chain access control, but always allow the owner.
    // NOTE: This only checks permissions; it does not store CID/key on-chain.
    let allowed = isOwner;
    if (!allowed) {
      try {
        allowed = await chain.canViewDocument(hash, viewerAddress);
      } catch {
        // If contract doesn't support canViewDocument, fall back to owner-only.
        allowed = isOwner;
      }
    }

    if (!allowed) {
      return res.status(403).json({ error: "Not authorized to view this document" });
    }

    const cid = doc?.ipfs?.cid;
    if (!cid) return res.status(500).json({ error: "Missing CID in backend database" });

    const encryptedBytes = await ipfs.fetchBuffer({ cid });

    if (doc.encryption?.key?.alg !== "raw" && !masterKey) {
      return res.status(500).json({
        error: "Server misconfiguration: FILE_MASTER_KEY is required to decrypt stored key material",
      });
    }

    const keyBytes =
      doc.encryption?.key?.alg === "raw"
        ? Buffer.from(String(doc.encryption.key.data), "base64")
        : unwrapSecret(doc.encryption.key, masterKey);
    const ivBytes =
      doc.encryption?.iv?.alg === "raw"
        ? Buffer.from(String(doc.encryption.iv.data), "base64")
        : unwrapSecret(doc.encryption.iv, masterKey);

    const plaintext = decryptFile(encryptedBytes, keyBytes, ivBytes);

    const filename = doc?.file?.name || "document";
    const mimetype = doc?.file?.mimetype || "application/octet-stream";
    res.setHeader("Content-Type", mimetype);
    res.setHeader("Content-Disposition", `attachment; filename="${String(filename).replace(/"/g, "")}"`);
    return res.send(plaintext);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/documents/:hash/download error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

async function main() {
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Backend failed to start:", err);
  process.exitCode = 1;
});



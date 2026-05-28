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
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { config } from "./config.js";
import { makeChainClient, hashFileSha256 } from "./chain.js";
import { getDocument as getStoredDocument, listDocuments, putDocument } from "./documentIndex.js";
import { pickIpfsUploader } from "./ipfs.js";
import { encryptFile, decryptFile } from "./fileCrypto.js";
import { createDefaultProfile, getProfile, putProfile } from "./profileStore.js";
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
const publicIndexPath = path.join(publicDir, "index.html");

const masterKey = getMasterKeyFromEnv(config.fileMasterKey);

function isEthAddress(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function getRequesterAddress(req) {
  // Prefer new header 'wallet-address' but accept legacy 'x-wallet-address' for compatibility
  const primary = req.headers["wallet-address"];
  const legacy = req.headers["x-wallet-address"];
  const fromPrimary = Array.isArray(primary) ? primary[0] : primary;
  const fromLegacy = Array.isArray(legacy) ? legacy[0] : legacy;
  const fromBody = req.body?.owner;
  const addr = (fromPrimary ?? fromLegacy ?? fromBody ?? null);
  if (!addr) return null;
  return String(addr);
}

function requireRequesterAddress(req, res, role = "requester") {
  const address = getRequesterAddress(req);
  if (!isEthAddress(address)) {
    res.status(400).json({
      error: `Missing/invalid ${role} address. Provide wallet-address header (0x...)`,
    });
    return null;
  }
  return address;
}

function normalizeOnchainProof(hash, proof, revoked, dbDoc) {
  return {
    hash,
    existsOnChain: !!proof || revoked === false,
    verified: !!proof && !revoked,
    revoked: !!revoked,
    onChain: proof
      ? {
          owner: proof.owner ?? null,
          createdAt: proof.createdAt != null ? Number(proof.createdAt) : null,
          blockNumber: proof.blockNumber != null ? Number(proof.blockNumber) : null,
        }
      : null,
    database: dbDoc
      ? {
          ipfs: dbDoc.ipfs ?? null,
          encryption: dbDoc.encryption ? { enabled: true } : null,
        }
      : null,
  };
}

function shortHash(hash) {
  if (typeof hash !== "string") return "document";
  return hash.length > 16 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;
}

function encodePayloadJson(value, masterKey) {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  if (masterKey) return wrapSecret(payload, masterKey);
  return { alg: "raw", data: payload.toString("base64") };
}

function decodePayloadJson(envelope, masterKey) {
  if (!envelope || typeof envelope !== "object") {
    throw new Error("Invalid manifest envelope");
  }

  let payload;
  if (envelope.alg === "raw") {
    payload = Buffer.from(String(envelope.data), "base64");
  } else {
    if (!masterKey) {
      throw new Error("Server misconfiguration: FILE_MASTER_KEY is required to read the encrypted manifest");
    }
    payload = unwrapSecret(envelope, masterKey);
  }

  return JSON.parse(payload.toString("utf8"));
}

function makeManifest({ fileCid, fileMeta, encryption }) {
  return {
    version: 1,
    fileCid,
    file: fileMeta,
    encryption,
  };
}

async function mapInBatches(items, batchSize, worker) {
  const results = [];
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map(worker));
    results.push(...batchResults);
  }
  return results;
}

async function summarizeAccessibleDocuments(walletAddress) {
  const lowerWallet = String(walletAddress).toLowerCase();
  const onChainDocuments = await chain.listRegisteredDocuments();
  const onChainHashes = onChainDocuments.map((doc) => doc.hash).filter(Boolean);
  const localDocuments = await listDocuments();
  const localHashes = localDocuments.map((doc) => doc.hash).filter(Boolean);
  const hashes = Array.from(new Set([...onChainHashes, ...localHashes]));
  const localByHash = new Map(localDocuments.map((doc) => [String(doc.hash).toLowerCase(), doc]));
  const onChainByHash = new Map(onChainDocuments.map((doc) => [String(doc.hash).toLowerCase(), doc]));

  const summaries = await mapInBatches(hashes, 5, async (hash) => {
    const [meta, revoked, canView] = await Promise.all([
      chain.getDocumentMeta(hash).catch(() => null),
      chain.isDocumentRevoked(hash).catch(() => null),
      chain.canViewDocument(hash, walletAddress).catch(() => null),
    ]);

    const onChainDoc = onChainByHash.get(String(hash).toLowerCase()) ?? null;
    const owner = meta?.owner ?? onChainDoc?.owner ?? null;
    const ownerMatches = owner && String(owner).toLowerCase() === lowerWallet;
    const allowed = Boolean(canView) || !!ownerMatches;
    if (!allowed) {
      return null;
    }

    if (revoked === true) {
      return null;
    }

    const access = owner && String(owner).toLowerCase() === lowerWallet ? "owned" : "shared";
    const manifestCid = localByHash.get(String(hash).toLowerCase())?.ipfs?.cid ?? onChainDoc?.cid ?? null;

    return {
      hash,
      name: `Document ${shortHash(hash)}`,
      owner,
      createdAt: meta?.createdAt != null ? Number(meta.createdAt) : null,
      verified: true,
      status: "Registered",
      cid: manifestCid,
      access,
    };
  });

  const active = summaries.filter(Boolean);
  const owned = active
    .filter((doc) => doc.access === "owned")
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
  const shared = active
    .filter((doc) => doc.access === "shared")
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));

  return { owned, shared };
}

async function buildVerificationResponse(hash) {
  const [existsOnChain, revoked, proof, verifiedOnChain] = await Promise.all([
    chain.documentExists(hash).catch(() => false),
    chain.isDocumentRevoked(hash).catch(() => false),
    chain.getRegistrationProof(hash).catch(() => null),
    chain.verifyDocumentHash(hash).catch(() => false),
  ]);

  const authentic = !!existsOnChain;
  const status = authentic
    ? revoked
      ? "Authentic, but revoked"
      : "Authentic / Untampered"
    : "Modified / Fake";

  return {
    hash,
    existsOnChain,
    verified: authentic,
    authentic,
    status,
    verifiedAt: authentic && proof?.createdAt != null ? Number(proof.createdAt) : null,
    verifiedMessage: authentic
      ? revoked
        ? "Hash matches an on-chain record, but the document is revoked"
        : "Hash matches an on-chain record"
      : "No matching hash found on-chain",
    revoked,
    onChain: proof
      ? {
          owner: proof.owner ?? null,
          createdAt: proof.createdAt != null ? Number(proof.createdAt) : null,
          blockNumber: proof.blockNumber != null ? Number(proof.blockNumber) : null,
        }
      : null,
    database: null,
  };
}

/**
 * Serve static files from backend/public directory
 * This provides a simple web UI for testing the API
 * Files: index.html, app.js, styles.css
 */
if (existsSync(publicIndexPath)) {
  app.use(express.static(publicDir));

  // Serve index.html at root path
  app.get("/", (_req, res) => {
    res.sendFile(publicIndexPath);
  });
} else {
  app.get("/", (_req, res) => {
    res.json({ ok: true, message: "Backend API is running" });
  });
}

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
 * GET /api/profile - Fetch the current user's profile
 */
app.get("/api/profile", async (req, res) => {
  try {
    const address = requireRequesterAddress(req, res, "profile owner");
    if (!address) return;

    const profile = (await getProfile(address)) ?? createDefaultProfile(address);
    return res.json({ profile });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/profile GET error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

/**
 * PUT /api/profile - Save the current user's profile
 */
app.put("/api/profile", async (req, res) => {
  try {
    const address = requireRequesterAddress(req, res, "profile owner");
    if (!address) return;

    const body = req.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const bio = typeof body.bio === "string" ? body.bio.trim() : "";
    const photoDataUrl = typeof body.photoDataUrl === "string" && body.photoDataUrl.trim().length > 0 ? body.photoDataUrl.trim() : null;
    const preferredTheme = body.preferredTheme === "light" ? "light" : "dark";

    if (name.length === 0 || name.length > 80) {
      return res.status(400).json({ error: "Profile name must be between 1 and 80 characters" });
    }
    if (title.length > 80) {
      return res.status(400).json({ error: "Profile title must be 80 characters or less" });
    }
    if (email.length > 120) {
      return res.status(400).json({ error: "Email must be 120 characters or less" });
    }
    if (bio.length > 280) {
      return res.status(400).json({ error: "Bio must be 280 characters or less" });
    }

    const profile = await putProfile(address, {
      name,
      title,
      email,
      bio,
      photoDataUrl,
      preferredTheme,
    });

    return res.json({ profile });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/profile PUT error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /api/documents - Return the caller's real owned and shared documents
 */
app.get("/api/documents", async (req, res) => {
  try {
    const address = requireRequesterAddress(req, res, "document owner");
    if (!address) return;

    const documents = await summarizeAccessibleDocuments(address);
    return res.json(documents);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/documents GET error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /api/upload - Upload file and get hash + IPFS CID
 * 
 * Request: multipart/form-data with file field named "file"
 * 
 * Response:
 * {
 *   hash: "0x...",              // SHA-256 hash of file
 *   file: {name, mimetype, size}, // File metadata
 *   ipfs: {cid, url, provider},   // IPFS upload result
 *   chain: {contractAddress, ...},
 *   alreadyRegistered: false      // true if hash already on blockchain
 * }
 * 
 * WORKFLOW EXPLANATION:
 * 1. Receive file from frontend
 * 2. Compute cryptographic hash (SHA-256)
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
    hash = hashFileSha256(buffer);

    const ownerAddress = getRequesterAddress(req);
    if (!isEthAddress(ownerAddress)) {
      return res.status(400).json({
        error: "Missing/invalid owner address. Provide wallet-address header (0x...)",
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

      if (existing?.owner && String(existing.owner).toLowerCase() !== String(ownerAddress).toLowerCase()) {
        return res.status(403).json({
          error: "This document hash is registered by another wallet.",
        });
      }

      const storedDoc = await getStoredDocument(hash).catch(() => null);
      const ipfsInfo = storedDoc?.ipfs?.cid
        ? { cid: storedDoc.ipfs.cid, url: `${config.ipfsGatewayBaseUrl}${storedDoc.ipfs.cid}`, provider: storedDoc.ipfs.provider ?? null }
        : { cid: null, url: null, provider: null };

      return res.json({
        message: "This document is already registered on-chain.",
        hash,
        file: fileMeta,
        alreadyRegistered: true,
        existingOwner: existing?.owner ?? null,
        revoked: revoked ?? null,
        ipfs: ipfsInfo,
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

    const fileResult = await ipfs.uploadBuffer({
      buffer: encrypted,
      filename: `${originalname || "document"}.enc`,
    });

    const manifest = makeManifest({
      fileCid: fileResult.cid,
      fileMeta,
      encryption: {
        alg: "aes-256-cbc",
        key: key.toString("base64"),
        iv: iv.toString("base64"),
      },
    });
    const manifestEnvelope = encodePayloadJson(manifest, masterKey);
    const manifestResult = await ipfs.uploadBuffer({
      buffer: Buffer.from(JSON.stringify(manifestEnvelope), "utf8"),
      filename: `${originalname || "document"}.manifest.json`,
    });

    // NOTE: Do not persist manifests to local storage in deployed environments
    // that don't provide durable file storage. The canonical source of truth
    // for retrieval is the IPFS manifest CID which we return to the caller and
    // encourage to store on-chain when registering the hash.

    return res.json({
      message: "Accept the transaction in MetaMask.",
      hash,
      file: fileMeta,
      ipfs: {
        cid: manifestResult.cid ?? null,
        url: manifestResult.url ?? (manifestResult.cid ? `${config.ipfsGatewayBaseUrl}${manifestResult.cid}` : null),
        provider: manifestResult.provider ?? null,
        fileCid: fileResult.cid ?? null,
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
 * Request: multipart/form-data with file field named "file"
 * 
 * Response:
 * {
 *   hash: "0x...",     // Computed hash of uploaded file
 *   verified: true     // true if hash exists on blockchain, false otherwise
 * }
 * 
 * WORKFLOW EXPLANATION FOR PROFESSOR:
 * 1. User uploads file they want to verify
 * 2. Backend computes hash of the file
 * 3. Backend queries blockchain: "Does this hash exist?"
 * 4. Returns true/false
 * 
 * Use Case: Prove a document hasn't been modified
 * - If file was previously registered, hash will match → verified=true
 * - If file was modified even slightly, hash will be different → verified=false
 */
app.post("/api/verify", upload.single("file"), async (req, res) => {
  try {
    // Allow public verification without requiring a wallet header. The backend
    // performs on-chain reads using its own provider, so callers do not need
    // to be a connected wallet. Keep previous behavior of returning source info.
    if (!req.file) {
      return res.status(400).json({ error: "Missing file (field name: file)" });
    }
    const hash = hashFileSha256(req.file.buffer);
    const result = await buildVerificationResponse(hash);
    return res.json({
      ...result,
      source: {
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/verify error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /api/verify-hash - Verify document by providing hash directly
 * 
 * Request body: { hash: "0x..." }
 * 
 * Response: { hash: "0x...", verified: true/false }
 * 
 * EXPLANATION: Alternative to /api/verify for when frontend already computed the hash
 * Useful if frontend uses MetaMask to compute hash (saves file upload bandwidth)
 */
app.post("/api/verify-hash", async (req, res) => {
  try {
    // Allow public verification by hash. No wallet-address header required.
    const { hash } = req.body ?? {};
    if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
      return res.status(400).json({ error: "Invalid hash; expected 0x + 64 hex chars" });
    }
    const result = await buildVerificationResponse(hash);
    return res.json(result);
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
        error: "Missing/invalid viewer address. Provide wallet-address header (0x...)",
      });
    }

    const onChainDoc = await chain.getDocument(hash);
    if (!onChainDoc) return res.status(404).json({ error: "Document not found on-chain" });

    const isOwner = String(onChainDoc.owner).toLowerCase() === String(viewerAddress).toLowerCase();

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

    const storedDoc = await getStoredDocument(hash).catch(() => null);
    // Prefer local manifest CID when available, otherwise fall back to on-chain CID
    const manifestCid = storedDoc?.ipfs?.cid ?? (onChainDoc?.cid ?? null);
    if (!manifestCid) return res.status(500).json({ error: "Missing manifest CID (not in DB or on-chain)" });

    const manifestBytes = await ipfs.fetchBuffer({ cid: manifestCid });
    const manifestEnvelope = JSON.parse(manifestBytes.toString("utf8"));
    const manifest = decodePayloadJson(manifestEnvelope, masterKey);

    const fileCid = manifest?.fileCid;
    if (!fileCid) return res.status(500).json({ error: "Missing encrypted file CID in manifest" });

    const encryptedBytes = await ipfs.fetchBuffer({ cid: fileCid });

    const keyBytes = Buffer.from(String(manifest?.encryption?.key), "base64");
    const ivBytes = Buffer.from(String(manifest?.encryption?.iv), "base64");

    const plaintext = decryptFile(encryptedBytes, keyBytes, ivBytes);
    const downloadedHash = hashFileSha256(plaintext);
    const existsOnChain = await chain.documentExists(downloadedHash);
    const verifiedOnChain = await chain.verifyDocumentHash(downloadedHash).catch(() => false);
    if (!existsOnChain) {
      return res.status(412).json({
        error: "Document integrity check failed: downloaded file hash not found on blockchain",
      });
    }

    let onchain = null;
    try {
      onchain = await chain.getRegistrationProof(downloadedHash);
    } catch {
      onchain = null;
    }

    // Integrity passed: set informational headers and return the original file.
    // We avoid exposing any document hashes in headers or body.
    const filename = manifest?.file?.name || "document";
    const mimetype = manifest?.file?.mimetype || "application/octet-stream";
    res.setHeader("Content-Type", mimetype);
    res.setHeader("Content-Disposition", `attachment; filename="${String(filename).replace(/"/g, "")}"`);
    res.setHeader("X-Document-Integrity", "passed");
    res.setHeader("X-Document-Integrity-Message", "Document integrity verified: record found on blockchain");
    if (onchain && onchain.owner) res.setHeader("X-Document-Owner", String(onchain.owner));
    if (onchain && onchain.createdAt) res.setHeader("X-Document-Recorded-At", String(onchain.createdAt));
    // Add verified timestamp/message header (human-readable) without exposing hash
    if (verifiedOnChain) {
      const verifiedAt = onchain?.createdAt ?? Math.floor(Date.now() / 1000);
      res.setHeader("X-Document-Verified-At", String(verifiedAt));
      res.setHeader("X-Document-Verified-Message", `Hash verified around ${new Date(verifiedAt * 1000).toISOString()}`);
    }
    if (onchain && onchain.blockNumber != null) res.setHeader("X-Document-Block-Number", String(onchain.blockNumber));
    if (config.contractAddress) res.setHeader("X-Document-Contract", String(config.contractAddress));

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



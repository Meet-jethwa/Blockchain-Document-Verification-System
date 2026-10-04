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
import { ethers } from "ethers";

import { config } from "./config.js";
import { makeChainClient, RevocationLookupError } from "./chain.js";
import { getDocument as getStoredDocument, listDocuments, putDocument, deleteDocument as deleteStoredDocument } from "./documentIndex.js";
import { listSharedDocuments as listSharedStoreDocuments, listSharedDocumentsEnriched, putSharedDocument, deleteSharedDocument, deleteSharedDocumentForViewer } from "./sharedStore.js";
import { pickIpfsUploader } from "./ipfs.js";
// fileCrypto.js and secretBox.js are used ONLY as backward-compatibility fallbacks
// for legacy documents uploaded under older prototype versions.
// The primary BDVS upload/download path remains strictly content-blind.
import { getMasterKeyFromEnv, unwrapSecret } from "./secretBox.js";
import { decryptFile } from "./fileCrypto.js";
import { createDefaultProfile, getProfile, putProfile } from "./profileStore.js";

const masterKey = getMasterKeyFromEnv(config.fileMasterKey);

// Create Express application instance
const app = express();

// Middleware: Parse JSON request bodies (up to 2MB)
app.use(express.json({ limit: "2mb" }));

// Middleware: Enable CORS (Cross-Origin Resource Sharing)
// Allows frontend running on different domain/port to access this API
app.use(
  cors({
    origin: config.corsOrigin === "*" ? true : config.corsOrigin,
    // Expose custom headers so the browser can read them from fetch responses.
    // Without this, response.headers.get("x-original-filename") returns null.
    exposedHeaders: [
      "Content-Disposition",
      "X-Original-Filename",
      "X-Original-Mimetype",
      "X-Encryption-Alg",
      "X-Encryption-Mode",
      "X-Document-Integrity",
      "X-Document-Integrity-Message",
      "X-Document-Owner",
      "X-Document-Recorded-At",
      "X-Document-Contract",
    ],
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

// masterKey removed: server is a content-blind relay and never holds key material.


function isEthAddress(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * AUTH HELPER: Extract and EIP-191-verify the three signed headers.
 *
 * Headers (sent by frontend/src/clientCrypto.ts signAuthHeaders()):
 *   x-wallet-address   – the signer's Ethereum address
 *   x-wallet-signature – ethers.Signer.signMessage(challenge) where
 *                        challenge = 'BDVS Authentication: <address>:<timestamp>'
 *   x-wallet-timestamp – Unix ms timestamp (Number) encoded as a string
 *
 * Rules (matching paper §IV-A):
 *   1. All three headers must be present.
 *   2. Timestamp must be within ±10 minutes of server clock (replay window).
 *   3. Recovered signer must equal x-wallet-address (case-insensitive).
 *
 * Returns the verified, normalised Ethereum address on success, or sends an
 * HTTP 401/400 response and returns null on failure.
 */
/**
 * AUTH_DOMAIN provides domain-separation so a signed challenge from one BDVS
 * deployment (chain + contract) cannot be replayed against a different one.
 *
 * Challenge format (§IV-A, revised):
 *   "BDVS Authentication v2: <chainId>:<contractAddress>:<address>:<nonce>"
 *
 * chainId and contractAddress are resolved once at startup via /api/health
 * and embedded into every server-issued nonce token so the frontend can
 * reconstruct the same string without an extra RPC call.
 *
 * Nonce lifecycle:
 *   1. Client calls GET /api/auth/nonce?address=<addr> → receives { nonce, chainId, contractAddress, expiresAt }
 *   2. Client signs the full challenge string with personal_sign (EIP-191)
 *   3. Client includes x-wallet-nonce in authenticated requests
 *   4. Server verifies signature, then DELETES the nonce (one-time use)
 *   5. Nonces expire after NONCE_TTL_MS even if unused
 */
const AUTH_PROMPT    = "BDVS Authentication v2: ";
const NONCE_TTL_MS   = 5 * 60 * 1000; // 5 minutes — short enough to limit replay window

// In-memory nonce store: Map<nonce, { address, chainId, contractAddress, expiresAt }>
// For multi-instance deployments, replace with a shared Redis/Mongo TTL store.
const _nonceStore = new Map();

/** Prune expired nonces (called lazily on each verification to avoid a timer). */
function _pruneNonces() {
  const now = Date.now();
  for (const [key, val] of _nonceStore) {
    if (val.expiresAt < now) _nonceStore.delete(key);
  }
}

// Lazily resolved at first request (avoids blocking startup with an RPC call).
let _authDomain = null;
async function getAuthDomain() {
  if (_authDomain) return _authDomain;
  try {
    const network = await chain.provider.getNetwork();
    _authDomain = {
      chainId:         String(Number(network.chainId)),
      contractAddress: config.contractAddress.toLowerCase(),
    };
  } catch {
    // Fallback: use a static domain from config so auth still works offline.
    _authDomain = {
      chainId:         "unknown",
      contractAddress: (config.contractAddress ?? "0x0").toLowerCase(),
    };
  }
  return _authDomain;
}

function verifyAuthHeaders(req, res) {
  const rawAddr  = req.headers["x-wallet-address"];
  const rawSig   = req.headers["x-wallet-signature"];
  const rawNonce = req.headers["x-wallet-nonce"];

  // Legacy clients that only send x-wallet-timestamp are still accepted for a
  // transitional period — but they get a weaker (timestamp-only) guarantee.
  // Remove the legacy branch once all clients are updated.
  const rawTs = req.headers["x-wallet-timestamp"];

  if (!rawAddr || !rawSig) {
    res.status(401).json({
      error:
        "Missing authentication headers. " +
        "Provide x-wallet-address, x-wallet-signature, and either x-wallet-nonce (preferred) or x-wallet-timestamp.",
    });
    return null;
  }

  const address   = String(rawAddr).trim();
  const signature = String(rawSig).trim();

  if (!isEthAddress(address)) {
    res.status(400).json({ error: "Invalid x-wallet-address (expected 0x + 40 hex)" });
    return null;
  }

  _pruneNonces();

  // ── Nonce-based path (preferred, domain-bound, one-time-use) ──────────────
  if (rawNonce) {
    const nonce = String(rawNonce).trim();
    const entry = _nonceStore.get(nonce);

    if (!entry) {
      res.status(401).json({
        error: "Unknown or already-consumed nonce. Call GET /api/auth/nonce to obtain a fresh one.",
      });
      return null;
    }
    if (entry.address.toLowerCase() !== address.toLowerCase()) {
      res.status(401).json({ error: "Nonce was issued for a different wallet address." });
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      _nonceStore.delete(nonce);
      res.status(401).json({ error: "Nonce expired. Call GET /api/auth/nonce to obtain a fresh one." });
      return null;
    }

    // Build the domain-bound challenge the client should have signed:
    //   "BDVS Authentication v2: <chainId>:<contractAddress>:<address>:<nonce>"
    const challenge = `${AUTH_PROMPT}${entry.chainId}:${entry.contractAddress}:${address.toLowerCase()}:${nonce}`;
    let recovered;
    try {
      recovered = ethers.verifyMessage(challenge, signature);
    } catch {
      res.status(401).json({ error: "Malformed signature" });
      return null;
    }
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      res.status(401).json({
        error: "Signature does not match x-wallet-address. Identity spoofing rejected.",
      });
      return null;
    }

    // Consume the nonce — one-time use.
    _nonceStore.delete(nonce);
    return address.toLowerCase();
  }

  // ── Legacy timestamp-based path (transitional, no domain binding) ─────────
  // TODO: Remove once all clients send x-wallet-nonce.
  if (!rawTs) {
    res.status(401).json({
      error:
        "Missing x-wallet-nonce. Obtain a nonce from GET /api/auth/nonce and include it as x-wallet-nonce.",
    });
    return null;
  }

  const timestamp = Number(String(rawTs).trim());
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    res.status(400).json({ error: "Invalid x-wallet-timestamp" });
    return null;
  }

  const REPLAY_WINDOW_MS = 5 * 60 * 1000; // tightened from 10 min to 5 min
  const drift = Math.abs(Date.now() - timestamp);
  if (drift > REPLAY_WINDOW_MS) {
    res.status(401).json({
      error: `Stale authentication token (drift ${Math.round(drift / 1000)}s). Re-sign and retry.`,
    });
    return null;
  }

  const challenge = `BDVS Authentication: ${address.toLowerCase()}:${timestamp}`;
  let recovered;
  try {
    recovered = ethers.verifyMessage(challenge, signature);
  } catch {
    res.status(401).json({ error: "Malformed signature" });
    return null;
  }
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    res.status(401).json({
      error: "Signature does not match x-wallet-address. Identity spoofing rejected.",
    });
    return null;
  }
  return address.toLowerCase();
}

/**
 * Lightweight helper: read a wallet address from the request for PUBLIC
 * (unauthenticated) read-only endpoints like /api/health or /api/verify-hash.
 * Does NOT verify any signature.
 */
function getRequesterAddress(req) {
  const primary = req.headers["x-wallet-address"] ?? req.headers["wallet-address"];
  const fromBody = req.body?.owner;
  const addr = (Array.isArray(primary) ? primary[0] : primary) ?? fromBody ?? null;
  if (!addr) return null;
  return String(addr).trim();
}

function requireRequesterAddress(req, res, role = "requester") {
  const address = getRequesterAddress(req);
  if (!isEthAddress(address)) {
    res.status(400).json({
      error: `Missing/invalid ${role} address. Provide x-wallet-address header (0x...)`,
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

// encodePayloadJson / decodePayloadJson removed: manifests no longer contain key material
// and are stored as plain JSON. The server is a content-blind relay.

function makeManifest({ fileCid, fileMeta, encryption }) {
  return {
    version: 1,
    fileCid,
    file: fileMeta,
    encryption,
  };
}


function withTimeout(promise, ms, label = "Operation") {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
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
  // Fetch owned hashes and shared hashes separately.
  // Owned docs come from the caller-scoped view; shared docs come from the local share index.
  let ownedDocuments = [];
  let sharedDocuments = [];
  try {
    // eslint-disable-next-line no-console
    console.info('summarizeAccessibleDocuments: fetching getMyDocuments() for caller');
    const myHashes = (await withTimeout(
      chain.contract.getMyDocuments({ from: walletAddress }),
      20000,
      'getMyDocuments'
    )) || [];
    ownedDocuments = myHashes.map((hashValue) => ({ hash: typeof hashValue === 'string' ? hashValue : String(hashValue) }));
    // eslint-disable-next-line no-console
    console.info(`summarizeAccessibleDocuments: getMyDocuments() returned ${ownedDocuments.length} hashes`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('getMyDocuments failed, falling back to listRegisteredDocuments:', err);
    try {
      ownedDocuments = await chain.listRegisteredDocuments();
      // eslint-disable-next-line no-console
      console.info(`summarizeAccessibleDocuments: fallback scan found ${ownedDocuments.length} registered documents`);
    } catch (scanErr) {
      // eslint-disable-next-line no-console
      console.warn('listRegisteredDocuments failed:', scanErr);
      ownedDocuments = [];
    }
  }
  try {
    // eslint-disable-next-line no-console
    console.info(`summarizeAccessibleDocuments: fetching shared documents from local index for ${walletAddress}`);
    sharedDocuments = await listSharedStoreDocuments(walletAddress);
    // eslint-disable-next-line no-console
    console.info(`summarizeAccessibleDocuments: local share index returned ${sharedDocuments.length} hashes`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('shared document index failed:', err);
    sharedDocuments = [];
  }

  const ownedHashes = ownedDocuments.map((doc) => doc.hash).filter(Boolean);
  const sharedHashes = sharedDocuments.map((doc) => doc.hash).filter(Boolean);
  const localDocuments = await listDocuments();
  const localHashes = localDocuments.map((doc) => doc.hash).filter(Boolean);
  const hashes = Array.from(new Set([...ownedHashes, ...sharedHashes, ...localHashes]));
  const localByHash = new Map(localDocuments.map((doc) => [String(doc.hash).toLowerCase(), doc]));
  const ownedByHash = new Map(ownedDocuments.map((doc) => [String(doc.hash).toLowerCase(), doc]));
  const sharedByHash = new Map(sharedDocuments.map((doc) => [String(doc.hash).toLowerCase(), doc]));

  // eslint-disable-next-line no-console
  console.info(`summarizeAccessibleDocuments: hydrating ${hashes.length} hashes (batches of 5)`);
  let summaries;
  try {
    summaries = await mapInBatches(hashes, 5, async (hash) => {
      const [meta, revoked, canView] = await Promise.all([
        chain.getDocumentMeta(hash).catch(() => null),
        // FAIL-CLOSED: if the revocation lookup fails (network error, timeout, ABI
        // mismatch) we treat the document as revoked and deny access.
        // Returning false here would be fail-open and is a security defect.
        chain.isDocumentRevoked(hash).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn(
            `[SECURITY] isDocumentRevoked(${hash}) failed — defaulting to REVOKED (fail-closed):`,
            err?.message ?? String(err)
          );
          return true; // deny access when revocation status is unknowable
        }),
        chain.canViewDocument(hash, walletAddress).catch(() => null),
      ]);

      const normalizedHash = String(hash).toLowerCase();
      const ownedDoc = ownedByHash.get(normalizedHash) ?? null;
      const sharedDoc = sharedByHash.get(normalizedHash) ?? null;
      const localDoc = localByHash.get(normalizedHash) ?? null;
      const owner = meta?.owner ?? ownedDoc?.owner ?? sharedDoc?.owner ?? localDoc?.owner ?? null;
      const ownerMatches = owner && String(owner).toLowerCase() === lowerWallet;
      // Trust local share index even if canViewDocument is unavailable or times out.
      const allowed = Boolean(canView) || !!ownerMatches || Boolean(sharedDoc);
      if (!allowed || revoked === true) {
        return null;
      }

      const access = owner && String(owner).toLowerCase() === lowerWallet ? "owned" : "shared";
      const manifestCid = localDoc?.ipfs?.cid ?? localDoc?.cid ?? ownedDoc?.cid ?? sharedDoc?.cid ?? null;

      return {
        hash,
        name: localDoc?.name || sharedDoc?.name || `Document ${shortHash(hash)}`,
        owner,
        createdAt: meta?.createdAt != null ? Number(meta.createdAt) : null,
        verified: true,
        status: "Registered",
        cid: manifestCid,
        access,
      };
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error while hydrating documents:', err);
    summaries = [];
  }

  const active = summaries.filter(Boolean);
  const owned = active
    .filter((doc) => doc.access === "owned")
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
  const shared = active
    .filter((doc) => doc.access === "shared")
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));

  return { owned, shared };
}

async function summarizeLocalDocuments(walletAddress) {
  const lowerWallet = String(walletAddress).toLowerCase();
  const [localDocuments, sharedDocuments] = await Promise.all([
    listDocuments().catch(() => []),
    listSharedDocumentsEnriched(walletAddress).catch(() => []),
  ]);

  const owned = localDocuments
    .filter((doc) => String(doc?.owner || "").toLowerCase() === lowerWallet)
    .map((doc) => ({
      hash: doc.hash,
      name: doc.name || `Document ${shortHash(doc.hash)}`,
      owner: doc.owner ?? walletAddress,
      createdAt: doc.createdAt != null ? Number(doc.createdAt) : null,
      verified: true,
      status: doc.status || "Registered",
      cid: doc?.ipfs?.cid ?? doc?.cid ?? null,
      access: "owned",
    }))
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));

  const shared = sharedDocuments
    .map((doc) => ({
      hash: doc.hash,
      name: doc.name || `Document ${shortHash(doc.hash)}`,
      owner: doc.owner ?? null,
      createdAt: doc.createdAt != null ? Number(doc.createdAt) : null,
      verified: doc.verified ?? true,
      status: doc.status || "Registered",
      cid: doc?.cid ?? doc?.ipfs?.cid ?? null,
      access: "shared",
      file: doc?.file ?? null,
      sharedAt: doc?.sharedAt ?? null,
    }))
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));

  return { owned, shared };
}

async function buildVerificationResponse(hash) {
  const [existsOnChain, revoked, proof, verifiedOnChain] = await Promise.all([
    chain.documentExists(hash).catch(() => false),
    // FAIL-CLOSED: a lookup error means we cannot confirm the document is NOT
    // revoked — so we treat it as revoked rather than granting "authentic" status.
    chain.isDocumentRevoked(hash).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(
        `[SECURITY] buildVerificationResponse: isDocumentRevoked(${hash}) failed — defaulting to REVOKED (fail-closed):`,
        err?.message ?? String(err)
      );
      return true; // deny verification when revocation status is unknowable
    }),
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
/**
 * GET /api/auth/nonce — Issue a short-lived, address-bound, domain-bound one-time nonce.
 *
 * Query params:
 *   address (required) — the wallet address that will use this nonce
 *
 * Response:
 *   { nonce, chainId, contractAddress, expiresAt, challengeTemplate }
 *
 * The client must sign:
 *   "BDVS Authentication v2: <chainId>:<contractAddress>:<address>:<nonce>"
 * using personal_sign (EIP-191) and include the result as x-wallet-signature
 * plus x-wallet-nonce in any authenticated request.
 */
app.get("/api/auth/nonce", async (req, res) => {
  const rawAddr = req.query?.address ?? req.headers["x-wallet-address"];
  if (!rawAddr || !isEthAddress(String(rawAddr).trim())) {
    return res.status(400).json({
      error: "Provide ?address=<0x...> — a valid Ethereum wallet address.",
    });
  }
  const address = String(rawAddr).trim().toLowerCase();
  const domain  = await getAuthDomain();
  const nonce   = ethers.hexlify(ethers.randomBytes(16)); // 128-bit random
  const expiresAt = Date.now() + NONCE_TTL_MS;

  _nonceStore.set(nonce, {
    address,
    chainId:         domain.chainId,
    contractAddress: domain.contractAddress,
    expiresAt,
  });

  return res.json({
    nonce,
    chainId:         domain.chainId,
    contractAddress: domain.contractAddress,
    expiresAt,
    challengeTemplate: `${AUTH_PROMPT}${domain.chainId}:${domain.contractAddress}:${address}:${nonce}`,
  });
});

// ── Grantee P-256 public key registry (§IV-C) ──────────────────────────────
//
// Grantees call publishP256PublicKey() (clientCrypto.ts) once in their own
// session.  The resulting SPKI-hex is stored here, keyed by wallet address.
// Owners then GET it before calling wrapKeyForGrantee() — they never need
// the grantee's Signer.
//
// In-process Map (same pattern as _nonceStore).  For multi-instance deployments
// this should be replaced with a Redis or database-backed store.
const _p256PubKeyStore = new Map(); // address (lowercase) → { spkiHex, derivedAt }

/**
 * POST /api/users/:address/p256-pubkey
 *
 * Body: { spkiHex: string, derivedAt: number }
 * Requires: valid wallet auth headers (the grantee must sign the request)
 *
 * Stores the grantee's P-256 public key SPKI hex so document owners can
 * fetch it without ever needing the grantee's live Signer.
 */
app.post("/api/users/:address/p256-pubkey", async (req, res) => {
  try {
    const paramAddr = req.params.address?.toLowerCase();
    if (!paramAddr || !isEthAddress(paramAddr)) {
      return res.status(400).json({ error: "Invalid Ethereum address in path." });
    }

    // Auth: the signer must be the address in the path
    const authedAddr = verifyAuthHeaders(req, res);
    if (!authedAddr) return; // verifyAuthHeaders already sent 401
    if (authedAddr !== paramAddr) {
      return res.status(403).json({
        error: "Authenticated address does not match the :address parameter.",
      });
    }

    const { spkiHex, derivedAt, spkiSignature } = req.body ?? {};
    if (typeof spkiHex !== "string" || !/^[0-9a-f]+$/i.test(spkiHex) || spkiHex.length < 100) {
      return res.status(400).json({ error: "spkiHex must be a non-empty hex string (\u226550 bytes SPKI)." });
    }

    // §IV-C Self-authentication: verify the SPKI signature against the wallet
    // address before storing.  This ensures the server cannot forward a
    // substituted key — the signature is over the SPKI bytes themselves,
    // signed by the wallet's secp256k1 key (personal_sign / EIP-191).
    if (typeof spkiSignature !== "string" || spkiSignature.length < 130) {
      return res.status(400).json({
        error:
          "spkiSignature is required (EIP-191 personal_sign of \"BDVS P256 SPKI: <spkiHex>\"). " +
          "Call publishP256PublicKey() which produces the signature automatically.",
      });
    }
    try {
      const spkiMessage = `BDVS P256 SPKI: ${spkiHex.toLowerCase()}`;
      const recovered = ethers.verifyMessage(spkiMessage, spkiSignature);
      if (recovered.toLowerCase() !== paramAddr) {
        return res.status(400).json({
          error: "spkiSignature ecrecover mismatch: the signature was not produced by the claimed wallet address.",
        });
      }
    } catch {
      return res.status(400).json({ error: "Malformed spkiSignature; ecrecover failed." });
    }

    _p256PubKeyStore.set(paramAddr, {
      address:       paramAddr,
      spkiHex:       spkiHex.toLowerCase(),
      spkiSignature, // stored so fetchers can verify offline without trusting the relay
      derivedAt:     typeof derivedAt === "number" ? derivedAt : Date.now(),
      updatedAt:     Date.now(),
    });

    return res.status(201).json({ ok: true, address: paramAddr });
  } catch (err) {
    console.error("POST /api/users/:address/p256-pubkey error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /api/users/:address/p256-pubkey
 *
 * Returns the grantee's P-256 public key SPKI hex, or 404 if not yet published.
 * No auth required — this is a public lookup (SPKI is a public key by definition).
 */
app.get("/api/users/:address/p256-pubkey", async (req, res) => {
  try {
    const paramAddr = req.params.address?.toLowerCase();
    if (!paramAddr || !isEthAddress(paramAddr)) {
      return res.status(400).json({ error: "Invalid Ethereum address in path." });
    }

    const entry = _p256PubKeyStore.get(paramAddr);
    if (!entry) {
      return res.status(404).json({
        error:
          "No P-256 public key found for this address. " +
          "The grantee must call publishP256PublicKey() and POST to this endpoint first.",
      });
    }

    return res.json(entry);
  } catch (err) {
    console.error("GET /api/users/:address/p256-pubkey error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

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
    // A4: Require signed auth for wallet-gated reads
    const address = verifyAuthHeaders(req, res);
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
    // A3: Require signed auth for mutating routes
    const address = verifyAuthHeaders(req, res);
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
    // A4: Require signed auth for wallet-gated reads
    const address = verifyAuthHeaders(req, res);
    if (!address) return;
    // Debug: trace document listing for troubleshooting hangs
    // eslint-disable-next-line no-console
    console.info(`/api/documents requested by ${address}`);
    let documents;
    try {
      // Keep API responsive, but never return false-empty results on timeout.
      documents = await withTimeout(
        summarizeAccessibleDocuments(address),
        20000,
        "/api/documents"
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`/api/documents chain summary failed for ${address}, using local fallback:`, err);
      documents = await summarizeLocalDocuments(address);
    }
    // eslint-disable-next-line no-console
    console.info(`/api/documents completed for ${address}: found ${ (documents?.owned?.length||0) + (documents?.shared?.length||0) } items`);
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
/**
 * POST /api/upload — Content-Blind Relay (paper §IV-B)
 *
 * The server NEVER sees plaintext. The client must:
 *   1. Hash the plaintext with keccak256 (client-side)
 *   2. Encrypt the plaintext with AES-256-GCM using a wallet-derived key
 *   3. Upload the resulting ciphertext blob as the "file" form field
 *   4. Supply the keccak256 hash as the "hash" form field
 *   5. Supply file metadata (name, mimetype, originalSize) as form fields
 *
 * The server validates the hash format, checks for duplicates,
 * then stores the opaque ciphertext on IPFS. Key material is NEVER stored.
 */
async function handleUpload(req, res) {
  try {
    // A3: Require EIP-191 signature for all mutating routes
    const ownerAddress = verifyAuthHeaders(req, res);
    if (!ownerAddress) return;

    if (!req.file) {
      return res.status(400).json({ error: "Missing file (field name: file)" });
    }

    // B1: Accept client-supplied hash — server does NOT compute it from plaintext
    const clientHash = typeof req.body?.hash === "string" ? req.body.hash.trim() : "";
    if (!clientHash.startsWith("0x") || clientHash.length !== 66) {
      return res.status(400).json({
        error:
          "Missing or invalid 'hash' form field. " +
          "Supply the keccak256 of the original plaintext (0x + 64 hex).",
      });
    }
    const hash = clientHash;

    // B2: The uploaded buffer is already encrypted ciphertext — never decrypt it
    const { originalname, buffer: ciphertextBuffer, mimetype, size } = req.file;

    // Accept optional metadata fields from the client
    const clientName     = typeof req.body?.name     === "string" ? req.body.name.trim()     : originalname;
    const clientMimetype = typeof req.body?.mimetype === "string" ? req.body.mimetype.trim() : mimetype;
    const clientOrigSize = Number.isFinite(Number(req.body?.originalSize)) ? Number(req.body.originalSize) : size;
    const clientAlg      = typeof req.body?.alg      === "string" ? req.body.alg.trim()      : "aes-256-gcm";

    // §IV-C: Optional owner self-wrapped key (JSON-encoded WrappedGranteeKey).
    // The server treats it as an opaque JSON blob — it never has access to the raw AES key.
    let ownerWrappedKey = null;
    if (typeof req.body?.ownerWrappedKey === "string" && req.body.ownerWrappedKey.length > 0) {
      try { ownerWrappedKey = JSON.parse(req.body.ownerWrappedKey); } catch { /* ignore malformed */ }
    }

    const fileMeta = { name: clientName, mimetype: clientMimetype, size: clientOrigSize };

    // Duplicate check — same as before
    const alreadyExists = await chain.documentExists(hash);
    if (alreadyExists) {
      let existing = null;
      let revoked  = null;
      try { existing = await chain.getDocumentMeta(hash); } catch { /* ignore */ }
      try { revoked  = await chain.isDocumentRevoked(hash); } catch { /* ignore */ }

      if (existing?.owner && String(existing.owner).toLowerCase() !== ownerAddress) {
        return res.status(403).json({
          error: "This document hash is registered by another wallet.",
        });
      }

      const storedDoc = await getStoredDocument(hash).catch(() => null);
      const ipfsInfo  = storedDoc?.ipfs?.cid
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
        // G1: Correct cipher label — key material NEVER stored by server
        encryption: { enabled: true, cipher: "AES-256-GCM", clientSide: true },
        chain: { contractAddress: config.contractAddress, txHash: null, blockNumber: null },
      });
    }

    // B2: Upload the opaque ciphertext blob as-is — server never decrypts it
    const fileResult = await ipfs.uploadBuffer({
      buffer: ciphertextBuffer,
      filename: `${clientName || "document"}.enc`,
    });

    // B7: Manifest stores ONLY routing metadata — NO key material
    const manifest = makeManifest({
      fileCid: fileResult.cid,
      fileMeta,
      encryption: {
        // G1: correct algorithm label; key/iv/authTag are stored only client-side
        alg: clientAlg || "aes-256-gcm",
        clientSide: true,
        note: "Key material is wallet-derived and never transmitted to or stored by the server.",
      },
    });

    const manifestResult = await ipfs.uploadBuffer({
      buffer: Buffer.from(JSON.stringify(manifest), "utf8"),
      filename: `${clientName || "document"}.manifest.json`,
    });

    // Persist manifest CID locally for later download resolution
    await putDocument({
      hash,
      name: clientName || `Document ${shortHash(hash)}`,
      owner: ownerAddress,
      createdAt: null,
      verified: true,
      status: "Uploaded",
      cid: manifestResult.cid ?? null,
      ipfs: {
        cid: manifestResult.cid ?? null,
        fileCid: fileResult.cid ?? null,
        url: manifestResult.url ?? (manifestResult.cid ? `${config.ipfsGatewayBaseUrl}${manifestResult.cid}` : null),
        provider: manifestResult.provider ?? null,
      },
      file: fileMeta,
      access: "owned",
      // §IV-C: Owner's ECIES-wrapped copy of the AES-GCM document key.
      // Stored opaquely — server never sees the raw key.
      ...(ownerWrappedKey ? { ownerWrappedKey } : {}),
    });

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
      // G1: Correct cipher label; server never holds key material
      encryption: { enabled: true, cipher: "AES-256-GCM", clientSide: true },
      chain: { contractAddress: config.contractAddress, txHash: null, blockNumber: null },
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
/**
 * POST /api/verify — Hash-only verification (paper §IV-C, F1)
 *
 * Accepts JSON body { hash, signature? }.
 * - hash:      keccak256 of the document the client already computed (0x + 64 hex)
 * - signature: optional EIP-191 signature for auditing; not required for public verify
 *
 * The server performs an on-chain lookup and returns the verification result.
 * No file bytes are transferred — the digest alone is sufficient.
 */
app.post("/api/verify", async (req, res) => {
  try {
    const body = req.body ?? {};
    const hash = typeof body.hash === "string" ? body.hash.trim() : "";
    if (!hash.startsWith("0x") || hash.length !== 66) {
      return res.status(400).json({
        error:
          "Invalid or missing 'hash' field. " +
          "Supply the keccak256 of the document (0x + 64 hex chars).",
      });
    }
    const result = await buildVerificationResponse(hash);
    return res.json(result);
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
/**
 * GET /api/documents/:hash/download — Content-Blind Encrypted Download (paper §IV-B)
 *
 * The server returns the RAW ENCRYPTED ciphertext blob from IPFS.
 * Decryption happens entirely in the browser using the wallet-derived key
 * (see frontend/src/clientCrypto.ts:decryptFileClient).
 *
 * Auth: requires EIP-191 signed headers (A4).
 * Access: verified against DocumentRegistry.canViewDocument() on-chain.
 */
app.get("/api/documents/:hash/download", async (req, res) => {
  try {
    // A4: Require EIP-191 signature for wallet-gated read routes
    const viewerAddress = verifyAuthHeaders(req, res);
    if (!viewerAddress) return;

    const { hash } = req.params;
    if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
      return res.status(400).json({ error: "Invalid hash; expected 0x + 64 hex chars" });
    }

    const storedDoc = await getStoredDocument(hash).catch(() => null);
    const localOwnerMatches =
      !!storedDoc?.owner && String(storedDoc.owner).toLowerCase() === viewerAddress;

    const onChainMeta = await withTimeout(
      chain.getDocumentMeta(hash).catch(() => null),
      8000,
      "getDocumentMeta"
    ).catch(() => null);
    if (!onChainMeta && !storedDoc) {
      return res.status(404).json({ error: "Document not found" });
    }

    // C1: Determine ownership — check on-chain meta first, then local store
    const isOwner = onChainMeta
      ? String(onChainMeta.owner).toLowerCase() === viewerAddress
      : localOwnerMatches;

    // C2: Check local share index (fast, no RPC) in parallel with on-chain check
    const localSharedDocs = await listSharedStoreDocuments(viewerAddress).catch(() => []);
    const isInLocalShareIndex = localSharedDocs.some(
      (doc) => String(doc?.hash || "").toLowerCase() === String(hash).toLowerCase()
    );

    let allowed = isOwner || isInLocalShareIndex;
    if (!allowed && onChainMeta) {
      // C3: On-chain canViewDocument is the authoritative check — consult it as a last resort
      try {
        allowed = await withTimeout(
          chain.canViewDocument(hash, viewerAddress),
          8000,
          "canViewDocument"
        );
      } catch {
        // Contract doesn't implement canViewDocument or reverted;
        // already handled via local share index above.
        // eslint-disable-next-line no-console
        console.warn("canViewDocument unavailable; local share index was already consulted");
      }
    }

    if (!allowed) {
      return res.status(403).json({ error: "Not authorized to view this document" });
    }

    // Reuse the local share docs fetched above — no need to query again
    const sharedDocs = localSharedDocs;

    // Resolve manifest CID from local store or on-chain event log
    // sharedDocs was already fetched in the authorization block above
    const sharedDoc   = sharedDocs.find((doc) => String(doc?.hash || "").toLowerCase() === String(hash).toLowerCase()) ?? null;
    const onChainDoc  = await withTimeout(
      chain.getDocument(hash, viewerAddress).catch(() => null),
      10000,
      "getDocument"
    ).catch(() => null);

    let manifestCid = storedDoc?.ipfs?.cid ?? storedDoc?.cid ?? sharedDoc?.cid ?? (onChainDoc?.cid ?? null);
    if (!manifestCid) {
      const registeredDocs = await withTimeout(
        chain.listRegisteredDocuments().catch(() => []),
        12000,
        "listRegisteredDocuments"
      ).catch(() => []);
      const match = registeredDocs.find(
        (doc) => String(doc?.hash || "").toLowerCase() === String(hash).toLowerCase()
      );
      manifestCid = typeof match?.cid === "string" ? match.cid.trim() : null;
    }
    if (!manifestCid) {
      return res.status(403).json({
        error:
          "Manifest CID unavailable for this viewer. " +
          "The document was found on-chain, but the CID is not accessible.",
      });
    }

    // Fetch the manifest from IPFS
    const manifestBytes = await ipfs.fetchBuffer({ cid: manifestCid });
    let manifest = null;
    try {
      manifest = JSON.parse(manifestBytes.toString("utf8"));
    } catch {
      // Not JSON — manifestCid may be a direct ciphertext CID
      manifest = null;
    }

    // If manifest is a legacy encrypted secret envelope, unwrap it if masterKey is available
    if (manifest && typeof manifest === "object" && manifest.data && manifest.tag && manifest.iv && masterKey) {
      try {
        const unwrapped = unwrapSecret(manifest, masterKey);
        const parsed = JSON.parse(unwrapped.toString("utf8"));
        if (parsed && typeof parsed === "object") {
          manifest = parsed;
        }
      } catch (unwrapErr) {
        // eslint-disable-next-line no-console
        console.warn("Could not unwrap legacy manifest envelope:", unwrapErr.message);
      }
    }

    // Resolve fileCid with multi-tier fallback:
    // 1. Manifest fileCid (standard for new client-side and un-wrapped legacy manifests)
    // 2. storedDoc ipfs.fileCid (persisted in local document store / MongoDB)
    // 3. sharedDoc ipfs.fileCid
    // 4. manifestCid itself (if file was pinned directly without manifest)
    let fileCid =
      manifest?.fileCid ||
      manifest?.file?.cid ||
      manifest?.file?.fileCid ||
      storedDoc?.ipfs?.fileCid ||
      storedDoc?.fileCid ||
      sharedDoc?.ipfs?.fileCid ||
      sharedDoc?.fileCid ||
      null;

    if (!fileCid) {
      fileCid = manifestCid;
    }

    // Fetch the file bytes from IPFS (or reuse manifestBytes if fileCid is manifestCid)
    let fileBytes;
    if (fileCid === manifestCid) {
      fileBytes = manifestBytes;
    } else {
      fileBytes = await ipfs.fetchBuffer({ cid: fileCid });
    }

    // Check if document was encrypted via legacy server-side crypto (pre-E2EE)
    let responseBytes = fileBytes;
    let isLegacyDecrypted = false;

    if (manifest?.encryption?.key && !manifest?.encryption?.clientSide) {
      try {
        const keyBytes = Buffer.from(String(manifest.encryption.key), "base64");
        const ivBytes = Buffer.from(String(manifest.encryption.iv), "base64");
        const authTagBytes = manifest.encryption.authTag ? Buffer.from(String(manifest.encryption.authTag), "base64") : null;
        const alg = manifest.encryption.alg || (authTagBytes ? "aes-256-gcm" : "aes-256-cbc");
        responseBytes = decryptFile(fileBytes, keyBytes, ivBytes, authTagBytes, alg);
        isLegacyDecrypted = true;
      } catch (decErr) {
        // eslint-disable-next-line no-console
        console.warn("Legacy decryption fallback failed:", decErr.message);
        responseBytes = fileBytes;
      }
    }

    const existsOnChain =
      !!onChainMeta ||
      (storedDoc && (storedDoc.status === "Registered" || storedDoc.status === "Uploaded" || storedDoc.verified)) ||
      (sharedDoc && (sharedDoc.status === "Registered" || sharedDoc.status === "Uploaded" || sharedDoc.verified));

    if (!existsOnChain) {
      return res.status(412).json({
        error: "Download failed: document not confirmed on-chain. Please retry in a few seconds.",
      });
    }

    // Set informational headers (no sensitive data exposed)
    const filename =
      manifest?.file?.name ||
      manifest?.fileMeta?.name ||
      storedDoc?.file?.name ||
      storedDoc?.name ||
      sharedDoc?.name ||
      "document";
    // Original mimetype from manifest or local store — sent back so client
    // can save the decrypted file with the correct type/extension.
    const originalMimetype =
      manifest?.file?.mimetype ||
      manifest?.fileMeta?.mimetype ||
      storedDoc?.file?.mimetype ||
      sharedDoc?.file?.mimetype ||
      null;
    const alg      = manifest?.encryption?.alg || "aes-256-gcm";
    const encMode  = isLegacyDecrypted ? "legacy-decrypted" : (manifest?.encryption?.clientSide ? "client-side" : "opaque");
    const onchain  = onChainMeta
      ? {
          owner: onChainMeta.owner ?? null,
          createdAt: onChainMeta.createdAt != null ? Number(onChainMeta.createdAt) : null,
        }
      : null;

    // For client-side E2EE: we return the raw ciphertext blob. The client decrypts and then
    // saves it under the original name. For legacy-decrypted docs we return plaintext directly.
    res.setHeader("Content-Type", "application/octet-stream");
    // Content-Disposition: for E2EE docs, include .enc so the client knows it's still encrypted.
    // The client strips .enc and uses X-Original-Filename for the save dialog.
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${String(filename).replace(/"/g, "")}${isLegacyDecrypted ? "" : ".enc"}"`
    );
    // Tell the client the ORIGINAL filename and mimetype to use after decryption
    res.setHeader("X-Original-Filename", String(filename).replace(/"/g, ""));
    if (originalMimetype) res.setHeader("X-Original-Mimetype", String(originalMimetype));
    // Tell the client which algorithm was used so it can decrypt correctly
    res.setHeader("X-Encryption-Alg", alg);
    res.setHeader("X-Encryption-Mode", encMode);
    res.setHeader("X-Document-Integrity", "on-chain-verified");
    res.setHeader(
      "X-Document-Integrity-Message",
      isLegacyDecrypted
        ? "Legacy document decrypted server-side for backwards compatibility; verify digest client-side"
        : "Ciphertext returned; integrity verification occurs client-side after decryption"
    );
    if (onchain?.owner)     res.setHeader("X-Document-Owner",       String(onchain.owner));
    if (onchain?.createdAt) res.setHeader("X-Document-Recorded-At", String(onchain.createdAt));
    if (config.contractAddress) res.setHeader("X-Document-Contract", String(config.contractAddress));

    return res.send(responseBytes);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/documents/:hash/download error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /api/shared-documents - Return enriched shared documents for the caller
 * Cross-references the shared collection with the documents collection in MongoDB
 * to provide full metadata (filename, IPFS CID, file size, etc.)
 */
app.get("/api/shared-documents", async (req, res) => {
  try {
    // A4: Require signed auth for wallet-gated reads
    const address = verifyAuthHeaders(req, res);
    if (!address) return;
    // eslint-disable-next-line no-console
    console.info(`/api/shared-documents requested by ${address}`);
    const enrichedDocs = await listSharedDocumentsEnriched(address);
    // eslint-disable-next-line no-console
    console.info(`/api/shared-documents completed for ${address}: found ${enrichedDocs.length} shared documents`);
    return res.json({ shared: enrichedDocs });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/shared-documents GET error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

app.post("/api/shared-record", async (req, res) => {
  try {
    // A3: Require signed auth for mutating routes
    const callerAddress = verifyAuthHeaders(req, res);
    if (!callerAddress) return;

    const body = req.body ?? {};
    const hash = typeof body.hash === "string" ? body.hash : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const owner = typeof body.owner === "string" ? body.owner.trim() : "";
    const createdAt = Number.isFinite(Number(body.createdAt)) ? Number(body.createdAt) : null;
    const cid = typeof body.cid === "string" ? body.cid.trim() : null;
    const targetViewer = typeof body.viewerAddress === "string" ? body.viewerAddress.trim() : "";

    if (!hash.startsWith("0x") || hash.length !== 66) {
      return res.status(400).json({ error: "Invalid hash; expected 0x + 64 hex chars" });
    }

    // A3/C2: Verify the caller owns the document on-chain before allowing a share record.
    // EIP-191 proves identity; this proves the identity is authorized to share.
    // Mirrors the ownership check already present in DELETE /api/shared-record.
    const onChainMeta = await chain.getDocumentMeta(hash).catch(() => null);
    if (!onChainMeta) {
      return res.status(404).json({ error: "Document not found on-chain" });
    }
    if (String(onChainMeta.owner).toLowerCase() !== callerAddress.toLowerCase()) {
      return res.status(403).json({
        error: "Only the document owner can create a shared-access record",
      });
    }

    // Determine the viewer address receiving the share
    const viewerAddress = targetViewer.startsWith("0x") && targetViewer.length === 42
      ? targetViewer
      : callerAddress;

    // §IV-C: Optional grantee-wrapped AES key (WrappedGranteeKey JSON).
    // Stored opaquely; server never decrypts it.
    const wrappedGranteeKey = body.wrappedGranteeKey
      && typeof body.wrappedGranteeKey === "object"
      && typeof body.wrappedGranteeKey.ephemeralPub === "string"
      && typeof body.wrappedGranteeKey.wrappedKey === "string"
      ? body.wrappedGranteeKey
      : null;

    const record = await putSharedDocument(viewerAddress, {
      hash,
      name: name || `Document ${shortHash(hash)}`,
      owner: onChainMeta.owner || owner || null,
      createdAt,
      verified: true,
      status: "Registered",
      cid,
      access: "shared",
      // §IV-C: Grantee's ECIES-wrapped AES key (opaque blob; never decrypted by server)
      ...(wrappedGranteeKey ? { wrappedGranteeKey } : {}),
    });

    return res.json({ shared: record });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/shared-record POST error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /api/documents/:hash/wrapped-key — fetch the ECIES-wrapped document AES key (§IV-C)
 *
 * Query params:
 *   viewer (required) — the wallet address requesting the key
 *
 * Auth: requires valid EIP-191 signed headers (the authenticated address must equal viewer)
 *
 * Returns:
 *   { wrappedKey: WrappedGranteeKey, isOwnerKey: boolean }
 *
 * Access policy:
 *   - If viewer is the document owner: return ownerWrappedKey from documentIndex
 *   - If viewer is an authorized grantee: return wrappedGranteeKey from sharedStore
 *   - Otherwise: 403
 *
 * 404 if the document has no wrapped key stored (uploaded before §IV-C was deployed).
 */
app.get("/api/documents/:hash/wrapped-key", async (req, res) => {
  try {
    const viewerAddress = verifyAuthHeaders(req, res);
    if (!viewerAddress) return;

    const { hash } = req.params;
    if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
      return res.status(400).json({ error: "Invalid hash; expected 0x + 64 hex chars" });
    }

    // Optional ?viewer= query param for cross-checking; fall back to authed address
    const queryViewer = typeof req.query?.viewer === "string"
      ? req.query.viewer.toLowerCase()
      : viewerAddress;
    if (queryViewer !== viewerAddress) {
      return res.status(403).json({ error: "viewer param must match authenticated wallet address" });
    }

    // Check on-chain ownership
    const onChainMeta = await chain.getDocumentMeta(hash).catch(() => null);
    const isOwner = onChainMeta
      ? String(onChainMeta.owner).toLowerCase() === viewerAddress
      : false;

    if (isOwner) {
      // Return owner's self-wrapped copy
      const storedDoc = await getStoredDocument(hash).catch(() => null);
      if (!storedDoc?.ownerWrappedKey) {
        return res.status(404).json({
          error:
            "No owner wrapped key found. The document was uploaded before key-wrapping was " +
            "introduced. Re-upload to enable sharing.",
        });
      }
      return res.json({ wrappedKey: storedDoc.ownerWrappedKey, isOwnerKey: true });
    }

    // Check grantee share index AND re-verify on-chain permission.
    // We check the local index first (fast) to confirm a wrapped key exists,
    // then re-validate canViewDocument on-chain so a revoked grantee whose
    // share record is still cached cannot retrieve their wrapped key.
    const sharedDocs = await listSharedStoreDocuments(viewerAddress).catch(() => []);
    const sharedEntry = sharedDocs.find(
      (doc) => String(doc?.hash || "").toLowerCase() === hash.toLowerCase()
    );
    if (sharedEntry?.wrappedGranteeKey) {
      // Re-check on-chain access before serving the key
      let granteeStillAuthorized = false;
      try {
        granteeStillAuthorized = await withTimeout(
          chain.canViewDocument(hash, viewerAddress),
          8000,
          "canViewDocument"
        );
      } catch {
        // canViewDocument unavailable — FAIL CLOSED.
        // A transient RPC failure must not admit a potentially-revoked grantee.
        // (Contrast with the /download route, which falls back to the local share
        //  index for availability reasons; wrapped-key exposure has a higher
        //  security bar because it hands out persistent key material.)
        granteeStillAuthorized = false;
        // eslint-disable-next-line no-console
        console.warn("canViewDocument unavailable in wrapped-key endpoint; denying grantee (fail-closed)");
      }
      if (!granteeStillAuthorized) {
        return res.status(403).json({
          error: "Your access to this document has been revoked.",
        });
      }
      return res.json({ wrappedKey: sharedEntry.wrappedGranteeKey, isOwnerKey: false });
    }

    // Not owner, no grantee key — check on-chain permission for a better error
    let hasOnChainAccess = false;
    try {
      hasOnChainAccess = await chain.canViewDocument(hash, viewerAddress);
    } catch { /* canViewDocument not implemented */ }

    if (hasOnChainAccess) {
      return res.status(404).json({
        error:
          "You have on-chain access but no encrypted key has been wrapped for your wallet yet. " +
          "Ask the document owner to re-share the document so a key can be generated for you.",
      });
    }

    return res.status(403).json({ error: "Not authorized to access this document's key" });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/documents/:hash/wrapped-key GET error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

app.delete("/api/shared-record", async (req, res) => {
  try {
    // A3: Require signed auth for mutating routes
    const ownerAddress = verifyAuthHeaders(req, res);
    if (!ownerAddress) return;

    const viewerAddress = typeof req.body?.viewerAddress === "string" ? req.body.viewerAddress.trim() : "";
    const hash = typeof req.body?.hash === "string" ? req.body.hash.trim() : "";
    if (!viewerAddress.startsWith("0x") || viewerAddress.length !== 42) {
      return res.status(400).json({ error: "Invalid viewer address" });
    }
    if (!hash.startsWith("0x") || hash.length !== 66) {
      return res.status(400).json({ error: "Invalid hash; expected 0x + 64 hex chars" });
    }

    const onChainMeta = await chain.getDocumentMeta(hash).catch(() => null);
    if (!onChainMeta) {
      return res.status(404).json({ error: "Document not found on-chain" });
    }
    if (String(onChainMeta.owner).toLowerCase() !== String(ownerAddress).toLowerCase()) {
      return res.status(403).json({ error: "Only the owner can revoke shared access" });
    }

    await deleteSharedDocumentForViewer(viewerAddress, hash).catch(() => false);
    return res.json({ ok: true, hash, viewerAddress });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/shared-record DELETE error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

app.delete("/api/documents/:hash", async (req, res) => {
  try {
    // A3: Require signed auth for mutating routes
    const viewerAddress = verifyAuthHeaders(req, res);
    if (!viewerAddress) return;

    const { hash } = req.params;
    if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
      return res.status(400).json({ error: "Invalid hash; expected 0x + 64 hex chars" });
    }

    const onChainMeta = await chain.getDocumentMeta(hash).catch(() => null);
    if (!onChainMeta) {
      return res.status(404).json({ error: "Document not found on-chain" });
    }

    if (String(onChainMeta.owner).toLowerCase() !== String(viewerAddress).toLowerCase()) {
      return res.status(403).json({ error: "Only the owner can delete this document" });
    }

    const deletedDocument = await deleteStoredDocument(hash).catch(() => false);
    const deletedShared = await deleteSharedDocument(hash).catch(() => false);

    return res.json({
      ok: true,
      deleted: deletedDocument || deletedShared,
      hash,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/documents/:hash DELETE error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

process.on("unhandledRejection", (reason, promise) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  // eslint-disable-next-line no-console
  console.error("Uncaught Exception:", err);
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



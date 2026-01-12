import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "./config.js";
import { makeChainClient, hashFileKeccak256 } from "./chain.js";
import { pickIpfsUploader } from "./ipfs.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: config.corsOrigin === "*" ? true : config.corsOrigin,
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
  },
});

const chain = makeChainClient({
  rpcUrl: config.rpcUrl,
  privateKey: config.privateKey,
  contractAddress: config.contractAddress,
});

const ipfs = pickIpfsUploader({
  pinataJwt: config.pinataJwt,
  web3StorageToken: config.web3StorageToken,
  ipfsGatewayBaseUrl: config.ipfsGatewayBaseUrl,
  ipfsDisabled: config.ipfsDisabled,
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

// Serve the simple frontend UI
app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
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

// Upload: upload -> hash -> IPFS (no on-chain write; client wallet should write)
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

    // If already registered on-chain, do NOT re-upload or attempt to "re-register".
    // (Prevents misleading UX and supports ownership-bound verification.)
    const alreadyRegistered = await chain.verifyDocumentHash(hash);
    if (alreadyRegistered) {
      let existing = null;
      try {
        existing = await chain.getDocument(hash);
      } catch {
        // If contract doesn't have CID for older entries or call fails, just omit.
      }
      return res.json({
        message: "Document is already registered on-chain",
        hash,
        file: fileMeta,
        alreadyRegistered: true,
        existingOwner: existing?.owner ?? null,
        ipfs: existing?.cid
          ? {
              cid: existing.cid,
              url: `${config.ipfsGatewayBaseUrl}${existing.cid}`,
              provider: null,
            }
          : { cid: null, url: null, provider: null },
        chain: {
          contractAddress: config.contractAddress,
          txHash: null,
          blockNumber: null,
        },
      });
    }

    const ipfsResult = await ipfs.uploadBuffer({
      buffer,
      filename: originalname || "document",
    });

    return res.json({
      message: "Uploaded to IPFS. Now register on-chain using your wallet.",
      hash,
      file: fileMeta,
      ipfs: {
        cid: ipfsResult.cid,
        url: ipfsResult.url,
        provider: ipfsResult.provider,
      },
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

// Backwards-compatible alias (older UI may call /api/register)
app.post("/api/register", upload.single("file"), handleUpload);
app.post("/api/upload", upload.single("file"), handleUpload);

// Verify from file: compute hash -> view call
app.post("/api/verify", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing file (field name: file)" });
    }
    const hash = hashFileKeccak256(req.file.buffer);
    const verified = await chain.verifyDocumentHash(hash);
    return res.json({ hash, verified });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/verify error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

// Verify by hash (if frontend already computed it)
app.post("/api/verify-hash", async (req, res) => {
  try {
    const { hash } = req.body ?? {};
    if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
      return res.status(400).json({ error: "Invalid hash; expected 0x + 64 hex chars" });
    }
    const verified = await chain.verifyDocumentHash(hash);
    return res.json({ hash, verified });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/verify-hash error:", err);
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



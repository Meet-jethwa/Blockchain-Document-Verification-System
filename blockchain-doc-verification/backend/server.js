import express from "express";
import cors from "cors";
import multer from "multer";

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

app.get("/api/health", async (_req, res) => {
  const blockNumber = await chain.provider.getBlockNumber();
  res.json({
    ok: true,
    blockNumber,
    contractAddress: config.contractAddress,
    address: chain.wallet.address,
  });
});

// Register: upload -> hash -> IPFS -> chain tx
app.post("/api/register", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing file (field name: file)" });
    }

    const { originalname, buffer, mimetype, size } = req.file;
    const hash = hashFileKeccak256(buffer);

    const ipfsResult = await ipfs.uploadBuffer({
      buffer,
      filename: originalname || "document",
    });

    const { txHash, receipt } = await chain.registerDocumentHash(hash);

    return res.json({
      hash,
      file: { name: originalname, mimetype, size },
      ipfs: {
        cid: ipfsResult.cid,
        url: ipfsResult.url,
        provider: ipfsResult.provider,
      },
      chain: {
        contractAddress: config.contractAddress,
        txHash,
        blockNumber: receipt?.blockNumber ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Common case: duplicate registration
    const status = message.includes("Document already exists") ? 409 : 500;
    return res.status(status).json({ error: message });
  }
});

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
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${config.port}`);
});



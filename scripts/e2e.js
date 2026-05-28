import fs from 'node:fs';
import path from 'node:path';
import { pickIpfsUploader } from '../backend/ipfs.js';
import { encryptFile } from '../backend/fileCrypto.js';
import { makeChainClient, hashFileSha256 } from '../backend/chain.js';
import { config } from '../backend/config.js';

async function main() {
  console.log('E2E test starting...');

  // Validate required config
  if (!config.rpcUrl || !config.privateKey || !config.contractAddress) {
    throw new Error('Missing RPC_URL, PRIVATE_KEY, or CONTRACT_ADDRESS in backend/.env');
  }

  const ipfs = pickIpfsUploader({
    pinataJwt: config.pinataJwt,
    web3StorageToken: config.web3StorageToken,
    ipfsGatewayBaseUrl: config.ipfsGatewayBaseUrl,
    ipfsDisabled: config.ipfsDisabled,
  });

  const chain = makeChainClient({
    rpcUrl: config.rpcUrl,
    privateKey: config.privateKey,
    contractAddress: config.contractAddress,
  });

  // Create a small test payload
  const payload = Buffer.from(`E2E test ${new Date().toISOString()}`);
  const hash = hashFileSha256(payload);
  console.log('Computed SHA-256 hash:', hash);

  // Encrypt and upload
  const { encrypted, key, iv } = encryptFile(payload);
  console.log('Uploading encrypted payload to IPFS...');
  const fileResult = await ipfs.uploadBuffer({ buffer: encrypted, filename: 'e2e-test.enc' });
  console.log('File CID:', fileResult.cid);

  const manifest = {
    version: 1,
    fileCid: fileResult.cid,
    file: { name: 'e2e-test', mimetype: 'application/octet-stream', size: payload.length },
    encryption: { alg: 'aes-256-cbc', key: key.toString('base64'), iv: iv.toString('base64') },
  };

  const manifestEnvelope = { alg: 'raw', data: Buffer.from(JSON.stringify(manifest)).toString('base64') };
  const manifestResult = await ipfs.uploadBuffer({ buffer: Buffer.from(JSON.stringify(manifestEnvelope), 'utf8'), filename: 'e2e-test.manifest.json' });
  console.log('Manifest CID:', manifestResult.cid);

  // Register on-chain using backend wallet
  console.log('Registering hash on-chain using backend wallet...');
  const { txHash, receipt } = await chain.registerDocumentHash(hash, manifestResult.cid);
  console.log('Registered. txHash=', txHash);

  // Verify
  const exists = await chain.verifyDocumentHash(hash);
  console.log('verifyDocumentHash:', exists);

  process.exit(0);
}

main().catch((err) => {
  console.error('E2E test failed:', err);
  process.exit(1);
});

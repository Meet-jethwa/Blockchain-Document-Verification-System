/**
 * benchmark_sepolia_live.js
 *
 * Cross-validates Hardhat-measured gas figures against live Sepolia testnet
 * transaction receipts (Review-Item 6 / §V-B evidence).
 *
 * Prerequisites:
 *   - SEPOLIA_RPC_URL (or RPC_URL), PRIVATE_KEY, CONTRACT_ADDRESS set in
 *     backend/.env or as environment variables.
 *   - The DocumentRegistry contract is already deployed on Sepolia.
 *   - The wallet has enough Sepolia ETH for ~4 small transactions.
 *
 * Usage (from project root):
 *   node test/benchmark_sepolia_live.js
 *
 * What this does:
 *   1. Loads the compiled contract ABI from artifacts/ (falls back to inline ABI)
 *   2. Connects to Sepolia via the configured RPC URL
 *   3. Registers 3 real documents and calls grantViewer on the live contract
 *   4. Reads gasUsed from each Sepolia receipt
 *   5. Compares against the Hardhat reference table side-by-side
 *   6. Writes machine-readable results to test/sepolia_gas_results.json
 *
 * Gas is deterministic for identical EVM bytecode, so we expect the figures
 * to match within a small tolerance (~200 gas for minor EVM version diffs).
 * Demonstrating the match rather than asserting it closes a real evidentiary
 * gap for the paper reviewer.
 */

import { ethers } from 'ethers';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Load environment from backend/.env
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

// ── Configuration ──────────────────────────────────────────────────────────────

const SEPOLIA_RPC_URL  = process.env.SEPOLIA_RPC_URL ?? process.env.RPC_URL ?? '';
const PRIVATE_KEY      = process.env.PRIVATE_KEY ?? '';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS ?? '';

// Hardhat reference figures from benchmark_gas.js / Table IV in the paper.
// Update these if the contract bytecode changes.
const HARDHAT_REFERENCE = {
  registerDocument:       { gas: 131_765, notes: 'Cold SSTORE; first document' },
  'registerDocument(2+)': { gas: 116_465, notes: 'Warm deployer array; 2nd+ document' },
  grantViewer:            { gas:  46_913, notes: 'Cold SSTORE in per-hash viewer mapping' },
};

// ── ABI loader ─────────────────────────────────────────────────────────────────

function loadAbi() {
  const artifactPath = path.join(
    __dirname, '../artifacts/contracts/DocumentRegistry.sol/DocumentRegistry.json'
  );
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    return artifact.abi;
  }
  console.warn('[WARN] Compiled artifact not found; using minimal inline ABI.');
  return [
    'function registerDocument(bytes32 hash, string calldata cid) external',
    'function grantViewer(bytes32 hash, address viewer) external',
    'function revokeViewer(bytes32 hash, address viewer) external',
    'event DocumentRegistered(bytes32 indexed hash, address indexed owner)',
  ];
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  if (!SEPOLIA_RPC_URL) {
    console.error('[ERROR] SEPOLIA_RPC_URL not set. Add it to backend/.env or environment.');
    process.exit(1);
  }
  if (!PRIVATE_KEY) {
    console.error('[ERROR] PRIVATE_KEY not set. Add it to backend/.env or environment.');
    process.exit(1);
  }
  if (!CONTRACT_ADDRESS || !ethers.isAddress(CONTRACT_ADDRESS)) {
    console.error('[ERROR] CONTRACT_ADDRESS not set or invalid. Add it to backend/.env.');
    process.exit(1);
  }

  console.log('=================================================================');
  console.log('  BDVS LIVE SEPOLIA GAS CROSS-VALIDATION (Review-Item 6 / §V-B)  ');
  console.log('=================================================================');
  console.log(`RPC URL   : ${SEPOLIA_RPC_URL.slice(0, 42)}…`);
  console.log(`Contract  : ${CONTRACT_ADDRESS}`);

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
  const abi      = loadAbi();
  const registry = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

  const network = await provider.getNetwork();
  const block   = await provider.getBlockNumber();
  console.log(`Network   : ${network.name} (chainId ${network.chainId})`);
  console.log(`Block     : ${block}`);
  console.log(`Wallet    : ${wallet.address}`);
  console.log(`Balance   : ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH\n`);

  // ── Transaction 1: registerDocument (cold) ──────────────────────────────────
  const hash1 = ethers.keccak256(Buffer.from(`BDVS Sepolia Benchmark Doc #1 – ${Date.now()}`));
  console.log(`[1/4] registerDocument (1st, cold SSTORE)  hash=${hash1.slice(0, 12)}…`);
  const receipt1 = await (await registry.registerDocument(hash1, '')).wait();
  const gas1     = Number(receipt1.gasUsed);
  console.log(`      gasUsed=${gas1.toLocaleString()}  tx=${receipt1.hash}`);

  // ── Transaction 2: registerDocument (2nd) ───────────────────────────────────
  const hash2 = ethers.keccak256(Buffer.from(`BDVS Sepolia Benchmark Doc #2 – ${Date.now()}`));
  console.log(`[2/4] registerDocument (2nd, warm array)   hash=${hash2.slice(0, 12)}…`);
  const receipt2 = await (await registry.registerDocument(hash2, '')).wait();
  const gas2     = Number(receipt2.gasUsed);
  console.log(`      gasUsed=${gas2.toLocaleString()}  tx=${receipt2.hash}`);

  // ── Transaction 3: registerDocument (3rd) ───────────────────────────────────
  const hash3 = ethers.keccak256(Buffer.from(`BDVS Sepolia Benchmark Doc #3 – ${Date.now()}`));
  console.log(`[3/4] registerDocument (3rd, warm array)   hash=${hash3.slice(0, 12)}…`);
  const receipt3 = await (await registry.registerDocument(hash3, '')).wait();
  const gas3     = Number(receipt3.gasUsed);
  console.log(`      gasUsed=${gas3.toLocaleString()}  tx=${receipt3.hash}`);

  // ── Transaction 4: grantViewer ───────────────────────────────────────────────
  const granteeAddr = ethers.Wallet.createRandom().address;
  console.log(`[4/4] grantViewer (cold mapping write)     grantee=${granteeAddr.slice(0, 10)}…`);
  const receipt4 = await (await registry.grantViewer(hash1, granteeAddr)).wait();
  const gas4     = Number(receipt4.gasUsed);
  console.log(`      gasUsed=${gas4.toLocaleString()}  tx=${receipt4.hash}`);

  // ── Comparison table ─────────────────────────────────────────────────────────
  const TOLERANCE = 200;

  const rows = [
    {
      op:      'registerDocument (1st)',
      hardhat: HARDHAT_REFERENCE.registerDocument.gas,
      live:    gas1,
      notes:   HARDHAT_REFERENCE.registerDocument.notes,
    },
    {
      op:      'registerDocument (2nd)',
      hardhat: HARDHAT_REFERENCE['registerDocument(2+)'].gas,
      live:    gas2,
      notes:   HARDHAT_REFERENCE['registerDocument(2+)'].notes,
    },
    {
      op:      'registerDocument (3rd)',
      hardhat: HARDHAT_REFERENCE['registerDocument(2+)'].gas,
      live:    gas3,
      notes:   HARDHAT_REFERENCE['registerDocument(2+)'].notes,
    },
    {
      op:      'grantViewer',
      hardhat: HARDHAT_REFERENCE.grantViewer.gas,
      live:    gas4,
      notes:   HARDHAT_REFERENCE.grantViewer.notes,
    },
  ];

  const results = rows.map(r => ({
    ...r,
    delta: r.live - r.hardhat,
    match: Math.abs(r.live - r.hardhat) <= TOLERANCE,
  }));

  const allMatch = results.every(r => r.match);

  console.log('\n=================================================================');
  console.log('  TABLE: HARDHAT (local) vs SEPOLIA (live) — gasUsed COMPARISON  ');
  console.log('=================================================================');
  const W = [26, 10, 10, 8, 8];
  const hdr = ['Operation', 'Hardhat', 'Sepolia', 'Delta', 'Match?'];
  console.log(hdr.map((h, i) => h.padEnd(W[i])).join('  '));
  console.log('-'.repeat(70));
  for (const r of results) {
    const cols = [
      r.op.padEnd(W[0]),
      String(r.hardhat).padStart(W[1]),
      String(r.live).padStart(W[2]),
      ((r.delta >= 0 ? '+' : '') + r.delta).padStart(W[3]),
      (r.match ? '✓ YES' : '✗ NO ').padEnd(W[4]),
    ];
    console.log(cols.join('  '));
  }
  console.log('-'.repeat(70));
  console.log(`Tolerance : ±${TOLERANCE} gas`);
  console.log(`Verdict   : ${allMatch
    ? '✓  All figures match — Hardhat measurements confirmed on live Sepolia'
    : '✗  One or more figures diverge — check bytecode version'
  }`);
  console.log('\n[NOTE] Gas is EVM-deterministic for identical bytecode. Demonstrating');
  console.log('the match (rather than asserting it) addresses reviewer #6.');

  // ── Machine-readable output ──────────────────────────────────────────────────
  const output = {
    timestamp: new Date().toISOString(),
    network:   { name: network.name, chainId: String(network.chainId) },
    contract:  CONTRACT_ADDRESS,
    tolerance: TOLERANCE,
    allMatch,
    results,
  };
  const outPath = path.join(__dirname, 'sepolia_gas_results.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nResults written → ${outPath}`);
}

main().catch(err => {
  console.error('[FATAL]', err.message ?? err);
  process.exit(1);
});

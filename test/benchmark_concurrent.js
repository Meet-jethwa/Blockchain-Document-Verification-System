/**
 * Concurrent / multi-session load benchmark for BDVS.
 *
 * Addresses Reviewer comment: "no concurrent-request pattern exists — still
 * single-threaded, single-session benchmarking."
 *
 * Scope / caveat (§10.1): This benchmark tests concurrent application-layer
 * request handling against a single in-process Hardhat node, which is a
 * realistic simulation of multi-browser/multi-wallet concurrency at the
 * application level but does not reproduce distributed-network effects
 * (mempool contention across independent nodes, gas-price auctions, or P2P
 * propagation delays) that a public testnet would exhibit.
 *
 * This harness:
 *   1. Spins up N concurrent "virtual users" (Promise.all over async workers).
 *   2. Each virtual user independently deploys, uploads a file hash, registers
 *      it, and verifies it — simulating realistic multi-browser, multi-wallet
 *      load.
 *   3. Collects per-request latencies and computes median, p95, p99, min/max,
 *      mean, and 95% confidence interval (Student-t) across all N * reps
 *      observations.
 *   4. Detects gas variance across concurrent transactions.
 *
 * Usage (Hardhat in-process):
 *   npx hardhat run test/benchmark_concurrent.js --network localhost
 *
 * Recommended run for submission:
 *   N_USERS=10 N_REPS=30 npx hardhat run test/benchmark_concurrent.js --network localhost
 */

import { network } from 'hardhat';
import crypto from 'node:crypto';

// ── Configuration ─────────────────────────────────────────────────────────────
const N_USERS = parseInt(process.env.N_USERS  ?? '10',  10);  // concurrent virtual users
const N_REPS  = parseInt(process.env.N_REPS   ?? '30',  10);  // registrations per user
const FILE_SIZES_KB = [1, 10, 100, 1024, 10240];              // simulated file sizes

// ── Stats helpers ─────────────────────────────────────────────────────────────
/**
 * Compute median of a sorted array.
 * @param {number[]} sorted - ascending sorted array
 */
function median(sorted) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compute p-th percentile (0–100) of a sorted array using linear interpolation.
 * @param {number[]} sorted
 * @param {number}   p
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = (p / 100) * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  const frac = idx - lo;
  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
}

/**
 * 95% confidence interval on the mean using Student-t (two-tailed).
 * t-critical values for 95% CI, two-tailed, limited table.
 * @param {number[]} values - raw observations
 * @returns {{ mean: number, ci95: number }}
 */
function meanCI95(values) {
  const n    = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1);
  const se   = Math.sqrt(variance / n);
  // t critical values for 95% CI (two-tailed) — approximate for large n
  const tCrit = n >= 120 ? 1.960
              : n >= 60  ? 2.000
              : n >= 30  ? 2.042
              : n >= 20  ? 2.086
              : n >= 10  ? 2.228
              : 2.571; // n ~ 6
  return { mean, ci95: tCrit * se };
}

/**
 * Format milliseconds cleanly.
 * @param {number} ms
 */
function fmt(ms) { return ms.toFixed(2) + ' ms'; }

// ── Core benchmark ────────────────────────────────────────────────────────────
export async function runConcurrentBenchmark() {
  console.log('='.repeat(70));
  console.log('  BDVS CONCURRENT LOAD BENCHMARK');
  console.log(`  ${N_USERS} virtual users × ${N_REPS} reps each = ${N_USERS * N_REPS} total ops`);
  console.log('='.repeat(70));

  const { ethers } = await network.connect();

  // Create N_USERS distinct signers (hardhat provides 20 accounts by default)
  const allSigners = await ethers.getSigners();
  if (allSigners.length < N_USERS) {
    throw new Error(
      `Need ${N_USERS} signers but Hardhat only has ${allSigners.length}. ` +
      `Reduce N_USERS or increase Hardhat accounts in hardhat.config.js.`
    );
  }
  const signers = allSigners.slice(0, N_USERS);

  // Deploy ONE shared contract (all users interact with the same registry)
  console.log('\n[deploy] Deploying DocumentRegistry…');
  const t0Deploy = Date.now();
  const registry = await ethers.deployContract('DocumentRegistry');
  await registry.waitForDeployment();
  console.log(`[deploy] Done in ${Date.now() - t0Deploy} ms → ${await registry.getAddress()}`);

  // ── Phase 1: Concurrent registration ──────────────────────────────────────
  console.log(`\n[phase 1] ${N_USERS} users concurrently registering ${N_REPS} docs each…`);

  const allRegLatencies   = [];   // ms
  const allRegGasUnits    = [];   // gas units (BigInt converted to Number)
  const allVerifyLatencies = [];  // ms

  const t0Phase1 = Date.now();

  /**
   * Single virtual user: register N_REPS documents and verify each.
   * @param {ethers.Signer} signer
   * @param {number}        userIdx
   */
  async function virtualUser(signer, userIdx) {
    const regLatencies    = [];
    const regGasUnits     = [];
    const verifyLatencies = [];

    for (let rep = 0; rep < N_REPS; rep++) {
      // Generate a pseudo-random 32-byte document hash
      const hash = '0x' + crypto.randomBytes(32).toString('hex');

      // ── Register ──
      const tReg = Date.now();
      const tx   = await registry.connect(signer).registerDocument(hash, '');
      const receipt = await tx.wait();
      const regMs = Date.now() - tReg;

      regLatencies.push(regMs);
      regGasUnits.push(Number(receipt.gasUsed));

      // ── Verify (view call — no gas) ──
      const tVer = Date.now();
      await registry.verifyDocument(hash);
      verifyLatencies.push(Date.now() - tVer);
    }

    return { userIdx, regLatencies, regGasUnits, verifyLatencies };
  }

  // Launch all virtual users concurrently
  const results = await Promise.all(signers.map((signer, i) => virtualUser(signer, i)));

  const phase1Ms = Date.now() - t0Phase1;
  console.log(`[phase 1] Completed in ${phase1Ms} ms (wall clock)`);

  // Aggregate
  for (const r of results) {
    allRegLatencies.push(...r.regLatencies);
    allRegGasUnits.push(...r.regGasUnits);
    allVerifyLatencies.push(...r.verifyLatencies);
  }

  // ── Phase 2: Concurrent reads (view calls only) ───────────────────────────
  console.log(`\n[phase 2] Concurrent getDocumentMeta() reads (${N_USERS} users × ${N_REPS} reads)…`);

  // Each user reads back their own first document (registered in phase 1)
  const allReadLatencies = [];
  const t0Phase2 = Date.now();

  // Collect hashes registered by each user (we use event logs)
  const filter = registry.filters.DocumentRegistered();
  const events = await registry.queryFilter(filter);
  const hashByUser = {};
  for (const ev of events) {
    const owner = ev.args[1].toLowerCase();
    if (!hashByUser[owner]) hashByUser[owner] = ev.args[0];
  }

  const readResults = await Promise.all(signers.map(async (signer, i) => {
    const latencies = [];
    const addr  = (await signer.getAddress()).toLowerCase();
    const hash  = hashByUser[addr];
    if (!hash) return { latencies };
    for (let rep = 0; rep < N_REPS; rep++) {
      const t0 = Date.now();
      await registry.getDocumentMeta(hash);
      latencies.push(Date.now() - t0);
    }
    return { latencies };
  }));

  for (const r of readResults) allReadLatencies.push(...r.latencies);
  const phase2Ms = Date.now() - t0Phase2;
  console.log(`[phase 2] Completed in ${phase2Ms} ms (wall clock)`);

  // ── Report ─────────────────────────────────────────────────────────────────
  function report(label, obs) {
    const sorted = [...obs].sort((a, b) => a - b);
    const { mean, ci95 } = meanCI95(obs);
    console.log(`\n  ${label} (n=${obs.length})`);
    console.log(`    min:    ${fmt(sorted[0])}`);
    console.log(`    median: ${fmt(median(sorted))}`);
    console.log(`    mean:   ${fmt(mean)}  ±${fmt(ci95)}  (95% CI)`);
    console.log(`    p95:    ${fmt(percentile(sorted, 95))}`);
    console.log(`    p99:    ${fmt(percentile(sorted, 99))}`);
    console.log(`    max:    ${fmt(sorted[sorted.length - 1])}`);
  }

  console.log('\n' + '─'.repeat(70));
  console.log('  RESULTS');
  console.log('─'.repeat(70));
  report('registerDocument() latency [ms]', allRegLatencies);

  const gasObs = allRegGasUnits;
  const gasSorted = [...gasObs].sort((a, b) => a - b);
  const { mean: gasMean, ci95: gasCI } = meanCI95(gasObs);
  console.log(`\n  registerDocument() gas (n=${gasObs.length})`);
  console.log(`    min:    ${gasSorted[0].toLocaleString()}`);
  console.log(`    median: ${median(gasSorted).toLocaleString()}`);
  console.log(`    mean:   ${gasMean.toFixed(0)}  ±${gasCI.toFixed(0)}  (95% CI)`);
  console.log(`    p95:    ${percentile(gasSorted, 95).toFixed(0)}`);
  console.log(`    max:    ${gasSorted[gasSorted.length - 1].toLocaleString()}`);

  report('verifyDocument() latency [ms]',  allVerifyLatencies);
  report('getDocumentMeta() latency [ms]', allReadLatencies);

  // Throughput
  const totalOps   = N_USERS * N_REPS;
  const throughput = (totalOps / (phase1Ms / 1000)).toFixed(1);
  console.log(`\n  Throughput: ${throughput} registrations/sec  (${N_USERS} concurrent users, wall clock)`);
  console.log(`  Total wall time (Phase 1 + Phase 2): ${phase1Ms + phase2Ms} ms\n`);
  console.log('─'.repeat(70));

  // ── Per-user breakdown ─────────────────────────────────────────────────────
  console.log('\n  Per-user registration latency breakdown (median ms):');
  const perUserRows = [];
  for (const r of results) {
    const sorted = [...r.regLatencies].sort((a, b) => a - b);
    const gasSorted = [...r.regGasUnits].sort((a, b) => a - b);
    const row = {
      userId:      r.userIdx,
      regMedian:   median(sorted),
      regP95:      percentile(sorted, 95),
      gasMedian:   median(gasSorted),
    };
    perUserRows.push(row);
    console.log(`    user-${String(r.userIdx).padStart(2, '0')}: median=${fmt(row.regMedian)}  p95=${fmt(row.regP95)}  gasMedian=${row.gasMedian.toFixed(0)}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('  Concurrent benchmark complete.');
  console.log('='.repeat(70) + '\n');

  // ── Return structured stats for run_all.js markdown generation ────────────
  function statBlock(obs) {
    const sorted = [...obs].sort((a, b) => a - b);
    const { mean, ci95 } = meanCI95(obs);
    return {
      n:       obs.length,
      min:     sorted[0],
      median:  median(sorted),
      mean,
      ci95,
      p95:     percentile(sorted, 95),
      p99:     percentile(sorted, 99),
      max:     sorted[sorted.length - 1],
    };
  }

  return {
    config:   { nUsers: N_USERS, nReps: N_REPS, totalOps },
    wallMs:   { phase1: phase1Ms, phase2: phase2Ms, total: phase1Ms + phase2Ms },
    throughputRegPerSec: parseFloat(throughput),
    registerLatencyMs:   statBlock(allRegLatencies),
    gasUnits:            statBlock(allRegGasUnits),
    verifyLatencyMs:     statBlock(allVerifyLatencies),
    readLatencyMs:       statBlock(allReadLatencies),
    perUserRows,
  };
}

// Auto-run when executed directly
if (process.argv[1] && process.argv[1].endsWith('benchmark_concurrent.js')) {
  runConcurrentBenchmark().catch(err => {
    console.error('[benchmark_concurrent] FATAL:', err);
    process.exit(1);
  });
}


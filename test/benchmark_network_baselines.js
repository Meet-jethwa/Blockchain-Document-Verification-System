import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import keccakLib from 'keccak';
import { keccak256 as jsKeccak256 } from 'js-sha3';
import { AAD_FIXED_LABEL } from '../backend/fileCrypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect native keccak bindings with pure-JS fallback
let keccakHashFn = null;
let keccakEngine = null;
let keccakIsNative = false;
try {
  const keccakFn = keccakLib('keccak256');
  keccakFn.update(Buffer.alloc(1)).digest();
  keccakHashFn = buf => keccakLib('keccak256').update(buf).digest('hex');
  keccakEngine = 'native C-bindings (keccak npm package)';
  keccakIsNative = true;
} catch {
  // Use true Ethereum Keccak-256 (pad byte 0x01), NOT NIST sha3_256 (pad byte 0x06)
  keccakHashFn = buf => jsKeccak256(buf);
  keccakEngine = 'pure-JS fallback (js-sha3 keccak256)';
  keccakIsNative = false;
}

function computeStats(timings, payloadSizeBytes) {
  const N = timings.length;
  const sum = timings.reduce((a, b) => a + b, 0);
  const meanMs = sum / N;

  const sorted = [...timings].sort((a, b) => a - b);
  const medianMs = N % 2 === 0 ? (sorted[N / 2 - 1] + sorted[N / 2]) / 2 : sorted[Math.floor(N / 2)];
  const minMs = sorted[0];
  const maxMs = sorted[N - 1];

  const variance = timings.reduce((acc, t) => acc + Math.pow(t - meanMs, 2), 0) / (N - 1);
  const stdDevMs = Math.sqrt(variance);
  const semMs = stdDevMs / Math.sqrt(N);
  const zScore = N >= 30 ? 1.96 : 2.064;
  const ci95MarginMs = zScore * semMs;

  const payloadSizeMB = payloadSizeBytes / (1024 * 1024);
  const throughputMBps = meanMs > 0 ? payloadSizeMB / (meanMs / 1000) : 0;

  return {
    sampleSize: N,
    meanMs: parseFloat(meanMs.toFixed(4)),
    medianMs: parseFloat(medianMs.toFixed(4)),
    minMs: parseFloat(minMs.toFixed(4)),
    maxMs: parseFloat(maxMs.toFixed(4)),
    stdDevMs: parseFloat(stdDevMs.toFixed(4)),
    semMs: parseFloat(semMs.toFixed(4)),
    ci95MarginMs: parseFloat(ci95MarginMs.toFixed(4)),
    ci95String: `[${Math.max(0, meanMs - ci95MarginMs).toFixed(4)}, ${(meanMs + ci95MarginMs).toFixed(4)}] ms`,
    throughputMBps: parseFloat(throughputMBps.toFixed(2)),
    rawTimingsMs: timings.map(t => parseFloat(t.toFixed(5)))
  };
}

export async function runBaselineBenchmarks(options = {}) {
  const iterations = options.iterations || 50;
  const warmupRuns = options.warmupRuns || 10;
  const sizeKB = options.sizeKB || 1024; // 1 MB
  const sizeBytes = sizeKB * 1024;
  const buffer = crypto.randomBytes(sizeBytes);
  const plainBytes = new Uint8Array(buffer);

  console.log('===============================================================');
  console.log('       BDVS ARCHITECTURAL BASELINE & AAD BENCHMARKS            ');
  console.log(`       Payload: ${sizeKB} KB (1 MB) | N=${iterations} runs (Warmup: ${warmupRuns})  `);
  console.log(`       Baseline: Keccak-256 | Engine: ${keccakEngine}`);
  console.log(`       CPU: ${os.cpus()[0]?.model?.trim()} | Node: ${process.version} (OpenSSL: ${process.versions.openssl})`);
  console.log('===============================================================\n');

  // ---------------------------------------------------------------------------
  // SECTION 1: Web Crypto API Benchmark (Browser Path via crypto.subtle)
  // ---------------------------------------------------------------------------
  console.log('--- 1. Web Crypto API Pipeline (Browser-Equivalent: crypto.subtle) ---');
  const subtle = globalThis.crypto.subtle;
  const aesKey = await subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  // Warmup WebCrypto
  for (let w = 0; w < warmupRuns; w++) {
    keccakHashFn(buffer);
    const iv = crypto.randomBytes(12);
    const d = keccakHashFn(buffer);
    const aad = new TextEncoder().encode(AAD_FIXED_LABEL + '0x' + d);
    await subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plainBytes);
    await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, aesKey, plainBytes);
  }

  const webcrypto_directHashTimings = [];
  const webcrypto_gcmNoAadTimings = [];
  const webcrypto_gcmWithAadTimings = [];

  for (let i = 0; i < iterations; i++) {
    // 1. Direct Keccak-256 Hashing Baseline
    const s1 = performance.now();
    keccakHashFn(buffer);
    const e1 = performance.now();
    webcrypto_directHashTimings.push(e1 - s1);

    // 2. Keccak-256 Hash + AES-256-GCM Encryption (WITHOUT AAD)
    const s2 = performance.now();
    keccakHashFn(buffer);
    const iv2 = crypto.randomBytes(12);
    await subtle.encrypt({ name: 'AES-GCM', iv: iv2 }, aesKey, plainBytes);
    const e2 = performance.now();
    webcrypto_gcmNoAadTimings.push(e2 - s2);

    // 3. Keccak-256 Hash + AES-256-GCM Encryption (WITH AAD: label + digest H)
    // Real client flow: compute H, form AAD, encrypt with AAD
    const s3 = performance.now();
    const digest3 = keccakHashFn(buffer);
    const aad3 = new TextEncoder().encode(AAD_FIXED_LABEL + '0x' + digest3);
    const iv3 = crypto.randomBytes(12);
    await subtle.encrypt({ name: 'AES-GCM', iv: iv3, additionalData: aad3 }, aesKey, plainBytes);
    const e3 = performance.now();
    webcrypto_gcmWithAadTimings.push(e3 - s3);
  }

  const statsWeb_hash = computeStats(webcrypto_directHashTimings, sizeBytes);
  const statsWeb_noAad = computeStats(webcrypto_gcmNoAadTimings, sizeBytes);
  const statsWeb_withAad = computeStats(webcrypto_gcmWithAadTimings, sizeBytes);

  const webOverheadEncryptOnly = statsWeb_noAad.meanMs - statsWeb_hash.meanMs;
  const webOverheadTotal = statsWeb_withAad.meanMs - statsWeb_hash.meanMs;
  const webOverheadAadIsolated = statsWeb_withAad.meanMs - statsWeb_noAad.meanMs;

  const webCryptoTable = [
    {
      'Pipeline Component': '1. Direct Keccak-256 Hashing Baseline',
      'Mean (ms)': statsWeb_hash.meanMs,
      'Std Dev (ms)': statsWeb_hash.stdDevMs,
      '95% CI (ms)': statsWeb_hash.ci95String,
      'Overhead vs Baseline': 'Baseline (0.00 ms)',
      'Throughput (MB/s)': statsWeb_hash.throughputMBps
    },
    {
      'Pipeline Component': '2. AES-256-GCM Encrypt (without AAD) + Keccak',
      'Mean (ms)': statsWeb_noAad.meanMs,
      'Std Dev (ms)': statsWeb_noAad.stdDevMs,
      '95% CI (ms)': statsWeb_noAad.ci95String,
      'Overhead vs Baseline': `+${webOverheadEncryptOnly.toFixed(4)} ms`,
      'Throughput (MB/s)': statsWeb_noAad.throughputMBps
    },
    {
      'Pipeline Component': '3. AES-256-GCM Encrypt (with AAD) + Keccak',
      'Mean (ms)': statsWeb_withAad.meanMs,
      'Std Dev (ms)': statsWeb_withAad.stdDevMs,
      '95% CI (ms)': statsWeb_withAad.ci95String,
      'Overhead vs Baseline': `+${webOverheadTotal.toFixed(4)} ms`,
      'Throughput (MB/s)': statsWeb_withAad.throughputMBps
    }
  ];
  console.table(webCryptoTable);
  console.log(`>> WebCrypto Isolated AAD Incremental Cost (Row 3 - Row 2): ${webOverheadAadIsolated >= 0 ? '+' : ''}${webOverheadAadIsolated.toFixed(4)} ms\n`);

  // ---------------------------------------------------------------------------
  // SECTION 2: Node.js / OpenSSL Benchmark (Backend Relay / CLI Engine)
  // ---------------------------------------------------------------------------
  console.log('--- 2. Node.js / OpenSSL Pipeline (crypto.createCipheriv) ---');

  // Warmup OpenSSL
  for (let w = 0; w < warmupRuns; w++) {
    keccakHashFn(buffer);
    const k = crypto.randomBytes(32);
    const v = crypto.randomBytes(12);
    const c1 = crypto.createCipheriv('aes-256-gcm', k, v);
    Buffer.concat([c1.update(buffer), c1.final()]);
    c1.getAuthTag();

    const d = keccakHashFn(buffer);
    const c2 = crypto.createCipheriv('aes-256-gcm', k, v);
    c2.setAAD(Buffer.from(AAD_FIXED_LABEL + '0x' + d, 'utf8'));
    Buffer.concat([c2.update(buffer), c2.final()]);
    c2.getAuthTag();
  }

  const openssl_directHashTimings = [];
  const openssl_gcmNoAadTimings = [];
  const openssl_gcmWithAadTimings = [];

  for (let i = 0; i < iterations; i++) {
    // 1. Direct Keccak-256 Hashing Baseline
    const s1 = performance.now();
    keccakHashFn(buffer);
    const e1 = performance.now();
    openssl_directHashTimings.push(e1 - s1);

    // 2. Keccak-256 Hash + OpenSSL AES-256-GCM (WITHOUT AAD)
    const s2 = performance.now();
    keccakHashFn(buffer);
    const k2 = crypto.randomBytes(32);
    const iv2 = crypto.randomBytes(12);
    const cipher2 = crypto.createCipheriv('aes-256-gcm', k2, iv2);
    Buffer.concat([cipher2.update(buffer), cipher2.final()]);
    cipher2.getAuthTag();
    const e2 = performance.now();
    openssl_gcmNoAadTimings.push(e2 - s2);

    // 3. Keccak-256 Hash + OpenSSL AES-256-GCM (WITH AAD: label + digest H)
    const s3 = performance.now();
    const digest3 = keccakHashFn(buffer);
    const k3 = crypto.randomBytes(32);
    const iv3 = crypto.randomBytes(12);
    const cipher3 = crypto.createCipheriv('aes-256-gcm', k3, iv3);
    const aad3 = Buffer.from(AAD_FIXED_LABEL + '0x' + digest3, 'utf8');
    cipher3.setAAD(aad3);
    Buffer.concat([cipher3.update(buffer), cipher3.final()]);
    cipher3.getAuthTag();
    const e3 = performance.now();
    openssl_gcmWithAadTimings.push(e3 - s3);
  }

  const statsNode_hash = computeStats(openssl_directHashTimings, sizeBytes);
  const statsNode_noAad = computeStats(openssl_gcmNoAadTimings, sizeBytes);
  const statsNode_withAad = computeStats(openssl_gcmWithAadTimings, sizeBytes);

  const nodeOverheadEncryptOnly = statsNode_noAad.meanMs - statsNode_hash.meanMs;
  const nodeOverheadTotal = statsNode_withAad.meanMs - statsNode_hash.meanMs;
  const nodeOverheadAadIsolated = statsNode_withAad.meanMs - statsNode_noAad.meanMs;

  const nodeCryptoTable = [
    {
      'Pipeline Component': '1. Direct Keccak-256 Hashing Baseline',
      'Mean (ms)': statsNode_hash.meanMs,
      'Std Dev (ms)': statsNode_hash.stdDevMs,
      '95% CI (ms)': statsNode_hash.ci95String,
      'Overhead vs Baseline': 'Baseline (0.00 ms)',
      'Throughput (MB/s)': statsNode_hash.throughputMBps
    },
    {
      'Pipeline Component': '2. AES-256-GCM Encrypt (without AAD) + Keccak',
      'Mean (ms)': statsNode_noAad.meanMs,
      'Std Dev (ms)': statsNode_noAad.stdDevMs,
      '95% CI (ms)': statsNode_noAad.ci95String,
      'Overhead vs Baseline': `+${nodeOverheadEncryptOnly.toFixed(4)} ms`,
      'Throughput (MB/s)': statsNode_noAad.throughputMBps
    },
    {
      'Pipeline Component': '3. AES-256-GCM Encrypt (with AAD) + Keccak',
      'Mean (ms)': statsNode_withAad.meanMs,
      'Std Dev (ms)': statsNode_withAad.stdDevMs,
      '95% CI (ms)': statsNode_withAad.ci95String,
      'Overhead vs Baseline': `+${nodeOverheadTotal.toFixed(4)} ms`,
      'Throughput (MB/s)': statsNode_withAad.throughputMBps
    }
  ];
  console.table(nodeCryptoTable);
  console.log(`>> Node.js OpenSSL Isolated AAD Incremental Cost (Row 3 - Row 2): ${nodeOverheadAadIsolated >= 0 ? '+' : ''}${nodeOverheadAadIsolated.toFixed(4)} ms\n`);

  // Network & Consensus Delay Baselines
  const networkBaselines = [
    {
      'Operation Type': 'Smart Contract Read Call (canViewDocument)',
      'Target Layer': 'Local RPC Node / Sepolia Node',
      'Expected Latency Range': '4 - 15 ms',
      'Consensus Dependency': 'None (eth_call)'
    },
    {
      'Operation Type': 'IPFS Gateway Pin / Fetch (Cold Cache)',
      'Target Layer': 'Pinata / Public IPFS Gateway',
      'Expected Latency Range': '1,200 - 5,300 ms',
      'Consensus Dependency': 'P2P Routing & Gateway CDN'
    },
    {
      'Operation Type': 'Ethereum Sepolia Tx Confirmation',
      'Target Layer': 'Ethereum Testnet Consensus',
      'Expected Latency Range': '12,000 - 36,000 ms',
      'Consensus Dependency': 'PoS Block Production (12s slot time)'
    }
  ];

  console.log('--- 3. Network & Consensus Layer Baselines ---');
  console.table(networkBaselines);

  // Export raw per-run observation vectors to JSON
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown CPU';
  const cpuSpeedMHz = cpus.length > 0 ? cpus[0].speed : 0;
  const cpuCores = cpus.length;
  const totalMemoryGB = `${(os.totalmem() / (1024 ** 3)).toFixed(2)} GB`;
  const freeMemoryGB = `${(os.freemem() / (1024 ** 3)).toFixed(2)} GB`;

  const rawExportData = {
    systemInfo: {
      osPlatform: os.platform(),
      osRelease: os.release(),
      osType: os.type(),
      arch: os.arch(),
      cpuModel,
      cpuSpeedMHz,
      cpuCores,
      totalMemoryGB,
      freeMemoryGB,
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      opensslVersion: process.versions.openssl
    },
    metadata: {
      timestamp: new Date().toISOString(),
      payloadSizeKB: sizeKB,
      iterations,
      warmupRuns,
      keccakEngine,
      isNativeKeccak: keccakIsNative,
      cpuModel,
      osPlatform: os.platform(),
      nodeVersion: process.version,
      opensslVersion: process.versions.openssl,
      hashAlgorithm: `Keccak-256 (${keccakEngine})`,
      cipherAlgorithm: 'AES-256-GCM'
    },
    webCrypto: {
      directHash: statsWeb_hash,
      encryptNoAadPlusHash: statsWeb_noAad,
      encryptWithAadPlusHash: statsWeb_withAad,
      overheadEncryptOnlyMs: parseFloat(webOverheadEncryptOnly.toFixed(4)),
      overheadTotalMs: parseFloat(webOverheadTotal.toFixed(4)),
      overheadAadIsolatedMs: parseFloat(webOverheadAadIsolated.toFixed(4))
    },
    nodeOpenSSL: {
      directHash: statsNode_hash,
      encryptNoAadPlusHash: statsNode_noAad,
      encryptWithAadPlusHash: statsNode_withAad,
      overheadEncryptOnlyMs: parseFloat(nodeOverheadEncryptOnly.toFixed(4)),
      overheadTotalMs: parseFloat(nodeOverheadTotal.toFixed(4)),
      overheadAadIsolatedMs: parseFloat(nodeOverheadAadIsolated.toFixed(4))
    }
  };

  const rawJsonPath = path.join(__dirname, 'baseline_benchmark_raw.json');
  fs.writeFileSync(rawJsonPath, JSON.stringify(rawExportData, null, 2), 'utf8');
  console.log(`\n[+] Exported complete raw per-run baseline observations to: ${rawJsonPath}`);

  // Canonical baselineResults array formatted for master report / test suites
  const baselineResults = [
    {
      'Pipeline Component': 'Direct Keccak-256 Hashing Baseline (1MB)',
      'Mean Latency (ms)': statsWeb_hash.meanMs,
      'Std Dev (ms)': statsWeb_hash.stdDevMs,
      'Overhead (ms)': '0.00 ms (Baseline)',
      Percentage: '100%'
    },
    {
      'Pipeline Component': 'AES-256-GCM Encrypt (without AAD) + Keccak-256 Hash',
      'Mean Latency (ms)': statsWeb_noAad.meanMs,
      'Std Dev (ms)': statsWeb_noAad.stdDevMs,
      'Overhead (ms)': `+${webOverheadEncryptOnly.toFixed(4)} ms`,
      Percentage: `+${((webOverheadEncryptOnly / statsWeb_hash.meanMs) * 100).toFixed(2)}%`
    },
    {
      'Pipeline Component': 'AES-256-GCM Encrypt (with AAD) + Keccak-256 Hash',
      'Mean Latency (ms)': statsWeb_withAad.meanMs,
      'Std Dev (ms)': statsWeb_withAad.stdDevMs,
      'Overhead (ms)': `+${webOverheadTotal.toFixed(4)} ms`,
      Percentage: `+${((webOverheadTotal / statsWeb_hash.meanMs) * 100).toFixed(2)}%`
    }
  ];

  return {
    baselineResults,
    networkBaselines,
    webCryptoTable,
    nodeCryptoTable,
    encryptionOverheadMs: parseFloat(webOverheadTotal.toFixed(4)),
    isolatedAadOverheadMs: parseFloat(webOverheadAadIsolated.toFixed(4)),
    statsWebCrypto: {
      directHash: statsWeb_hash,
      noAad: statsWeb_noAad,
      withAad: statsWeb_withAad
    },
    statsNodeOpenSSL: {
      directHash: statsNode_hash,
      noAad: statsNode_noAad,
      withAad: statsNode_withAad
    }
  };
}

if (process.argv[1] && process.argv[1].endsWith('benchmark_network_baselines.js')) {
  runBaselineBenchmarks({ iterations: 50, warmupRuns: 10, sizeKB: 1024 });
}

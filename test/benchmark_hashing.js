import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { performance } from 'node:perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getSystemInfo() {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown CPU';
  const cpuSpeedMHz = cpus.length > 0 ? cpus[0].speed : 0;
  const cpuCores = cpus.length;
  const totalMemoryGB = (os.totalmem() / (1024 ** 3)).toFixed(2);
  const freeMemoryGB = (os.freemem() / (1024 ** 3)).toFixed(2);

  let ethersVersion = '6.x';
  try {
    const pkgPath = path.join(__dirname, '../package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      ethersVersion = pkg.devDependencies?.ethers || pkg.dependencies?.ethers || '6.16.0';
    }
  } catch (err) {
    // fallback
  }

  return {
    osPlatform: os.platform(),
    osRelease: os.release(),
    osType: os.type(),
    arch: os.arch(),
    cpuModel,
    cpuSpeedMHz,
    cpuCores,
    totalMemoryGB: `${totalMemoryGB} GB`,
    freeMemoryGB: `${freeMemoryGB} GB`,
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    opensslVersion: process.versions.openssl,
    ethersVersion
  };
}

function computeStatistics(timings, payloadSizeBytes) {
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

  const ci95LowerMs = Math.max(0, meanMs - ci95MarginMs);
  const ci95UpperMs = meanMs + ci95MarginMs;

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
    ci95String: `[${ci95LowerMs.toFixed(4)}, ${ci95UpperMs.toFixed(4)}] ms`,
    throughputMBps: parseFloat(throughputMBps.toFixed(2))
  };
}

export function runHashBenchmarks(options = {}) {
  const iterations = options.iterations || 25;
  const warmupRuns = options.warmupRuns || 5;
  const fileSizesKB = options.fileSizesKB || [100, 1024, 5120];

  const systemInfo = getSystemInfo();

  console.log('===============================================================');
  console.log('         BDVS RIGOROUS STATISTICAL HASH BENCHMARK (N=25)        ');
  console.log('===============================================================');
  console.log(`OS           : ${systemInfo.osType} ${systemInfo.osRelease} (${systemInfo.arch})`);
  console.log(`CPU          : ${systemInfo.cpuModel} @ ${systemInfo.cpuSpeedMHz} MHz (${systemInfo.cpuCores} cores)`);
  console.log(`RAM          : ${systemInfo.totalMemoryGB} (Free: ${systemInfo.freeMemoryGB})`);
  console.log(`Node.js      : ${systemInfo.nodeVersion} (V8: ${systemInfo.v8Version}, OpenSSL: ${systemInfo.opensslVersion})`);
  console.log(`Ethers.js    : ${systemInfo.ethersVersion}`);
  console.log(`Sample Size  : N = ${iterations} runs per payload (Warmup: ${warmupRuns})`);
  console.log('---------------------------------------------------------------\n');

  const hashAlgorithms = [
    {
      name: 'MD5',
      outputBits: 128,
      fn: (buf) => crypto.createHash('md5').update(buf).digest('hex')
    },
    {
      name: 'SHA-256',
      outputBits: 256,
      fn: (buf) => crypto.createHash('sha256').update(buf).digest('hex')
    },
    {
      name: 'SHA-3 (256)',
      outputBits: 256,
      fn: (buf) => crypto.createHash('sha3-256').update(buf).digest('hex')
    },
    {
      name: 'Blake2b (512/256)',
      outputBits: 256,
      fn: (buf) => crypto.createHash('blake2b512').update(buf).digest('hex').substring(0, 64)
    },
    {
      name: 'Keccak-256 (ethers)',
      outputBits: 256,
      fn: (buf) => ethers.keccak256(buf)
    }
  ];

  const resultsByPayload = [];

  for (const sizeKB of fileSizesKB) {
    const sizeBytes = sizeKB * 1024;
    const label = sizeKB >= 1024 ? `${sizeKB / 1024} MB` : `${sizeKB} KB`;
    console.log(`[+] Benchmarking ${label} payload buffer (N=${iterations} iterations)...`);
    const buffer = crypto.randomBytes(sizeBytes);

    const payloadResult = {
      sizeKB,
      label,
      sizeBytes,
      algorithms: {}
    };

    for (const algo of hashAlgorithms) {
      for (let w = 0; w < warmupRuns; w++) {
        algo.fn(buffer);
      }

      const timings = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        algo.fn(buffer);
        const end = performance.now();
        timings.push(end - start);
      }

      const stats = computeStatistics(timings, sizeBytes);
      payloadResult.algorithms[algo.name] = {
        name: algo.name,
        outputBits: algo.outputBits,
        ...stats
      };
    }

    resultsByPayload.push(payloadResult);
  }

  return {
    systemInfo,
    config: { iterations, warmupRuns, fileSizesKB },
    resultsByPayload,
    timestamp: new Date().toISOString()
  };
}

if (process.argv[1] && process.argv[1].endsWith('benchmark_hashing.js')) {
  const benchmarkData = runHashBenchmarks({ iterations: 25, warmupRuns: 5 });

  console.log('\n===============================================================');
  console.log('              STATISTICAL RESULTS WITH 95% CI                   ');
  console.log('===============================================================');

  for (const p of benchmarkData.resultsByPayload) {
    console.log(`\n--- Payload Size: ${p.label} (${p.sizeBytes.toLocaleString()} bytes) ---`);
    console.table(
      Object.values(p.algorithms).map((a) => ({
        Algorithm: a.name,
        'Mean (ms)': a.meanMs,
        'Std Dev (ms)': a.stdDevMs,
        '95% CI Range (ms)': a.ci95String,
        'Throughput (MB/s)': a.throughputMBps
      }))
    );
  }
}

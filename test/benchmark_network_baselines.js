import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

export function runBaselineBenchmarks(options = {}) {
  const iterations = options.iterations || 30;
  const sizeKB = options.sizeKB || 1024; // 1 MB
  const buffer = crypto.randomBytes(sizeKB * 1024);

  console.log('===============================================================');
  console.log('       BDVS ARCHITECTURAL BASELINE COMPARISON BENCHMARKS        ');
  console.log('===============================================================');

  // Baseline 1: Unencrypted Direct Hash vs AES-256-GCM Encryption + Hash
  const directHashTimings = [];
  const encryptedPipelineTimings = [];

  for (let i = 0; i < iterations; i++) {
    // Direct Hashing Baseline
    const s1 = performance.now();
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const e1 = performance.now();
    directHashTimings.push(e1 - s1);

    // AES-256-GCM Encryption + Hashing Pipeline Baseline
    const s2 = performance.now();
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag();
    const encHash = crypto.createHash('sha256').update(encrypted).digest('hex');
    const e2 = performance.now();
    encryptedPipelineTimings.push(e2 - s2);
  }

  const directMean = directHashTimings.reduce((a, b) => a + b, 0) / iterations;
  const pipelineMean = encryptedPipelineTimings.reduce((a, b) => a + b, 0) / iterations;
  const encryptionOverheadMs = pipelineMean - directMean;
  const overheadPercentage = ((encryptionOverheadMs / directMean) * 100).toFixed(2);

  const baselineResults = [
    {
      'Pipeline Component': 'Direct Hashing Baseline (1MB Plaintext)',
      'Mean Latency (ms)': parseFloat(directMean.toFixed(4)),
      'Overhead (ms)': '0.00 ms (Baseline)',
      Percentage: '100%'
    },
    {
      'Pipeline Component': 'AES-256-GCM Encrypt + Hash Pipeline',
      'Mean Latency (ms)': parseFloat(pipelineMean.toFixed(4)),
      'Overhead (ms)': `+${encryptionOverheadMs.toFixed(4)} ms`,
      Percentage: `+${overheadPercentage}%`
    }
  ];

  console.table(baselineResults);

  // Network & Consensus Delay Baselines (Empirical literature vs testnet measurements)
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

  console.log('\n--- NETWORK & CONSENSUS LAYER BASELINES ---');
  console.table(networkBaselines);

  return {
    baselineResults,
    networkBaselines,
    encryptionOverheadMs: parseFloat(encryptionOverheadMs.toFixed(4))
  };
}

if (process.argv[1] && process.argv[1].endsWith('benchmark_network_baselines.js')) {
  runBaselineBenchmarks();
}

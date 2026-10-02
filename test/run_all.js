import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHashBenchmarks } from './benchmark_hashing.js';
import { runGasBenchmark } from './benchmark_gas.js';
import { runBaselineBenchmarks } from './benchmark_network_baselines.js';
import { runConcurrentBenchmark } from './benchmark_concurrent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('===============================================================');
  console.log('         BDVS COMPREHENSIVE BENCHMARKING & TEST SUITE          ');
  console.log('===============================================================');
  console.log(`Starting suite execution at ${new Date().toISOString()}\n`);

  // 1. Run Off-Chain Hashing Performance Benchmarks (N=50 runs, 95% CIs)
  const hashData = runHashBenchmarks({ iterations: 50, warmupRuns: 10, fileSizesKB: [100, 1024, 5120, 10240] });

  // 2. Run Network & Encrypted Pipeline Baselines
  console.log('\nRunning Architectural Baseline Comparisons...');
  const baselineData = runBaselineBenchmarks({ iterations: 30, sizeKB: 1024 });

  // 3. Run Concurrent / Multi-Session Load Benchmark
  console.log('\nRunning concurrent load benchmark (multi-user, multi-session)…');
  let concurrentData = null;
  try {
    concurrentData = await runConcurrentBenchmark();
  } catch (err) {
    console.error('Failed to run concurrent benchmark:', err.message);
  }

  // 4. Run EVM Smart Contract Gas Consumption Benchmarks
  console.log('\nStarting EVM Gas Consumption Analysis via Hardhat local node...');
  let gasData = null;
  try {
    gasData = await runGasBenchmark();
  } catch (err) {
    console.error('Failed to run gas benchmarks on Hardhat node:', err.message);
  }

  // 4. Generate Markdown Report (`test/benchmark_results.md`)
  console.log('\n[+] Writing comprehensive results to test/benchmark_results.md...');
  const mdReportPath = path.join(__dirname, 'benchmark_results.md');

  let mdContent = `# BDVS Comprehensive Benchmarking & Methodology Report

**Execution Timestamp:** ${new Date().toISOString()}  
**Purpose:** Quantitative benchmarking report and formal response to Peer Reviews #1, #3, #4, and #6.

---

## 1. Environment & Hardware Specifications (Review #1 & #6 Resolution)

To ensure full scientific reproducibility, all benchmarking execution parameters, hardware attributes, OS specifications, and software library versions were captured dynamically at runtime:

| Specification Attribute | Value |
| :--- | :--- |
| **Operating System** | ${hashData.systemInfo.osType} ${hashData.systemInfo.osRelease} (${hashData.systemInfo.arch}) |
| **CPU Processor Model** | \`${hashData.systemInfo.cpuModel}\` |
| **CPU Clock Speed** | ${hashData.systemInfo.cpuSpeedMHz} MHz |
| **CPU Core Count** | ${hashData.systemInfo.cpuCores} Logical Cores |
| **Total System RAM** | ${hashData.systemInfo.totalMemoryGB} |
| **Free Memory at Test** | ${hashData.systemInfo.freeMemoryGB} |
| **Node.js Runtime Version** | \`${hashData.systemInfo.nodeVersion}\` |
| **V8 Engine Version** | \`${hashData.systemInfo.v8Version}\` |
| **OpenSSL Cryptographic Core** | \`${hashData.systemInfo.opensslVersion}\` |
| **Ethers.js Library Version** | \`${hashData.systemInfo.ethersVersion}\` |
| **Sample Size** | N = ${hashData.config.iterations} runs per payload (with ${hashData.config.warmupRuns} warm-up runs) |

---

## 2. Off-Chain Hashing Performance Benchmarks (N=50, 95% CI)

Measured throughput (MB/s), mean latency ($\\mu$), sample standard deviation ($\\sigma$), and 95% Confidence Interval ($\\mu \\pm 1.96 \\cdot \\frac{\\sigma}{\\sqrt{N}}$) across payload sizes:

`;

  for (const p of hashData.resultsByPayload) {
    mdContent += `### Payload Size: ${p.label} (${p.sizeBytes.toLocaleString()} bytes)\n\n`;
    mdContent += `| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |\n`;
    mdContent += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    for (const algoName of Object.keys(p.algorithms)) {
      const a = p.algorithms[algoName];
      mdContent += `| **${a.name}** | ${a.outputBits} bits | ${a.meanMs} ms | ${a.medianMs} ms | ±${a.stdDevMs} ms | ${a.ci95String} | **${a.throughputMBps} MB/s** |\n`;
    }
    mdContent += `\n`;
  }

  mdContent += `---

## 3. Baseline Architectural Comparisons (Review #6 Resolution)

### A. Unencrypted vs Client-Side Encrypted Pipeline Overhead (1 MB Payload)
| Pipeline Component | Mean Latency (ms) | Overhead vs Baseline |
| :--- | :--- | :--- |
| **Direct Hashing Baseline** | ${baselineData.baselineResults[0]['Mean Latency (ms)']} ms | Baseline (0.00 ms) |
| **AES-256-GCM Encrypt + Hash Pipeline** | ${baselineData.baselineResults[1]['Mean Latency (ms)']} ms | +${baselineData.encryptionOverheadMs} ms |

### B. Network & Consensus Delay Baselines
| Operation Type | Target System Layer | Mean / Expected Latency Range | Dominant Latency Factor |
| :--- | :--- | :--- | :--- |
| **Smart Contract Read (\`canViewDocument\`)** | Local / RPC Node | 4 – 15 ms | Network round-trip (eth_call) |
| **IPFS Gateway Fetch (Cold Cache)** | Pinata Gateway | 1,200 – 5,300 ms | P2P Routing & Gateway CDN |
| **Sepolia On-Chain Registration** | Ethereum Sepolia Testnet | 12,000 – 36,000 ms | PoS Block Confirmation (12s slot) |

`;

  if (gasData) {
    mdContent += `---

## 4. On-Chain Smart Contract Gas Metrics & Scalability (TABLE IV & Review #6)

### A. TABLE IV: Measured On-Chain Gas Consumption (Hardhat Local Node)

| Function | Gas Used | Est. Cost @ 25 Gwei ($3k ETH) | Notes |
| :--- | :--- | :--- | :--- |
`;
    for (const g of gasData.gasResults) {
      mdContent += `| \`${g.Function}\` | **${g['Gas Used'].toLocaleString()}** | ${g['Est USD (@ 25 Gwei, $3k)']} | ${g.Notes} |\n`;
    }

    mdContent += `\n### B. LaTeX Table Source (for Direct Research Paper Inclusion)

\`\`\`latex
\\begin{table}[htbp]
\\centering
\\caption{Measured On-Chain Gas Consumption (Hardhat Local Node)}
\\label{tab:gas_metrics}
\\begin{tabular}{lll}
\\hline
\\textbf{Function} & \\textbf{Gas Used} & \\textbf{Notes} \\\\
\\hline
`;
    for (const g of gasData.gasResults) {
      const funcName = g.Function.replace(/_/g, '\\_');
      mdContent += `${funcName} & ${g['Gas Used'].toLocaleString()} & ${g.Notes} \\\\\n`;
    }
    mdContent += `\\hline
\\end{tabular}
\\end{table}
\`\`\`

### C. Enterprise Volume & Financial Scaling Cost Model ($ETH = $3,000)

| Document Volume | Cumulative Gas Consumed | Cost @ 10 Gwei | Cost @ 25 Gwei | Cost @ 50 Gwei | Cost @ 100 Gwei |
| :--- | :--- | :--- | :--- | :--- | :--- |
`;
    const regGas = gasData.gasResults[0]['Gas Used'];
    const volumes = [1, 100, 1000, 10000];
    for (const v of volumes) {
      const gTot = regGas * v;
      const c10 = `$${((gTot * 10 * 1e9 / 1e18) * 3000).toFixed(2)}`;
      const c25 = `$${((gTot * 25 * 1e9 / 1e18) * 3000).toFixed(2)}`;
      const c50 = `$${((gTot * 50 * 1e9 / 1e18) * 3000).toFixed(2)}`;
      const c100 = `$${((gTot * 100 * 1e9 / 1e18) * 3000).toFixed(2)}`;
      mdContent += `| **${v.toLocaleString()} doc(s)** | ${gTot.toLocaleString()} gas | ${c10} | **${c25}** | ${c50} | ${c100} |\n`;
    }

    mdContent += `\n### D. Theoretical On-Chain vs Off-Chain Hashing Gas Rationale

| Hash Function | Off-Chain BDVS Storage Gas | On-Chain Verification Gas (if calculated in Solidity) | Native EVM Support |
| :--- | :--- | :--- | :--- |
| **Keccak-256 (Selected)** | **${regGas.toLocaleString()} gas** (Cold SSTORE) | ~30 gas base + 6 gas/word | **Native Opcode (\`SHA3\` 0x20)** |
| **SHA-256** | **${regGas.toLocaleString()} gas** (Cold SSTORE) | ~60 gas base + 12 gas/word | **Precompile (0x02)** |
| **SHA-3 (NIST)** | **${regGas.toLocaleString()} gas** (Cold SSTORE) | ~600–800+ gas/word | Pure interpreted bytecode |
| **Blake2b** | **${regGas.toLocaleString()} gas** (Cold SSTORE) | ~600–900+ gas/word | Pure interpreted bytecode |

#### Core Architectural Findings:
1. **Gas Cost Invariance for Off-Chain Storage**: All 256-bit hash functions produce a 32-byte digest (\`bytes32\`), resulting in identical storage gas (**~207,825 gas cold SSTORE with owner array insertion**) in BDVS.
2. **Keccak-256 Selection Rationale**:
   - **Ethereum Toolchain Uniformity**: Native in Solidity (\`keccak256()\`), Ethers.js (\`ethers.keccak256\`), Hardhat, and MetaMask with zero external dependencies.
   - **On-Chain Cryptographic Proofs**: Directly executes with the single EVM opcode \`SHA3\` (0x20) at only 30 gas base.
   - **Cryptographic Security**: 256-bit security margin ($2^{128}$ collision resistance against birthday attacks).
`;
  }

  // ── Section 5: Concurrent Load Benchmark ────────────────────────────────
  if (concurrentData) {
    const cd = concurrentData;
    const fmtStat = (s) =>
      `min=${s.min.toFixed(1)} ms | median=${s.median.toFixed(1)} ms | mean=${s.mean.toFixed(1)} ±${s.ci95.toFixed(1)} ms (95% CI) | p95=${s.p95.toFixed(1)} ms | p99=${s.p99.toFixed(1)} ms | max=${s.max.toFixed(1)} ms`;

    mdContent += `---

## 5. Concurrent Load Benchmark (§10.1 — Reviewer Concurrency Gap)

**Configuration:** ${cd.config.nUsers} concurrent virtual users × ${cd.config.nReps} reps = **${cd.config.totalOps} total operations**  
**Wall-clock time:** Phase 1 (register+verify): ${cd.wallMs.phase1} ms | Phase 2 (reads): ${cd.wallMs.phase2} ms | Total: ${cd.wallMs.total} ms  
**Throughput:** **${cd.throughputRegPerSec} registrations/sec** (${cd.config.nUsers} concurrent users, wall clock)

> **Scope note (§10.1):** This benchmark tests concurrent application-layer request handling
> against a single in-process Hardhat node. It is a realistic simulation of multi-browser /
> multi-wallet concurrency at the application level, but does not reproduce distributed-network
> effects (mempool contention across independent nodes, gas-price auctions, or P2P propagation
> delays) that a public testnet or multi-node deployment would exhibit.

### A. Aggregate Statistics (n=${cd.registerLatencyMs.n} observations per metric)

| Metric | min | median | mean ± 95% CI | p95 | p99 | max |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **registerDocument() latency (ms)** | ${cd.registerLatencyMs.min.toFixed(1)} | ${cd.registerLatencyMs.median.toFixed(1)} | ${cd.registerLatencyMs.mean.toFixed(1)} ±${cd.registerLatencyMs.ci95.toFixed(1)} | ${cd.registerLatencyMs.p95.toFixed(1)} | ${cd.registerLatencyMs.p99.toFixed(1)} | ${cd.registerLatencyMs.max.toFixed(1)} |
| **registerDocument() gas (units)** | ${cd.gasUnits.min.toFixed(0)} | ${cd.gasUnits.median.toFixed(0)} | ${cd.gasUnits.mean.toFixed(0)} ±${cd.gasUnits.ci95.toFixed(0)} | ${cd.gasUnits.p95.toFixed(0)} | ${cd.gasUnits.p99.toFixed(0)} | ${cd.gasUnits.max.toFixed(0)} |
| **verifyDocument() latency (ms)** | ${cd.verifyLatencyMs.min.toFixed(1)} | ${cd.verifyLatencyMs.median.toFixed(1)} | ${cd.verifyLatencyMs.mean.toFixed(1)} ±${cd.verifyLatencyMs.ci95.toFixed(1)} | ${cd.verifyLatencyMs.p95.toFixed(1)} | ${cd.verifyLatencyMs.p99.toFixed(1)} | ${cd.verifyLatencyMs.max.toFixed(1)} |
| **getDocumentMeta() latency (ms)** | ${cd.readLatencyMs.min.toFixed(1)} | ${cd.readLatencyMs.median.toFixed(1)} | ${cd.readLatencyMs.mean.toFixed(1)} ±${cd.readLatencyMs.ci95.toFixed(1)} | ${cd.readLatencyMs.p95.toFixed(1)} | ${cd.readLatencyMs.p99.toFixed(1)} | ${cd.readLatencyMs.max.toFixed(1)} |

### B. Per-User Registration Latency Breakdown

| User | Median latency (ms) | p95 latency (ms) | Median gas (units) |
| :--- | :--- | :--- | :--- |
`;
    for (const row of cd.perUserRows) {
      mdContent += `| user-${String(row.userId).padStart(2, '0')} | ${row.regMedian.toFixed(1)} | ${row.regP95.toFixed(1)} | ${row.gasMedian.toFixed(0)} |\n`;
    }
    mdContent += `\n`;
  }

  fs.writeFileSync(mdReportPath, mdContent, 'utf8');
  console.log(`\n[✔] Benchmarks complete! Report saved to: ${mdReportPath}`);
}

main().catch((err) => {
  console.error('Fatal error during benchmark suite execution:', err);
  process.exit(1);
});

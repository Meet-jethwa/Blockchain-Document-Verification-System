# BDVS Comprehensive Benchmarking & Methodology Report

**Execution Timestamp:** 2026-10-03T05:27:30.368Z  
**Purpose:** Quantitative benchmarking report and formal response to Peer Reviews #1, #3, #4, and #6.

---

## 1. Environment & Hardware Specifications (Review #1 & #6 Resolution)

To ensure full scientific reproducibility, all benchmarking execution parameters, hardware attributes, OS specifications, and software library versions were captured dynamically at runtime:

| Specification Attribute | Value |
| :--- | :--- |
| **Operating System** | Windows_NT 10.0.26200 (x64) |
| **CPU Processor Model** | `12th Gen Intel(R) Core(TM) i9-12900H` |
| **CPU Clock Speed** | 2918 MHz |
| **CPU Core Count** | 20 Logical Cores |
| **Total System RAM** | 15.71 GB |
| **Free Memory at Test** | 1.38 GB |
| **Node.js Runtime Version** | `v22.12.0` |
| **V8 Engine Version** | `12.4.254.21-node.21` |
| **OpenSSL Cryptographic Core** | `3.0.15+quic` |
| **Ethers.js Library Version** | `^6.16.0` |
| **Sample Size** | N = 50 runs per payload (with 10 warm-up runs) |

---

## 2. Off-Chain Hashing Performance Benchmarks (N=50, 95% CI)

Measured throughput (MB/s), mean latency ($\mu$), sample standard deviation ($\sigma$), and 95% Confidence Interval ($\mu \pm 1.96 \cdot \frac{\sigma}{\sqrt{N}}$) across payload sizes:

### Payload Size: 100 KB (1,02,400 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 0.1613 ms | 0.1558 ms | ±0.0176 ms | [0.1564, 0.1661] ms | **605.49 MB/s** |
| **SHA-256** | 256 bits | 0.0714 ms | 0.068 ms | ±0.0126 ms | [0.0679, 0.0749] ms | **1367.28 MB/s** |
| **SHA-3 (256)** | 256 bits | 0.2285 ms | 0.2259 ms | ±0.0113 ms | [0.2254, 0.2317] ms | **427.33 MB/s** |
| **Blake2b (512/256)** | 256 bits | 0.1864 ms | 0.1808 ms | ±0.0211 ms | [0.1805, 0.1922] ms | **523.95 MB/s** |
| **Keccak-256 (ethers)** | 256 bits | 6.0658 ms | 5.9538 ms | ±0.5573 ms | [5.9113, 6.2203] ms | **16.1 MB/s** |

### Payload Size: 1 MB (10,48,576 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 1.63 ms | 1.5993 ms | ±0.0673 ms | [1.6114, 1.6486] ms | **613.49 MB/s** |
| **SHA-256** | 256 bits | 0.7028 ms | 0.682 ms | ±0.0524 ms | [0.6883, 0.7173] ms | **1422.88 MB/s** |
| **SHA-3 (256)** | 256 bits | 2.3389 ms | 2.3154 ms | ±0.0805 ms | [2.3166, 2.3612] ms | **427.56 MB/s** |
| **Blake2b (512/256)** | 256 bits | 1.894 ms | 1.85 ms | ±0.1208 ms | [1.8605, 1.9275] ms | **527.98 MB/s** |
| **Keccak-256 (ethers)** | 256 bits | 62.0908 ms | 61.2783 ms | ±2.6055 ms | [61.3686, 62.8130] ms | **16.11 MB/s** |

### Payload Size: 5 MB (52,42,880 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 8.1743 ms | 8.071 ms | ±0.331 ms | [8.0825, 8.2660] ms | **611.68 MB/s** |
| **SHA-256** | 256 bits | 3.4784 ms | 3.4654 ms | ±0.0808 ms | [3.4560, 3.5008] ms | **1437.42 MB/s** |
| **SHA-3 (256)** | 256 bits | 11.9468 ms | 11.7463 ms | ±1.1091 ms | [11.6393, 12.2542] ms | **418.52 MB/s** |
| **Blake2b (512/256)** | 256 bits | 9.5791 ms | 9.4168 ms | ±0.5726 ms | [9.4204, 9.7379] ms | **521.97 MB/s** |
| **Keccak-256 (ethers)** | 256 bits | 316.5816 ms | 307.0343 ms | ±18.4505 ms | [311.4674, 321.6958] ms | **15.79 MB/s** |

### Payload Size: 10 MB (1,04,85,760 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 16.5725 ms | 16.3463 ms | ±0.6863 ms | [16.3823, 16.7627] ms | **603.41 MB/s** |
| **SHA-256** | 256 bits | 7.0426 ms | 6.9963 ms | ±0.2517 ms | [6.9728, 7.1124] ms | **1419.93 MB/s** |
| **SHA-3 (256)** | 256 bits | 23.6656 ms | 23.2005 ms | ±1.1103 ms | [23.3579, 23.9734] ms | **422.55 MB/s** |
| **Blake2b (512/256)** | 256 bits | 20.3811 ms | 19.1033 ms | ±2.795 ms | [19.6064, 21.1559] ms | **490.65 MB/s** |
| **Keccak-256 (ethers)** | 256 bits | 615.1439 ms | 607.1364 ms | ±21.2062 ms | [609.2658, 621.0219] ms | **16.26 MB/s** |

---

## 3. Baseline Architectural Comparisons (Review #6 Resolution)

### A. Unencrypted vs Client-Side Encrypted Pipeline Overhead (1 MB Payload)
| Pipeline Component | Mean Latency (ms) | Overhead vs Baseline |
| :--- | :--- | :--- |
| **Direct Hashing Baseline** | 0.6907 ms | Baseline (0.00 ms) |
| **AES-256-GCM Encrypt + Hash Pipeline** | 1.8382 ms | +1.1475 ms |

### B. Network & Consensus Delay Baselines
| Operation Type | Target System Layer | Mean / Expected Latency Range | Dominant Latency Factor |
| :--- | :--- | :--- | :--- |
| **Smart Contract Read (`canViewDocument`)** | Local / RPC Node | 4 – 15 ms | Network round-trip (eth_call) |
| **IPFS Gateway Fetch (Cold Cache)** | Pinata Gateway | 1,200 – 5,300 ms | P2P Routing & Gateway CDN |
| **Sepolia On-Chain Registration** | Ethereum Sepolia Testnet | 12,000 – 36,000 ms | PoS Block Confirmation (12s slot) |

---

## 4. On-Chain Smart Contract Gas Metrics & Scalability (TABLE IV & Review #6)

### A. TABLE IV: Measured On-Chain Gas Consumption (Hardhat Local Node)

| Function | Gas Used | Est. Cost @ 25 Gwei ($3k ETH) | Notes |
| :--- | :--- | :--- | :--- |
| `registerDocument` | **2,07,825** | $15.5869 | Cold SSTORE; first document (new struct slot) |
| `addDocumentVersion` | **1,85,479** | $13.9109 | Version digest appended to existing root mapping |
| `grantViewer` | **56,392** | $4.2294 | Cold SSTORE in per-hash viewer mapping |
| `revokeViewer` | **27,632** | $2.0724 | Warm SSTORE reset (slot already initialised) |
| `grantRootViewer` | **56,998** | $4.2748 | Cold SSTORE in root-hash viewer mapping |
| `revokeRootViewer` | **30,158** | $2.2618 | Warm SSTORE reset |
| `revokeDocument` | **48,660** | $3.6495 | Status flag update on existing document slot |
| `revokeDocumentRoot` | **51,178** | $3.8383 | Status flag update across root and version slots |
| `registerDocument (2nd)` | **1,90,725** | $14.3044 | Warm deployer array; lower than first registration |
| `canViewDocument (view)` | **0** | $0.0000 | Read-only SLOAD; no gas when called externally |
| `verifyDocument (view)` | **0** | $0.0000 | Read-only SLOAD; no gas when called externally |
| `isDocumentRevoked (view)` | **0** | $0.0000 | Read-only SLOAD; no gas when called externally |

### B. LaTeX Table Source (for Direct Research Paper Inclusion)

```latex
\begin{table}[htbp]
\centering
\caption{Measured On-Chain Gas Consumption (Hardhat Local Node)}
\label{tab:gas_metrics}
\begin{tabular}{lll}
\hline
\textbf{Function} & \textbf{Gas Used} & \textbf{Notes} \\
\hline
registerDocument & 2,07,825 & Cold SSTORE; first document (new struct slot) \\
addDocumentVersion & 1,85,479 & Version digest appended to existing root mapping \\
grantViewer & 56,392 & Cold SSTORE in per-hash viewer mapping \\
revokeViewer & 27,632 & Warm SSTORE reset (slot already initialised) \\
grantRootViewer & 56,998 & Cold SSTORE in root-hash viewer mapping \\
revokeRootViewer & 30,158 & Warm SSTORE reset \\
revokeDocument & 48,660 & Status flag update on existing document slot \\
revokeDocumentRoot & 51,178 & Status flag update across root and version slots \\
registerDocument (2nd) & 1,90,725 & Warm deployer array; lower than first registration \\
canViewDocument (view) & 0 & Read-only SLOAD; no gas when called externally \\
verifyDocument (view) & 0 & Read-only SLOAD; no gas when called externally \\
isDocumentRevoked (view) & 0 & Read-only SLOAD; no gas when called externally \\
\hline
\end{tabular}
\end{table}
```

### C. Enterprise Volume & Financial Scaling Cost Model ($ETH = $3,000)

| Document Volume | Cumulative Gas Consumed | Cost @ 10 Gwei | Cost @ 25 Gwei | Cost @ 50 Gwei | Cost @ 100 Gwei |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1 doc(s)** | 2,07,825 gas | $6.23 | **$15.59** | $31.17 | $62.35 |
| **100 doc(s)** | 2,07,82,500 gas | $623.48 | **$1558.69** | $3117.38 | $6234.75 |
| **1,000 doc(s)** | 20,78,25,000 gas | $6234.75 | **$15586.88** | $31173.75 | $62347.50 |
| **10,000 doc(s)** | 2,07,82,50,000 gas | $62347.50 | **$155868.75** | $311737.50 | $623475.00 |

### D. Theoretical On-Chain vs Off-Chain Hashing Gas Rationale

| Hash Function | Off-Chain BDVS Storage Gas | On-Chain Verification Gas (if calculated in Solidity) | Native EVM Support |
| :--- | :--- | :--- | :--- |
| **Keccak-256 (Selected)** | **2,07,825 gas** (Cold SSTORE) | ~30 gas base + 6 gas/word | **Native Opcode (`SHA3` 0x20)** |
| **SHA-256** | **2,07,825 gas** (Cold SSTORE) | ~60 gas base + 12 gas/word | **Precompile (0x02)** |
| **SHA-3 (NIST)** | **2,07,825 gas** (Cold SSTORE) | ~600–800+ gas/word | Pure interpreted bytecode |
| **Blake2b** | **2,07,825 gas** (Cold SSTORE) | ~600–900+ gas/word | Pure interpreted bytecode |

#### Core Architectural Findings:
1. **Gas Cost Invariance for Off-Chain Storage**: All 256-bit hash functions produce a 32-byte digest (`bytes32`), resulting in identical storage gas (**~207,825 gas cold SSTORE with owner array insertion**) in BDVS.
2. **Keccak-256 Selection Rationale**:
   - **Ethereum Toolchain Uniformity**: Native in Solidity (`keccak256()`), Ethers.js (`ethers.keccak256`), Hardhat, and MetaMask with zero external dependencies.
   - **On-Chain Cryptographic Proofs**: Directly executes with the single EVM opcode `SHA3` (0x20) at only 30 gas base.
   - **Cryptographic Security**: 256-bit security margin ($2^{128}$ collision resistance against birthday attacks).
---

## 5. Concurrent Load Benchmark (§10.1 — Reviewer Concurrency Gap)

**Configuration:** 10 concurrent virtual users × 30 reps = **300 total operations**  
**Wall-clock time:** Phase 1 (register+verify): 747 ms | Phase 2 (reads): 292 ms | Total: 1039 ms  
**Throughput:** **401.6 registrations/sec** (10 concurrent users, wall clock)

> **Scope note (§10.1):** This benchmark tests concurrent application-layer request handling
> against a single in-process Hardhat node. It is a realistic simulation of multi-browser /
> multi-wallet concurrency at the application level, but does not reproduce distributed-network
> effects (mempool contention across independent nodes, gas-price auctions, or P2P propagation
> delays) that a public testnet or multi-node deployment would exhibit.

### A. Aggregate Statistics (n=300 observations per metric)

| Metric | min | median | mean ± 95% CI | p95 | p99 | max |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **registerDocument() latency (ms)** | 14.0 | 19.0 | 19.4 ±0.3 | 25.1 | 31.0 | 34.0 |
| **registerDocument() gas (units)** | 190701 | 190725 | 191293 ±348 | 190725 | 207825 | 207825 |
| **verifyDocument() latency (ms)** | 3.0 | 5.0 | 5.5 ±0.2 | 9.0 | 9.0 | 10.0 |
| **getDocumentMeta() latency (ms)** | 4.0 | 6.0 | 8.0 ±1.2 | 9.1 | 64.0 | 65.0 |

### B. Per-User Registration Latency Breakdown

| User | Median latency (ms) | p95 latency (ms) | Median gas (units) |
| :--- | :--- | :--- | :--- |
| user-00 | 19.0 | 24.5 | 190725 |
| user-01 | 19.0 | 25.1 | 190725 |
| user-02 | 19.0 | 25.1 | 190725 |
| user-03 | 20.0 | 25.1 | 190725 |
| user-04 | 20.0 | 25.1 | 190725 |
| user-05 | 18.0 | 24.2 | 190725 |
| user-06 | 19.5 | 23.5 | 190725 |
| user-07 | 18.5 | 22.7 | 190725 |
| user-08 | 19.0 | 22.6 | 190725 |
| user-09 | 18.0 | 21.6 | 190725 |


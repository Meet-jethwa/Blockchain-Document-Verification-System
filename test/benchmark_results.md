# BDVS Comprehensive Benchmarking & Methodology Report

**Execution Timestamp:** 2026-10-03T16:44:55.836Z  
**Purpose:** Quantitative benchmarking report and formal response to Peer Reviews #1, #3, #4, and #6.

---

## 1. Environment & Hardware Specifications (Review #1 & #6 Resolution)

To ensure full scientific reproducibility, all benchmarking execution parameters, hardware attributes, OS specifications, and software library versions were captured dynamically at runtime:

| Specification Attribute | Value |
| :--- | :--- |
| **Operating System** | Windows_NT 10.0.26300 (x64) |
| **CPU Processor Model** | `11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz` |
| **CPU Clock Speed** | 2419 MHz |
| **CPU Core Count** | 8 Logical Cores |
| **Total System RAM** | 7.74 GB |
| **Free Memory at Test** | 0.34 GB |
| **Node.js Runtime Version** | `v24.21.0` |
| **V8 Engine Version** | `13.6.233.17-node.53` |
| **OpenSSL Cryptographic Core** | `3.5.8` |
| **Ethers.js Library Version** | `^6.16.0` |
| **Sample Size** | N = 50 runs per payload (with 10 warm-up runs) |

---

## 2. Off-Chain Hashing Performance Benchmarks (N=50, 95% CI)

Measured throughput (MB/s), mean latency ($\mu$), sample standard deviation ($\sigma$), and 95% Confidence Interval ($\mu \pm 1.96 \cdot \frac{\sigma}{\sqrt{N}}$) across payload sizes:

### Payload Size: 100 KB (1,02,400 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 0.475 ms | 0.3484 ms | ±0.4499 ms | [0.3503, 0.5997] ms | **205.6 MB/s** |
| **SHA-256** | 256 bits | 0.273 ms | 0.2232 ms | ±0.1923 ms | [0.2197, 0.3263] ms | **357.72 MB/s** |
| **SHA-3 (256)** | 256 bits | 0.7603 ms | 0.7758 ms | ±0.1688 ms | [0.7136, 0.8071] ms | **128.44 MB/s** |
| **Blake2b (512/256)** | 256 bits | 0.4001 ms | 0.4073 ms | ±0.0782 ms | [0.3784, 0.4218] ms | **244.07 MB/s** |
| **Keccak-256 (ethers.js — includes hex/Buffer marshal)** | 256 bits | 20.9386 ms | 20.4515 ms | ±3.4481 ms | [19.9828, 21.8944] ms | **4.66 MB/s** |
| **Keccak-256 (js-sha3 — pure JS, no marshal)** | 256 bits | 11.3616 ms | 10.553 ms | ±2.9929 ms | [10.5320, 12.1912] ms | **8.6 MB/s** |
| **Keccak-256 (keccak native C bindings)** | 256 bits | 1.7984 ms | 1.5773 ms | ±0.9234 ms | [1.5424, 2.0543] ms | **54.3 MB/s** |

### Payload Size: 1 MB (10,48,576 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 4.6424 ms | 4.282 ms | ±0.9577 ms | [4.3769, 4.9078] ms | **215.41 MB/s** |
| **SHA-256** | 256 bits | 2.8959 ms | 2.5752 ms | ±1.2666 ms | [2.5449, 3.2470] ms | **345.31 MB/s** |
| **SHA-3 (256)** | 256 bits | 10.04 ms | 10.0347 ms | ±1.6168 ms | [9.5918, 10.4881] ms | **99.6 MB/s** |
| **Blake2b (512/256)** | 256 bits | 5.8001 ms | 5.2122 ms | ±2.2269 ms | [5.1828, 6.4173] ms | **172.41 MB/s** |
| **Keccak-256 (ethers.js — includes hex/Buffer marshal)** | 256 bits | 161.1726 ms | 157.2534 ms | ±25.6272 ms | [154.0691, 168.2761] ms | **6.2 MB/s** |
| **Keccak-256 (js-sha3 — pure JS, no marshal)** | 256 bits | 59.5494 ms | 56.1136 ms | ±15.5484 ms | [55.2396, 63.8592] ms | **16.79 MB/s** |
| **Keccak-256 (keccak native C bindings)** | 256 bits | 15.8994 ms | 15.7588 ms | ±4.0247 ms | [14.7839, 17.0150] ms | **62.9 MB/s** |

### Payload Size: 5 MB (52,42,880 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 17.2258 ms | 16.4733 ms | ±2.4503 ms | [16.5466, 17.9050] ms | **290.26 MB/s** |
| **SHA-256** | 256 bits | 9.6822 ms | 9.3784 ms | ±1.417 ms | [9.2895, 10.0750] ms | **516.41 MB/s** |
| **SHA-3 (256)** | 256 bits | 39.0463 ms | 36.6234 ms | ±8.2145 ms | [36.7694, 41.3233] ms | **128.05 MB/s** |
| **Blake2b (512/256)** | 256 bits | 13.0715 ms | 12.6187 ms | ±2.1056 ms | [12.4879, 13.6552] ms | **382.51 MB/s** |
| **Keccak-256 (ethers.js — includes hex/Buffer marshal)** | 256 bits | 844.1913 ms | 770.1489 ms | ±221.8097 ms | [782.7088, 905.6738] ms | **5.92 MB/s** |
| **Keccak-256 (js-sha3 — pure JS, no marshal)** | 256 bits | 317.0216 ms | 290.5697 ms | ±76.992 ms | [295.6805, 338.3626] ms | **15.77 MB/s** |
| **Keccak-256 (keccak native C bindings)** | 256 bits | 52.1597 ms | 49.4193 ms | ±9.0379 ms | [49.6545, 54.6649] ms | **95.86 MB/s** |

### Payload Size: 10 MB (1,04,85,760 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 30.3764 ms | 30.3869 ms | ±2.5807 ms | [29.6611, 31.0918] ms | **329.2 MB/s** |
| **SHA-256** | 256 bits | 17.2713 ms | 16.8457 ms | ±2.13 ms | [16.6809, 17.8617] ms | **579 MB/s** |
| **SHA-3 (256)** | 256 bits | 62.6402 ms | 62.0252 ms | ±4.6785 ms | [61.3434, 63.9370] ms | **159.64 MB/s** |
| **Blake2b (512/256)** | 256 bits | 27.7689 ms | 27.3383 ms | ±3.6646 ms | [26.7531, 28.7847] ms | **360.11 MB/s** |
| **Keccak-256 (ethers.js — includes hex/Buffer marshal)** | 256 bits | 1545.5853 ms | 1402.8442 ms | ±415.7855 ms | [1430.3354, 1660.8351] ms | **6.47 MB/s** |
| **Keccak-256 (js-sha3 — pure JS, no marshal)** | 256 bits | 744.4859 ms | 741.5249 ms | ±163.4545 ms | [699.1786, 789.7932] ms | **13.43 MB/s** |
| **Keccak-256 (keccak native C bindings)** | 256 bits | 109.1819 ms | 99.0319 ms | ±31.6695 ms | [100.4036, 117.9603] ms | **91.59 MB/s** |

---

## 3. Baseline Architectural Comparisons (Review #6 Resolution)

### A. Unencrypted vs Client-Side Encrypted Pipeline Overhead (1 MB Payload)
| Pipeline Component | Mean Latency (ms) | Overhead vs Baseline |
| :--- | :--- | :--- |
| **Direct Hashing Baseline** | 1.6234 ms | Baseline (0.00 ms) |
| **AES-256-GCM Encrypt + Hash Pipeline** | 4.2942 ms | +2.6708 ms |

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
| `addDocumentVersion` | **1,85,467** | $13.91 | Version digest appended to existing root mapping |
| `grantViewer` | **56,392** | $4.2294 | Cold SSTORE in per-hash viewer mapping |
| `revokeViewer` | **27,632** | $2.0724 | Warm SSTORE reset (slot already initialised) |
| `grantRootViewer` | **56,998** | $4.2748 | Cold SSTORE in root-hash viewer mapping |
| `revokeRootViewer` | **30,158** | $2.2618 | Warm SSTORE reset |
| `revokeDocument` | **48,648** | $3.6486 | Status flag update on existing document slot |
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
addDocumentVersion & 1,85,467 & Version digest appended to existing root mapping \\
grantViewer & 56,392 & Cold SSTORE in per-hash viewer mapping \\
revokeViewer & 27,632 & Warm SSTORE reset (slot already initialised) \\
grantRootViewer & 56,998 & Cold SSTORE in root-hash viewer mapping \\
revokeRootViewer & 30,158 & Warm SSTORE reset \\
revokeDocument & 48,648 & Status flag update on existing document slot \\
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
**Wall-clock time:** Phase 1 (register+verify): 17552 ms | Phase 2 (reads): 3790 ms | Total: 21342 ms  
**Throughput:** **17.1 registrations/sec** (10 concurrent users, wall clock)

> **Scope note (§10.1):** This benchmark tests concurrent application-layer request handling
> against a single in-process Hardhat node. It is a realistic simulation of multi-browser /
> multi-wallet concurrency at the application level, but does not reproduce distributed-network
> effects (mempool contention across independent nodes, gas-price auctions, or P2P propagation
> delays) that a public testnet or multi-node deployment would exhibit.

### A. Aggregate Statistics (n=300 observations per metric)

| Metric | min | median | mean ± 95% CI | p95 | p99 | max |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **registerDocument() latency (ms)** | 242.0 | 364.5 | 498.7 ±37.8 | 1449.4 | 1783.2 | 1870.0 |
| **registerDocument() gas (units)** | 190701 | 190725 | 191293 ±348 | 190725 | 207825 | 207825 |
| **verifyDocument() latency (ms)** | 13.0 | 71.5 | 85.6 ±5.1 | 172.9 | 242.4 | 298.0 |
| **getDocumentMeta() latency (ms)** | 17.0 | 91.5 | 105.1 ±4.4 | 189.2 | 234.0 | 239.0 |

### B. Per-User Registration Latency Breakdown

| User | Median latency (ms) | p95 latency (ms) | Median gas (units) |
| :--- | :--- | :--- | :--- |
| user-00 | 379.0 | 1191.7 | 190725 |
| user-01 | 370.0 | 1142.9 | 190725 |
| user-02 | 384.0 | 1142.8 | 190725 |
| user-03 | 374.0 | 1177.2 | 190725 |
| user-04 | 358.0 | 1178.9 | 190725 |
| user-05 | 369.5 | 1188.1 | 190725 |
| user-06 | 362.0 | 1180.6 | 190725 |
| user-07 | 361.0 | 1196.7 | 190725 |
| user-08 | 360.5 | 1161.1 | 190725 |
| user-09 | 353.5 | 1157.0 | 190725 |


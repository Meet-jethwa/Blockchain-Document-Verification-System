# BDVS Comprehensive Benchmarking & Methodology Report

**Execution Timestamp:** 2026-10-05T08:41:57.424Z  
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
| **Free Memory at Test** | 2.84 GB |
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
| **MD5** | 128 bits | 0.1574 ms | 0.1557 ms | ±0.0054 ms | [0.1559, 0.1589] ms | **620.48 MB/s** |
| **SHA-256** | 256 bits | 0.0679 ms | 0.0677 ms | ±0.0009 ms | [0.0677, 0.0682] ms | **1437.26 MB/s** |
| **SHA-3 (256)** | 256 bits | 0.2245 ms | 0.2234 ms | ±0.0049 ms | [0.2231, 0.2258] ms | **435.09 MB/s** |
| **Blake2b (512/256)** | 256 bits | 0.1849 ms | 0.1809 ms | ±0.0201 ms | [0.1793, 0.1905] ms | **528.08 MB/s** |
| **Keccak-256 (js-sha3 pure-JS) [PRIMARY]** | 256 bits | 2.2988 ms | 2.2912 ms | ±0.0556 ms | [2.2834, 2.3142] ms | **42.48 MB/s** |
| **Keccak-256 (keccak native C bindings) [PRIMARY]** | 256 bits | 0.3029 ms | 0.2896 ms | ±0.039 ms | [0.2921, 0.3137] ms | **322.44 MB/s** |
| **Keccak-256 (ethers.js) [OVERHEAD REF — hex marshal included]** | 256 bits | 5.9776 ms | 5.9141 ms | ±0.264 ms | [5.9044, 6.0508] ms | **16.34 MB/s** |

### Payload Size: 1 MB (10,48,576 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 1.6077 ms | 1.5804 ms | ±0.0863 ms | [1.5838, 1.6316] ms | **622.02 MB/s** |
| **SHA-256** | 256 bits | 0.6833 ms | 0.6793 ms | ±0.0134 ms | [0.6796, 0.6870] ms | **1463.43 MB/s** |
| **SHA-3 (256)** | 256 bits | 2.3339 ms | 2.2938 ms | ±0.1073 ms | [2.3042, 2.3637] ms | **428.46 MB/s** |
| **Blake2b (512/256)** | 256 bits | 1.9147 ms | 1.8708 ms | ±0.1202 ms | [1.8814, 1.9480] ms | **522.27 MB/s** |
| **Keccak-256 (js-sha3 pure-JS) [PRIMARY]** | 256 bits | 23.6322 ms | 23.4536 ms | ±0.5553 ms | [23.4783, 23.7862] ms | **42.32 MB/s** |
| **Keccak-256 (keccak native C bindings) [PRIMARY]** | 256 bits | 3.0249 ms | 3.0143 ms | ±0.1238 ms | [2.9906, 3.0592] ms | **330.59 MB/s** |
| **Keccak-256 (ethers.js) [OVERHEAD REF — hex marshal included]** | 256 bits | 61.6036 ms | 61.388 ms | ±1.478 ms | [61.1940, 62.0133] ms | **16.23 MB/s** |

### Payload Size: 5 MB (52,42,880 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 8.2137 ms | 8.1378 ms | ±0.2455 ms | [8.1457, 8.2818] ms | **608.74 MB/s** |
| **SHA-256** | 256 bits | 3.4611 ms | 3.4376 ms | ±0.0918 ms | [3.4357, 3.4865] ms | **1444.63 MB/s** |
| **SHA-3 (256)** | 256 bits | 11.8101 ms | 11.8101 ms | ±0.2182 ms | [11.7496, 11.8706] ms | **423.37 MB/s** |
| **Blake2b (512/256)** | 256 bits | 9.6454 ms | 9.6003 ms | ±0.2395 ms | [9.5790, 9.7117] ms | **518.38 MB/s** |
| **Keccak-256 (js-sha3 pure-JS) [PRIMARY]** | 256 bits | 117.3472 ms | 117.0361 ms | ±2.3164 ms | [116.7051, 117.9893] ms | **42.61 MB/s** |
| **Keccak-256 (keccak native C bindings) [PRIMARY]** | 256 bits | 14.6774 ms | 14.6648 ms | ±0.1743 ms | [14.6290, 14.7257] ms | **340.66 MB/s** |
| **Keccak-256 (ethers.js) [OVERHEAD REF — hex marshal included]** | 256 bits | 302.6068 ms | 302.3658 ms | ±2.1438 ms | [302.0126, 303.2011] ms | **16.52 MB/s** |

### Payload Size: 10 MB (1,04,85,760 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 16.1972 ms | 16.0883 ms | ±0.52 ms | [16.0530, 16.3413] ms | **617.39 MB/s** |
| **SHA-256** | 256 bits | 6.8966 ms | 6.8343 ms | ±0.157 ms | [6.8531, 6.9401] ms | **1449.99 MB/s** |
| **SHA-3 (256)** | 256 bits | 23.3324 ms | 23.1502 ms | ±0.5846 ms | [23.1704, 23.4944] ms | **428.59 MB/s** |
| **Blake2b (512/256)** | 256 bits | 18.9319 ms | 18.9178 ms | ±0.2637 ms | [18.8588, 19.0050] ms | **528.21 MB/s** |
| **Keccak-256 (js-sha3 pure-JS) [PRIMARY]** | 256 bits | 234.695 ms | 234.2965 ms | ±2.5139 ms | [233.9982, 235.3918] ms | **42.61 MB/s** |
| **Keccak-256 (keccak native C bindings) [PRIMARY]** | 256 bits | 29.515 ms | 29.4037 ms | ±0.5123 ms | [29.3729, 29.6570] ms | **338.81 MB/s** |
| **Keccak-256 (ethers.js) [OVERHEAD REF — hex marshal included]** | 256 bits | 609.8485 ms | 609.3626 ms | ±4.3847 ms | [608.6332, 611.0639] ms | **16.4 MB/s** |

---

## 3. Baseline Architectural Comparisons (Review #6 Resolution)

### A. Unencrypted vs Client-Side Encrypted Pipeline Overhead (1 MB Payload, N=50, 10 Warmup Runs)

*Note: Raw per-run observation vectors ($N=50$ each) are recorded in [`test/baseline_benchmark_raw.json`](./baseline_benchmark_raw.json). Baseline is native Keccak-256 (matching BDVS on-chain document digests). Ciphertext re-hashing (`encHash`) has been removed to match the real client execution flow.*

#### 1. Web Crypto API Pipeline (Browser Execution Path via `crypto.subtle`)

| Pipeline Component | Mean Latency (ms) | Std Dev (ms) | 95% CI (ms) | Overhead vs Baseline | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Direct Keccak-256 Hashing Baseline** | 3.0525 ms | ±0.7762 ms | [2.8373, 3.2676] ms | Baseline (0.00 ms) | 327.61 MB/s |
| **2. AES-256-GCM Encrypt (without AAD) + Keccak** | 4.1197 ms | ±0.4299 ms | [4.0005, 4.2388] ms | +1.0672 ms | 242.74 MB/s |
| **3. AES-256-GCM Encrypt (with AAD) + Keccak** | 4.1632 ms | ±0.7637 ms | [3.9515, 4.3749] ms | +1.1107 ms | 240.2 MB/s |

- **Encryption Overhead (without AAD):** +1.0672 ms
- **Total Pipeline Overhead (with AAD):** +1.1107 ms
- **Isolated AAD GHASH Cost (Row 3 − Row 2):** **+0.0435 ms**

#### 2. Node.js / OpenSSL Pipeline (Backend & CLI Engine via `crypto.createCipheriv`)

| Pipeline Component | Mean Latency (ms) | Std Dev (ms) | 95% CI (ms) | Overhead vs Baseline | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Direct Keccak-256 Hashing Baseline** | 2.9562 ms | ±0.1383 ms | [2.9179, 2.9945] ms | Baseline (0.00 ms) | 338.27 MB/s |
| **2. AES-256-GCM Encrypt (without AAD) + Keccak** | 4.3296 ms | ±0.4148 ms | [4.2146, 4.4446] ms | +1.3734 ms | 230.97 MB/s |
| **3. AES-256-GCM Encrypt (with AAD) + Keccak** | 4.2896 ms | ±0.4498 ms | [4.1649, 4.4142] ms | +1.3334 ms | 233.12 MB/s |

- **Encryption Overhead (without AAD):** +1.3734 ms
- **Total Pipeline Overhead (with AAD):** +1.3334 ms
- **Isolated AAD GHASH Cost (Row 3 − Row 2):** **-0.0400 ms**

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
| `registerDocument` | **2,07,813** | $15.586 | Cold SSTORE; first document (new struct slot) |
| `addDocumentVersion` | **1,85,467** | $13.91 | Version digest appended to existing root mapping |
| `grantViewer` | **56,380** | $4.2285 | Cold SSTORE in per-hash viewer mapping |
| `revokeViewer` | **27,620** | $2.0715 | Warm SSTORE reset (slot already initialised) |
| `grantRootViewer` | **56,986** | $4.274 | Cold SSTORE in root-hash viewer mapping |
| `revokeRootViewer` | **30,146** | $2.261 | Warm SSTORE reset |
| `revokeDocument` | **48,660** | $3.6495 | Status flag update on existing document slot |
| `revokeDocumentRoot` | **51,166** | $3.8375 | Status flag update across root and version slots |
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
registerDocument & 2,07,813 & Cold SSTORE; first document (new struct slot) \\
addDocumentVersion & 1,85,467 & Version digest appended to existing root mapping \\
grantViewer & 56,380 & Cold SSTORE in per-hash viewer mapping \\
revokeViewer & 27,620 & Warm SSTORE reset (slot already initialised) \\
grantRootViewer & 56,986 & Cold SSTORE in root-hash viewer mapping \\
revokeRootViewer & 30,146 & Warm SSTORE reset \\
revokeDocument & 48,660 & Status flag update on existing document slot \\
revokeDocumentRoot & 51,166 & Status flag update across root and version slots \\
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
| **1 doc(s)** | 2,07,813 gas | $6.23 | **$15.59** | $31.17 | $62.34 |
| **100 doc(s)** | 2,07,81,300 gas | $623.44 | **$1558.60** | $3117.19 | $6234.39 |
| **1,000 doc(s)** | 20,78,13,000 gas | $6234.39 | **$15585.98** | $31171.95 | $62343.90 |
| **10,000 doc(s)** | 2,07,81,30,000 gas | $62343.90 | **$155859.75** | $311719.50 | $623439.00 |

### D. Theoretical On-Chain vs Off-Chain Hashing Gas Rationale

| Hash Function | Off-Chain BDVS Storage Gas | On-Chain Verification Gas (if calculated in Solidity) | Native EVM Support |
| :--- | :--- | :--- | :--- |
| **Keccak-256 (Selected)** | **2,07,813 gas** (Cold SSTORE) | ~30 gas base + 6 gas/word | **Native Opcode (`SHA3` 0x20)** |
| **SHA-256** | **2,07,813 gas** (Cold SSTORE) | ~60 gas base + 12 gas/word | **Precompile (0x02)** |
| **SHA-3 (NIST)** | **2,07,813 gas** (Cold SSTORE) | ~600–800+ gas/word | Pure interpreted bytecode |
| **Blake2b** | **2,07,813 gas** (Cold SSTORE) | ~600–900+ gas/word | Pure interpreted bytecode |

#### Core Architectural Findings:
1. **Gas Cost Invariance for Off-Chain Storage**: All 256-bit hash functions produce a 32-byte digest (`bytes32`), resulting in identical storage gas (**~207,825 gas cold SSTORE with owner array insertion**) in BDVS.
2. **Keccak-256 Selection Rationale**:
   - **Ethereum Toolchain Uniformity**: Native in Solidity (`keccak256()`), Ethers.js (`ethers.keccak256`), Hardhat, and MetaMask with zero external dependencies.
   - **On-Chain Cryptographic Proofs**: Directly executes with the single EVM opcode `SHA3` (0x20) at only 30 gas base.
   - **Cryptographic Security**: 256-bit security margin ($2^{128}$ collision resistance against birthday attacks).
---

## 5. Concurrent Load Benchmark (§10.1 — Reviewer Concurrency Gap)

**Configuration:** 10 concurrent virtual users × 30 reps = **300 total operations**  
**Wall-clock time:** Phase 1 (register+verify): 549 ms | Phase 2 (reads): 202 ms | Total: 751 ms  
**Throughput:** **546.4 registrations/sec** (10 concurrent users, wall clock)

> **Scope note (§10.1):** This benchmark tests concurrent application-layer request handling
> against a single in-process Hardhat node. It is a realistic simulation of multi-browser /
> multi-wallet concurrency at the application level, but does not reproduce distributed-network
> effects (mempool contention across independent nodes, gas-price auctions, or P2P propagation
> delays) that a public testnet or multi-node deployment would exhibit.

### A. Aggregate Statistics (n=300 observations per metric)

| Metric | min | median | mean ± 95% CI | p95 | p99 | max |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **registerDocument() latency (ms)** | 11.0 | 14.0 | 14.1 ±0.3 | 21.0 | 23.0 | 25.0 |
| **registerDocument() gas (units)** | 190701 | 190725 | 191294 ±348 | 190725 | 207825 | 207825 |
| **verifyDocument() latency (ms)** | 1.0 | 4.0 | 4.1 ±0.1 | 6.0 | 7.0 | 8.0 |
| **getDocumentMeta() latency (ms)** | 2.0 | 4.0 | 4.6 ±0.1 | 7.0 | 8.0 | 8.0 |

### B. Per-User Registration Latency Breakdown

| User | Median latency (ms) | p95 latency (ms) | Median gas (units) |
| :--- | :--- | :--- | :--- |
| user-00 | 14.0 | 18.2 | 190725 |
| user-01 | 14.0 | 18.7 | 190725 |
| user-02 | 14.0 | 18.7 | 190725 |
| user-03 | 13.5 | 18.7 | 190725 |
| user-04 | 13.0 | 18.3 | 190725 |
| user-05 | 14.0 | 18.7 | 190725 |
| user-06 | 14.0 | 17.7 | 190725 |
| user-07 | 14.0 | 18.3 | 190725 |
| user-08 | 14.0 | 18.2 | 190725 |
| user-09 | 13.0 | 17.7 | 190725 |

---

## 6. Live Sepolia Testnet Gas Cross-Validation (Review #6 Resolution)

**Execution Timestamp:** 2026-10-04T17:44:32.159Z  
**Network:** Ethereum Sepolia Testnet (`chainId: 11155111`)  
**Contract Address:** [`0xc5bEFEcb2d962cf91fea5a39085f959FA29f20D3`](https://sepolia.etherscan.io/address/0xc5bEFEcb2d962cf91fea5a39085f959FA29f20D3)  
**Test Wallet:** `0x8531f9631b50aD8973cDF107dbF1701c6353AF7C`  
**Block Number:** `11843616`  
**Raw JSON Artifact:** [`test/sepolia_gas_results.json`](file:///d:/clg/TY/blockchain%20project/Document%20Verification%20System/test/sepolia_gas_results.json)

To empirically close Reviewer #6's critique regarding the validity of local node EVM measurements on public decentralized networks, transactions were submitted directly to the live Ethereum Sepolia testnet and verified against transaction receipts (`receipt.gasUsed`):

### A. Live Sepolia vs. Hardhat Gas Comparison Table

| Operation | Hardhat Local (units) | Sepolia Live (units) | Delta (units) | Transaction Hash (Sepolia) | Match Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `registerDocument (warm array)` | 190,725 | **190,725** | +0 | `0x25dbbe7c58ab9de723c45a64ce15995cf8fc6bd91783d3aeae2d22814316d05c` | **✓ EXACT MATCH** | Warm deployer array; 2nd+ document |
| `registerDocument (warm array)` | 190,725 | **190,725** | +0 | `0x59a0c747c9d30542a674c3c00ca9c6b9a057727dfb3972b54c4636611a9cd7d8` | **✓ EXACT MATCH** | Warm deployer array; 3rd+ document |
| `registerDocument (warm array)` | 190,725 | **190,725** | +0 | `0xc788364706b9bb04bbaaf77a2275f0cf3cf4e4890f6b9d3a7ad09af41499f2fc` | **✓ EXACT MATCH** | Warm deployer array; 4th+ document |
| `grantViewer (cold mapping)` | 56,392 | **56,392** | +0 | `0x07452d160c18c7617157d1847afba497141951df31920f2b0fec66addd651d09` | **✓ EXACT MATCH** | Cold SSTORE in per-hash viewer mapping |

### B. Findings & EVM Equivalence
1. **Zero-Gas Variance on Identical EVM State:** Both warm `registerDocument` (190,725 gas) and cold `grantViewer` (56,392 gas) produced **identical gas consumption** down to the exact unit ($\Delta = 0$).
2. **Cold vs. Warm Registration Dynamics:** Cold initial document registration requires $207,813$ gas (allocating the sender's dynamic array slot via cold SSTORE), while all subsequent registrations by the same wallet consume $190,725$ gas (warm array length updates). Both states behave identically across local simulation and public testnet nodes.


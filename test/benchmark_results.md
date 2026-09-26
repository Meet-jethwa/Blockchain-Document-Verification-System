# BDVS Comprehensive Benchmarking & Methodology Report

**Execution Timestamp:** 2026-08-09T07:38:01.889Z  
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
| **Free Memory at Test** | 0.22 GB |
| **Node.js Runtime Version** | `v22.12.0` |
| **V8 Engine Version** | `12.4.254.21-node.21` |
| **OpenSSL Cryptographic Core** | `3.0.15+quic` |
| **Ethers.js Library Version** | `^6.16.0` |
| **Sample Size** | N = 50 runs per payload (with 10 warm-up runs) |

---

## 2. Off-Chain Hashing Performance Benchmarks (N=50, 95% CI)

Measured throughput (MB/s), mean latency ($mu$), sample standard deviation ($sigma$), and 95% Confidence Interval ($mu pm 1.96 cdot rac{sigma}{sqrt{N}}$) across payload sizes:

### Payload Size: 100 KB (1,02,400 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 0.1651 ms | 0.1591 ms | ±0.0184 ms | [0.1600, 0.1702] ms | **591.45 MB/s** |
| **SHA-256** | 256 bits | 0.0717 ms | 0.0685 ms | ±0.0092 ms | [0.0691, 0.0742] ms | **1362.51 MB/s** |
| **SHA-3 (256)** | 256 bits | 0.2259 ms | 0.2243 ms | ±0.0069 ms | [0.2240, 0.2278] ms | **432.32 MB/s** |
| **Blake2b (512/256)** | 256 bits | 0.1869 ms | 0.182 ms | ±0.0154 ms | [0.1826, 0.1912] ms | **522.46 MB/s** |
| **Keccak-256 (ethers)** | 256 bits | 6.0134 ms | 5.9557 ms | ±0.215 ms | [5.9538, 6.0730] ms | **16.24 MB/s** |

### Payload Size: 1 MB (10,48,576 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 1.6181 ms | 1.584 ms | ±0.0639 ms | [1.6004, 1.6358] ms | **618.01 MB/s** |
| **SHA-256** | 256 bits | 0.682 ms | 0.678 ms | ±0.0137 ms | [0.6782, 0.6858] ms | **1466.28 MB/s** |
| **SHA-3 (256)** | 256 bits | 2.2943 ms | 2.2728 ms | ±0.0558 ms | [2.2789, 2.3098] ms | **435.86 MB/s** |
| **Blake2b (512/256)** | 256 bits | 1.9207 ms | 1.9018 ms | ±0.0892 ms | [1.8960, 1.9454] ms | **520.63 MB/s** |
| **Keccak-256 (ethers)** | 256 bits | 60.2706 ms | 60.1035 ms | ±0.8141 ms | [60.0450, 60.4963] ms | **16.59 MB/s** |

### Payload Size: 5 MB (52,42,880 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 7.9528 ms | 7.9154 ms | ±0.108 ms | [7.9228, 7.9827] ms | **628.71 MB/s** |
| **SHA-256** | 256 bits | 3.4415 ms | 3.4125 ms | ±0.0687 ms | [3.4225, 3.4605] ms | **1452.85 MB/s** |
| **SHA-3 (256)** | 256 bits | 11.5404 ms | 11.4735 ms | ±0.2117 ms | [11.4817, 11.5991] ms | **433.26 MB/s** |
| **Blake2b (512/256)** | 256 bits | 9.3782 ms | 9.3255 ms | ±0.1307 ms | [9.3419, 9.4144] ms | **533.15 MB/s** |
| **Keccak-256 (ethers)** | 256 bits | 304.486 ms | 302.9312 ms | ±5.4658 ms | [302.9710, 306.0011] ms | **16.42 MB/s** |

### Payload Size: 10 MB (1,04,85,760 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 16.2228 ms | 16.0126 ms | ±0.7083 ms | [16.0265, 16.4191] ms | **616.42 MB/s** |
| **SHA-256** | 256 bits | 6.9259 ms | 6.9135 ms | ±0.1505 ms | [6.8842, 6.9676] ms | **1443.86 MB/s** |
| **SHA-3 (256)** | 256 bits | 23.7097 ms | 23.1972 ms | ±1.3243 ms | [23.3426, 24.0768] ms | **421.77 MB/s** |
| **Blake2b (512/256)** | 256 bits | 19.0757 ms | 19.028 ms | ±0.3669 ms | [18.9740, 19.1774] ms | **524.23 MB/s** |
| **Keccak-256 (ethers)** | 256 bits | 613.5643 ms | 610.4141 ms | ±9.7724 ms | [610.8555, 616.2730] ms | **16.3 MB/s** |

---

## 3. Baseline Architectural Comparisons (Review #6 Resolution)

### A. Unencrypted vs Client-Side Encrypted Pipeline Overhead (1 MB Payload)
| Pipeline Component | Mean Latency (ms) | Overhead vs Baseline |
| :--- | :--- | :--- |
| **Direct Hashing Baseline** | 0.7697 ms | Baseline (0.00 ms) |
| **AES-256-GCM Encrypt + Hash Pipeline** | 2.3361 ms | +1.5663 ms |

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

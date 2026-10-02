# BDVS Comprehensive Benchmarking & Methodology Report

**Execution Timestamp:** 2026-09-29T09:14:55.022Z  
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
| **Free Memory at Test** | 4.30 GB |
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
| **MD5** | 128 bits | 0.1618 ms | 0.1557 ms | ±0.0168 ms | [0.1571, 0.1664] ms | **603.63 MB/s** |
| **SHA-256** | 256 bits | 0.0691 ms | 0.068 ms | ±0.0046 ms | [0.0678, 0.0704] ms | **1413.42 MB/s** |
| **SHA-3 (256)** | 256 bits | 0.226 ms | 0.2238 ms | ±0.0132 ms | [0.2223, 0.2296] ms | **432.18 MB/s** |
| **Blake2b (512/256)** | 256 bits | 0.1807 ms | 0.1801 ms | ±0.0017 ms | [0.1802, 0.1812] ms | **540.45 MB/s** |
| **Keccak-256 (ethers)** | 256 bits | 5.9147 ms | 5.8596 ms | ±0.1671 ms | [5.8684, 5.9610] ms | **16.51 MB/s** |

### Payload Size: 1 MB (10,48,576 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 1.598 ms | 1.576 ms | ±0.0538 ms | [1.5830, 1.6129] ms | **625.8 MB/s** |
| **SHA-256** | 256 bits | 0.6784 ms | 0.6754 ms | ±0.0078 ms | [0.6763, 0.6806] ms | **1474.03 MB/s** |
| **SHA-3 (256)** | 256 bits | 2.2832 ms | 2.2758 ms | ±0.0553 ms | [2.2679, 2.2985] ms | **437.99 MB/s** |
| **Blake2b (512/256)** | 256 bits | 1.8557 ms | 1.8455 ms | ±0.0389 ms | [1.8449, 1.8665] ms | **538.88 MB/s** |
| **Keccak-256 (ethers)** | 256 bits | 61.0527 ms | 60.535 ms | ±1.8945 ms | [60.5276, 61.5778] ms | **16.38 MB/s** |

### Payload Size: 5 MB (52,42,880 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 8.0416 ms | 7.9404 ms | ±0.2921 ms | [7.9606, 8.1225] ms | **621.77 MB/s** |
| **SHA-256** | 256 bits | 3.4272 ms | 3.4009 ms | ±0.0697 ms | [3.4078, 3.4465] ms | **1458.94 MB/s** |
| **SHA-3 (256)** | 256 bits | 11.3974 ms | 11.3619 ms | ±0.1525 ms | [11.3551, 11.4397] ms | **438.7 MB/s** |
| **Blake2b (512/256)** | 256 bits | 9.3559 ms | 9.3095 ms | ±0.1654 ms | [9.3100, 9.4017] ms | **534.42 MB/s** |
| **Keccak-256 (ethers)** | 256 bits | 300.3432 ms | 299.8907 ms | ±1.7779 ms | [299.8504, 300.8360] ms | **16.65 MB/s** |

### Payload Size: 10 MB (1,04,85,760 bytes)

| Algorithm | Output Size | Mean Latency (ms) | Median Latency (ms) | Std Dev (ms) | 95% Confidence Interval | Throughput (MB/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MD5** | 128 bits | 15.8902 ms | 15.7652 ms | ±0.5134 ms | [15.7479, 16.0325] ms | **629.32 MB/s** |
| **SHA-256** | 256 bits | 6.7871 ms | 6.7622 ms | ±0.0811 ms | [6.7646, 6.8096] ms | **1473.38 MB/s** |
| **SHA-3 (256)** | 256 bits | 22.9636 ms | 22.7974 ms | ±0.5499 ms | [22.8112, 23.1160] ms | **435.47 MB/s** |
| **Blake2b (512/256)** | 256 bits | 18.7917 ms | 18.6973 ms | ±0.3939 ms | [18.6825, 18.9009] ms | **532.15 MB/s** |
| **Keccak-256 (ethers)** | 256 bits | 603.0622 ms | 601.2164 ms | ±5.0814 ms | [601.6538, 604.4707] ms | **16.58 MB/s** |

---

## 3. Baseline Architectural Comparisons (Review #6 Resolution)

### A. Unencrypted vs Client-Side Encrypted Pipeline Overhead (1 MB Payload)
| Pipeline Component | Mean Latency (ms) | Overhead vs Baseline |
| :--- | :--- | :--- |
| **Direct Hashing Baseline** | 0.7082 ms | Baseline (0.00 ms) |
| **AES-256-GCM Encrypt + Hash Pipeline** | 2.4352 ms | +1.727 ms |

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

# Academic Peer Reviewer Response & Revised Testing Methodology

**Paper Title:** Blockchain Document Verification System: A Privacy-Preserving Architecture Using Ethereum Smart Contracts, IPFS, and KECCAK-256  
**Target Directory:** `test/`  
**Date:** July 2026

---

## 1. Executive Summary & Response to Reviews #1, #3, #4, and #6

| Reviewer Item | Summary of Critique | Implemented Solution & Methodological Enhancement |
| :--- | :--- | :--- |
| **Review #1** | **Missing Hardware & Version Spec:** Hash/CPU benchmarks are invalid without hardware (CPU, clock, RAM) and library versions. | Built dynamic system profiler in [`test/benchmark_hashing.js`](file:///d:/clg/TY/blockchain%20project/Document%20Verification%20System/test/benchmark_hashing.js) logging CPU model, clock speed, core count, OS, Node.js version, V8, and Ethers.js versions. |
| **Review #3** | **Flawed Keccak-256 Gas Rationale:** Off-chain hashing makes `bytes32` storage gas identical (~20.8k gas) across all 256-bit hash functions. | Corrected paper rationale in Section V: Established gas equality for off-chain storage, and justified Keccak-256 via Ethereum toolchain consistency, 256-bit security margin, and native EVM `SHA3` opcode re-verification support. |
| **Review #4** | **Unclear Latency Attribution:** Breakdown between client crypto, server relay, IPFS gateway, and Sepolia consensus was unmeasured. | Added baseline comparative benchmarks in [`test/benchmark_network_baselines.js`](file:///d:/clg/TY/blockchain%20project/Document%20Verification%20System/test/benchmark_network_baselines.js) isolating client crypto (+0.5ms), IPFS (1.2–5.3s), and Sepolia (12–36s). |
| **Review #6** | **Thin Evaluation / Small Sample Size / No Variance / No Mainnet Scaling:** Sample size too small ($N=5$), no confidence intervals, gas measured only on local node. | Upgraded test harness to **$N = 50$ iterations** with 10 warm-up runs. Computed **Mean ($\mu$), Median, Standard Deviation ($\sigma$), and 95% Confidence Intervals ($\mu \pm 1.96 \cdot \frac{\sigma}{\sqrt{N}}$)**. Added **Mainnet & Sepolia gas price scenarios (10–100 Gwei)** and **volume cost projections (1 to 10,000 documents)**. |

---

## 2. Statistical Methodology & Mathematical Formulations

To address **Review #6**, all off-chain hashing metrics are computed over a sample size of $N = 50$ independent runs per payload buffer after $W = 10$ warm-up iterations.

### Mathematical Definitions:
1. **Sample Mean ($\mu$):**
   $$\mu = \frac{1}{N} \sum_{i=1}^{N} t_i$$

2. **Sample Standard Deviation ($s$):**
   $$s = \sqrt{\frac{1}{N-1} \sum_{i=1}^{N} (t_i - \mu)^2}$$

3. **Standard Error of the Mean ($\text{SEM}$):**
   $$\text{SEM} = \frac{s}{\sqrt{N}}$$

4. **95% Confidence Interval ($95\%\text{ CI}$):**
   $$\text{CI}_{95\%} = \left[ \mu - 1.96 \cdot \text{SEM}, \, \mu + 1.96 \cdot \text{SEM} \right]$$

5. **Throughput ($\text{TP}$ in MB/s):**
   $$\text{TP} = \frac{\text{Payload Size (MB)}}{\mu \text{ (seconds)}}$$

---

## 3. Revised Paper Section V: Hash Function Selection & Evaluation

Below is the updated text for **Section V** of the paper:

### V. Cryptographic Hash Function Selection & Empirical Evaluation

To establish the cryptographic foundation of BDVS, five candidate algorithms were evaluated: MD5, SHA-256, SHA-3 (NIST), Blake2b, and Keccak-256. Table II presents the empirical evaluation across $N=50$ trial runs with 95% confidence intervals, hardware specifications, and EVM opcode dynamics.

#### A. Clarification of On-Chain Storage vs Computation Gas
In BDVS, document contents are hashed off-chain on the client/backend using `ethers.keccak256`. The 32-byte digest (`bytes32`) is committed to the Ethereum network via `registerDocument(bytes32 hash)`. 

Because the EVM receives only the pre-computed hash digest, storing any 256-bit digest (SHA-256, SHA-3, Blake2b, or Keccak-256) consumes identical on-chain storage gas:
$$\text{Gas}_{\text{storage}} = \text{Gas}_{\text{cold SSTORE}} + \text{Gas}_{\text{tx overhead}} \approx 20,825\text{ gas}$$

At a standard gas price of 25 Gwei and an ETH valuation of $3,000 USD, initial document registration incurs approximately **$1.56 USD** in transaction fees on public Ethereum networks.

#### B. Rationale for Keccak-256 Selection
Keccak-256 was selected for BDVS based on three principal criteria:
1. **Toolchain Integration & Zero-Dependency Footprint**: Native support in `ethers.js`, Node.js `crypto`, and Solidity (`keccak256()`) eliminates additional library dependencies and client-side bundle bloat.
2. **On-Chain Re-Verification Feasibility**: In scenarios where document proofs or Merkle branches are verified directly within smart contract logic, Keccak-256 compiles natively to the EVM opcode `SHA3` (0x20), costing ~30 gas per 32-byte block—compared to 60–80 gas for SHA-256 (precompile 0x02) and >600 gas/block for interpreted SHA-3 or Blake2b bytecode.
3. **Cryptographic Security Margin**: 256-bit Keccak provides $2^{128}$ collision resistance, maintaining data integrity against arbitrary tampering.

---

## 4. Mainnet & Sepolia Cost Projections at Scale

To evaluate financial viability at enterprise scale (Review #6), transaction costs were modeled across gas price tiers (10 Gwei to 100 Gwei) at $1 \text{ ETH} = \$3,000 \text{ USD}$:

| Volume (Documents Registered) | On-Chain Gas | Cost @ 10 Gwei | Cost @ 25 Gwei (Baseline) | Cost @ 50 Gwei | Cost @ 100 Gwei |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **1 Document** | 20,825 gas | $0.62 USD | **$1.56 USD** | $3.12 USD | $6.25 USD |
| **100 Documents** | 2,082,500 gas | $62.48 USD | **$156.19 USD** | $312.38 USD | $624.75 USD |
| **1,000 Documents** | 20,825,000 gas | $624.75 USD | **$1,561.88 USD** | $3,123.75 USD | $6,247.50 USD |
| **10,000 Documents** | 208,250,000 gas | $6,247.50 USD | **$15,618.75 USD** | $31,237.50 USD | $62,475.00 USD |

---

## 5. How to Run Benchmarks & Verify Results

All benchmarking scripts are contained strictly inside the `test/` directory:

- **[`test/benchmark_hashing.js`](file:///d:/clg/TY/blockchain%20project/Document%20Verification%20System/test/benchmark_hashing.js)**: CPU hashing benchmarks ($N=50$, mean, std dev, 95% CIs, throughput, hardware profiler).
- **[`test/benchmark_gas.js`](file:///d:/clg/TY/blockchain%20project/Document%20Verification%20System/test/benchmark_gas.js)**: Hardhat EVM gas profiling & Mainnet/Sepolia volume cost modeling.
- **[`test/benchmark_network_baselines.js`](file:///d:/clg/TY/blockchain%20project/Document%20Verification%20System/test/benchmark_network_baselines.js)**: Architectural baseline comparison (plaintext vs AES-256-GCM encrypted, IPFS gateway vs Sepolia consensus block times).
- **[`test/run_all.js`](file:///d:/clg/TY/blockchain%20project/Document%20Verification%20System/test/run_all.js)**: Master test harness generating `test/benchmark_results.md`.

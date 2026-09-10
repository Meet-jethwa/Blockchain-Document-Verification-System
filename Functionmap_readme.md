# Blockchain Document Verification System (BDVS) — Function & Code Mapping

This document acts as an architectural bridge between the academic descriptions in the research paper and the reference implementation codebase. It maps the high-level capabilities, protocols, and variables named in the paper to their concrete source code locations, functions, and endpoint routes.

---

## 1. On-Chain Document Registry (Smart Contract)
The smart contract registry acts as the single source of truth for the entire decentralized architecture. It manages immutable cryptographic timestamping, multi-version document lineage chains, fine-grained access control permissions (at both version and root tiers), and cryptographic revocation tracking without storing sensitive document contents on-chain.

* **Contract File:** [`contracts/DocumentRegistry.sol`](./contracts/DocumentRegistry.sol)
* **Solidity Compiler Version:** `^0.8.20`
* **License:** `SPDX (Software Package Data Exchange)-License-Identifier: MIT (Massachusetts Institute of Technology)`

### 1.1 Core Data Structures (`struct Document`)
Defined at [DocumentRegistry.sol:L20-L31](./contracts/DocumentRegistry.sol#L20-L31):
* `address owner`: Ethereum wallet address of the document registrar/owner.
* `string cid`: CID (Content Identifier) pointer (enforced to remain off-chain `""` to decouple proof from storage).
* `uint256 createdAt`: Unix timestamp (`block.timestamp`) recording block mining time.
* `bytes32 rootHash`: 256-bit cryptographic digest of the root version (version 1) anchoring the lineage chain.
* `uint256 version`: 1-based sequential version index under the root hash.
* `bool revoked`: Boolean flag indicating whether this specific version has been invalidated.

### 1.2 State Variables & Storage Mappings
All contract state mappings are defined with `private` visibility to protect raw storage access while allowing controlled public getters:
* `documents` ([L36](./contracts/DocumentRegistry.sol#L36)): `mapping(bytes32 => Document)` — Maps a 32-byte document digest to its full `Document` record.
* `documentsByOwner` ([L41](./contracts/DocumentRegistry.sol#L41)): `mapping(address => bytes32[])` — Tracks the array of all document hashes registered by a user wallet.
* `documentViewers` ([L45](./contracts/DocumentRegistry.sol#L45)): `mapping(bytes32 => mapping(address => bool))` — Per-version access control table.
* `rootViewers` ([L48](./contracts/DocumentRegistry.sol#L48)): `mapping(bytes32 => mapping(address => bool))` — Root-level access table granting read rights across all versions in a tree.
* `versionsByRoot` ([L51](./contracts/DocumentRegistry.sol#L51)): `mapping(bytes32 => bytes32[])` — Chronological array of version hashes under a root document.
* `revokedRoots` ([L54](./contracts/DocumentRegistry.sol#L54)): `mapping(bytes32 => bool)` — Root-level cascade revocation status flag.

### 1.3 Internal Validation & Authorization Helpers
Private/internal functions encapsulating business logic:
* `_exists(bytes32 hash)` ([L74](./contracts/DocumentRegistry.sol#L74)): Returns `true` if `documents[hash].owner != address(0)`.
* `_isRoot(bytes32 hash)` ([L78](./contracts/DocumentRegistry.sol#L78)): Verifies existence and checks if `rootHash == hash`.
* `_rootOf(bytes32 hash)` ([L82](./contracts/DocumentRegistry.sol#L82)): Resolves the root hash for any version in a chain.
* `_isRevoked(bytes32 hash)` ([L88](./contracts/DocumentRegistry.sol#L88)): Evaluates dual-tier revocation: returns `true` if the specific version is revoked OR if `revokedRoots[rootHash]` is active.
* `_isOwner(bytes32 hash, address user)` ([L94](./contracts/DocumentRegistry.sol#L94)): Verifies document ownership against the caller address.
* `_canView(bytes32 hash, address user)` ([L98](./contracts/DocumentRegistry.sol#L98)): Resolves multi-tiered viewer permissions (`owner || documentViewers[hash][user] || rootViewers[root][user]`).

### 1.4 Complete Smart Contract Functions Specification
Comprehensive mapping of all 17 public/external contract functions in [DocumentRegistry.sol](./contracts/DocumentRegistry.sol) corresponding to capabilities in the research paper:

| Paper Capability Name | Function Signature | Direct Code Location | Type & Mutability | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Register Document** | `registerDocument(bytes32 hash, string calldata cid)` | [DocumentRegistry.sol:L116](./contracts/DocumentRegistry.sol#L116) | `external` (State-changing) | Computes and registers the initial root document record (version 1) and assigns ownership to `msg.sender`. |
| **Add Document Version** | `addDocumentVersion(bytes32 rootHash, bytes32 hash, string calldata cid)` | [DocumentRegistry.sol:L150](./contracts/DocumentRegistry.sol#L150) | `external` (State-changing) | Appends a subsequent version digest to an existing active root lineage. Only callable by root owner. |
| **Grant Viewer Access** | `grantViewer(bytes32 hash, address viewer)` | [DocumentRegistry.sol:L179](./contracts/DocumentRegistry.sol#L179) | `external` (State-changing) | Authorizes a specific wallet address to view details for a specific document version. |
| **Revoke Viewer Access** | `revokeViewer(bytes32 hash, address viewer)` | [DocumentRegistry.sol:L195](./contracts/DocumentRegistry.sol#L195) | `external` (State-changing) | Resets viewing permission for a specific version from a viewer wallet. |
| **Check View Permission** | `canViewDocument(bytes32 hash, address user)` | [DocumentRegistry.sol:L209](./contracts/DocumentRegistry.sol#L209) | `external view` (Free call) | Resolves whether a wallet address has read authority over a non-revoked document. |
| **Grant Root Viewer Access** | `grantRootViewer(bytes32 rootHash, address viewer)` | [DocumentRegistry.sol:L220](./contracts/DocumentRegistry.sol#L220) | `external` (State-changing) | Grants viewing permissions for all child versions under a root tree to a recipient wallet. |
| **Revoke Root Viewer Access** | `revokeRootViewer(bytes32 rootHash, address viewer)` | [DocumentRegistry.sol:L236](./contracts/DocumentRegistry.sol#L236) | `external` (State-changing) | Revokes tree-wide viewing authorization under an entire root family. |
| **Check Document Exists / Verify Document** | `verifyDocument(bytes32 hash)` | [DocumentRegistry.sol:L257](./contracts/DocumentRegistry.sol#L257) | `external view` (Free call) | Public zero-cost verification: checks if a hash exists and is currently non-revoked. |
| **Verify Caller Registration** | `verifyMyDocument(bytes32 hash)` | [DocumentRegistry.sol:L273](./contracts/DocumentRegistry.sol#L273) | `external view` (Free call) | Caller-specific verification: checks existence, active status, and confirms `msg.sender == owner`. Prevents replay claim attacks. |
| **Revoke Document** | `revokeDocument(bytes32 hash)` | [DocumentRegistry.sol:L282](./contracts/DocumentRegistry.sol#L282) | `external` (State-changing) | Invalidation of a single version by owner, rendering it unviewable via `getDocument`. |
| **Revoke Document Root** | `revokeDocumentRoot(bytes32 rootHash)` | [DocumentRegistry.sol:L294](./contracts/DocumentRegistry.sol#L294) | `external` (State-changing) | Cascade revocation: owner invalidates root and automatically all descendant version digests. |
| **Check Document Revoked** | `isDocumentRevoked(bytes32 hash)` | [DocumentRegistry.sol:L306](./contracts/DocumentRegistry.sol#L306) | `external view` (Free call) | Inquires whether a specific hash is revoked directly or through its root (reported in paper gas benchmark). |
| **Get Document Version** | `getDocumentVersion(bytes32 hash)` | [DocumentRegistry.sol:L313](./contracts/DocumentRegistry.sol#L313) | `external view` (Free call) | Returns `(bytes32 rootHash, uint256 version)` sequence index for a document digest. |
| **Get Document Versions** | `getDocumentVersions(bytes32 rootHash)` | [DocumentRegistry.sol:L322](./contracts/DocumentRegistry.sol#L322) | `external view` (Free call) | Returns an array of all version hashes linked to an existing root document (reported in paper latency benchmark). |
| **Get Document Metadata** | `getDocumentMeta(bytes32 hash)` | [DocumentRegistry.sol:L332](./contracts/DocumentRegistry.sol#L332) | `external view` (Free call) | Public non-sensitive metadata getter returning `(address owner, uint256 createdAt)` without authorization gates (reported in paper latency benchmark). |
| **Get Document Details** | `getDocument(bytes32 hash)` | [DocumentRegistry.sol:L352](./contracts/DocumentRegistry.sol#L352) | `external view` (Free call) | Protected getter returning `(address owner, string memory cid, uint256 createdAt)`. Enforces access control and revocation gates. |
| **Get My Documents** | `getMyDocuments()` | [DocumentRegistry.sol:L379](./contracts/DocumentRegistry.sol#L379) | `external view` (Free call) | Returns array of all document hashes registered by the calling wallet (`msg.sender`) powering the user dashboard. |

### 1.5 Contract Events & On-Chain Audit Trail
Events logged to EVM (Ethereum Virtual Machine) receipt logs for asynchronous indexing and frontend subscriptions:
* `DocumentRegistered(bytes32 indexed hash, address indexed owner, string cid)` ([L59](./contracts/DocumentRegistry.sol#L59))
* `DocumentVersionAdded(bytes32 indexed rootHash, bytes32 indexed hash, address indexed owner, uint256 version, string cid)` ([L62](./contracts/DocumentRegistry.sol#L62))
* `DocumentRevoked(bytes32 indexed hash, address indexed owner)` ([L63](./contracts/DocumentRegistry.sol#L63))
* `DocumentRootRevoked(bytes32 indexed rootHash, address indexed owner)` ([L64](./contracts/DocumentRegistry.sol#L64))
* `ViewerAccessGranted(bytes32 indexed hash, address indexed owner, address indexed viewer)` ([L67](./contracts/DocumentRegistry.sol#L67))
* `ViewerAccessRevoked(bytes32 indexed hash, address indexed owner, address indexed viewer)` ([L68](./contracts/DocumentRegistry.sol#L68))
* `RootViewerAccessGranted(bytes32 indexed rootHash, address indexed owner, address indexed viewer)` ([L71](./contracts/DocumentRegistry.sol#L71))
* `RootViewerAccessRevoked(bytes32 indexed rootHash, address indexed owner, address indexed viewer)` ([L72](./contracts/DocumentRegistry.sol#L72))

### 1.6 Smart Contract Tooling, Deployment & Benchmark Scripts
* **Hardhat Configuration:** [`hardhat.config.js`](./hardhat.config.js) — Network configs (Hardhat node, Sepolia testnet, Polygon Amoy), compiler options (`0.8.20`), and ethers plugins.
* **Contract Deployment Script:** [`scripts/deploy.js`](./scripts/deploy.js) — Automated deployment script using `ethers.deployContract("DocumentRegistry")` and tracking deployment transaction hashes.
* **Contract Verification & Demo CLI (Command-Line Interface):** [`scripts/demo.js`](./scripts/demo.js) — End-to-end local node demo testing registration, existence verification, and access inspection.
* **EVM (Ethereum Virtual Machine) Gas Benchmark Suite:** [`test/benchmark_gas.js`](./test/benchmark_gas.js) — Comprehensive gas consumption measurements across registration, versioning, access granting, and revocation with fiat USD (United States Dollar) projections across Gwei tiers for ETH (Ether).

---

## 2. Relay Backend (API [Application Programming Interface] Services)
The Node.js backend operates as a middle tier that relays data to IPFS (InterPlanetary File System), validates request claims, and enforces contract permissions.

* **Backend Entry Point:** [`backend/server.js`](./backend/server.js)
* **IPFS (InterPlanetary File System) Connector:** [`backend/ipfs.js`](./backend/ipfs.js)
* **Crypto Helper:** [`backend/fileCrypto.js`](./backend/fileCrypto.js)
* **EVM (Ethereum Virtual Machine) Chain Connector:** [`backend/chain.js`](./backend/chain.js)

| Paper Capability Name | API (Application Programming Interface) Route & Method | Handler Code Location | Description |
| :--- | :--- | :--- | :--- |
| **Check Liveness** | `GET /api/health` | [server.js:L411](./backend/server.js#L411) | Checks server and RPC (Remote Procedure Call) connectivity health. |
| **Upload Encrypted Document** | `POST /api/upload` | [server.js:L551](./backend/server.js#L551) | Encrypts file bytes via `encryptFile`, uploads cipher+metadata to IPFS (InterPlanetary File System). |
| **Verify Uploaded Document** | `POST /api/verify` | [server.js:L714](./backend/server.js#L714) | Computes a local hash on the uploaded file and checks it on-chain. |
| **Verify Digest** | `POST /api/verify-hash` | [server.js:L750](./backend/server.js#L750) | Checks a client-supplied hex digest directly against the blockchain. |
| **Download Document** | `GET /api/documents/:hash/download` | [server.js:L780](./backend/server.js#L780) | Verifies authority, fetches from IPFS (InterPlanetary File System), decrypts payload, and serves bytes. |
| **Get User Documents** | `GET /api/documents` | [server.js:L496](./backend/server.js#L496) | Fetches user's owned and shared accessible document metadata (powers the paper's "My Documents" panel). |
| **Get Shared Documents** | `GET /api/shared-documents` | [server.js:L969](./backend/server.js#L969) | Retrieves enriched metadata for documents shared with the caller wallet. |
| **Share Document Record** | `POST /api/shared-record` | [server.js:L987](./backend/server.js#L987) | Persists off-chain routing record when sharing a document with a designated viewer address. |
| **Revoke Shared Record** | `DELETE /api/shared-record` | [server.js:L1023](./backend/server.js#L1023) | Removes off-chain shared document routing record for a designated viewer address. |
| **Delete Document Record** | `DELETE /api/documents/:hash` | [server.js:L1057](./backend/server.js#L1057) | Purges local server-side routing metadata for a document owned by the caller. |

---

## 3. Client Application (Frontend & Cryptography)
The React client manages wallet logins, transaction signing, data preparation, and UI (User Interface) presentation.

* **Main App File:** [`frontend/src/App.tsx`](./frontend/src/App.tsx)
* **API (Application Programming Interface) Client File:** [`frontend/src/api.ts`](./frontend/src/api.ts)
* **Crypto SDK (Software Development Kit):** [`frontend/src/clientCrypto.ts`](./frontend/src/clientCrypto.ts)

| Paper Capability/Concept | Client-Side Function Name | Location | Description |
| :--- | :--- | :--- | :--- |
| **Local Digest Generation** | `extractHash(file: File)` | [App.tsx:L152](./frontend/src/App.tsx#L152) | Generates `keccak256` of a raw file before ledger interactions. |
| **Wallet-Derived Keys** | `deriveWalletMasterKey(signer, address)` | [clientCrypto.ts:L22](./frontend/src/clientCrypto.ts#L22) | Generates encryption key from signature over a static challenge string using PBKDF2 (Password-Based Key Derivation Function 2). |
| **Browser AES-GCM Encrypt** | `encryptFileClient(file, key)` | [clientCrypto.ts:L59](./frontend/src/clientCrypto.ts#L59) | Standard client-side AES-256-GCM (Advanced Encryption Standard 256-bit Galois/Counter Mode) file encryption. |
| **Browser AES-GCM Decrypt** | `decryptFileClient(cipher, iv, tag, key)` | [clientCrypto.ts:L90](./frontend/src/clientCrypto.ts#L90) | Standard client-side AES-256-GCM (Advanced Encryption Standard 256-bit Galois/Counter Mode) decryption logic with IV (Initialisation Vector) and auth tag verification. |
| **Signed-Challenge Headers** | `signAuthHeaders(signer, address)` | [clientCrypto.ts:L119](./frontend/src/clientCrypto.ts#L119) | Creates request headers mapping signature and timestamp to wallet using EIP-191 (Ethereum Improvement Proposal 191). |
| **Download & Integrity Attestation** | Download & hash re-verification flow | [App.tsx:L138-L155](./frontend/src/App.tsx#L138-L155) | Downloads file bytes, validates headers, and populates the paper's "Hash Verified" attestation panel. |

---

## 4. Key Code Snippets for the Paper

### A. On-Chain Document Registration (Solidity)
Direct Location: [DocumentRegistry.sol:L116-L141](./contracts/DocumentRegistry.sol#L116-L141)
```solidity
/**
 * @notice Registers a new document hash on the blockchain
 * @param hash The keccak256 hash of the document (bytes32 = 32 bytes = 256 bits)
 * @param cid The IPFS (InterPlanetary File System) Content Identifier where the actual file is stored (kept off-chain)
 */
function registerDocument(bytes32 hash, string calldata cid) external {
    require(documents[hash].owner == address(0), "Document already exists");
    require(bytes(cid).length == 0, "CID must remain off-chain"); // Enforces separation of proof and content
    
    documents[hash] = Document({
        owner: msg.sender,
        cid: "",
        createdAt: block.timestamp,
        rootHash: hash, // First version sets root hash as its own hash
        version: 1,
        revoked: false
    });
    
    documentsByOwner[msg.sender].push(hash);
    versionsByRoot[hash].push(hash);
    
    emit DocumentRegistered(hash, msg.sender, "");
}
```

### B. Document Versioning & Lineage Chaining (Solidity)
Direct Location: [DocumentRegistry.sol:L150-L171](./contracts/DocumentRegistry.sol#L150-L171)
```solidity
/**
 * @notice Adds a new version under an existing document root
 * @param rootHash The original (version 1) document hash
 * @param hash The new version's document hash
 * @param cid The IPFS (InterPlanetary File System) CID (Content Identifier) for this new version
 * @dev Only the root owner can add versions. Root must not be revoked.
 */
function addDocumentVersion(bytes32 rootHash, bytes32 hash, string calldata cid) external {
    require(_exists(rootHash), "Root not found");
    require(_isRoot(rootHash), "Not a root hash");
    require(!_isRevoked(rootHash), "Root revoked");
    require(_isOwner(rootHash, msg.sender), "Only root owner can add versions");
    require(documents[hash].owner == address(0), "Document already exists");
    require(bytes(cid).length == 0, "CID must remain off-chain");

    uint256 nextVersion = versionsByRoot[rootHash].length + 1;
    documents[hash] = Document({
        owner: msg.sender,
        cid: "",
        createdAt: block.timestamp,
        rootHash: rootHash,
        version: nextVersion,
        revoked: false
    });
    documentsByOwner[msg.sender].push(hash);
    versionsByRoot[rootHash].push(hash);

    emit DocumentVersionAdded(rootHash, hash, msg.sender, nextVersion, "");
}
```

### C. Multi-Tiered Access Control & View Authorization (Solidity)
Direct Location: [DocumentRegistry.sol:L98-L102](./contracts/DocumentRegistry.sol#L98-L102) & [L209-L213](./contracts/DocumentRegistry.sol#L209-L213)
```solidity
/**
 * @dev Internal access resolver enforcing Owner || Document Viewer || Root Viewer
 */
function _canView(bytes32 hash, address user) internal view returns (bool) {
    if (!_exists(hash)) return false;
    bytes32 root = documents[hash].rootHash;
    return _isOwner(hash, user) || documentViewers[hash][user] || rootViewers[root][user];
}

/**
 * @notice Public read-only gate checking document viewing rights and active revocation status
 */
function canViewDocument(bytes32 hash, address user) external view returns (bool) {
    if (!_exists(hash)) return false;
    if (_isRevoked(hash)) return false;
    return _canView(hash, user);
}
```

### D. Dual-Tier Revocation & Cascade Check (Solidity)
Direct Location: [DocumentRegistry.sol:L88-L92](./contracts/DocumentRegistry.sol#L88-L92) & [L294-L301](./contracts/DocumentRegistry.sol#L294-L301)
```solidity
/**
 * @dev Evaluates whether document is revoked individually OR via root cascade
 */
function _isRevoked(bytes32 hash) internal view returns (bool) {
    if (!_exists(hash)) return false;
    Document storage d = documents[hash];
    return d.revoked || revokedRoots[d.rootHash];
}

/**
 * @notice Revoke an entire document root (invalidates all versions under the root simultaneously)
 * @dev Only the root owner can revoke.
 */
function revokeDocumentRoot(bytes32 rootHash) external {
    require(_exists(rootHash), "Root not found");
    require(_isRoot(rootHash), "Not a root hash");
    require(_isOwner(rootHash, msg.sender), "Only root owner can revoke");
    require(!revokedRoots[rootHash], "Already revoked");
    revokedRoots[rootHash] = true;
    emit DocumentRootRevoked(rootHash, msg.sender);
}
```

### E. Client-Side Cryptographic Key Derivation (TypeScript)
Direct Location: [clientCrypto.ts:L22-L55](./frontend/src/clientCrypto.ts#L22-L55)
```typescript
/**
 * Derives a 256-bit AES-GCM (Advanced Encryption Standard — Galois/Counter Mode) CryptoKey from a wallet signature using PBKDF2 (Password-Based Key Derivation Function 2).
 */
export async function deriveWalletMasterKey(signer: ethers.Signer, walletAddress: string): Promise<CryptoKey> {
  const normalizedAddr = walletAddress.toLowerCase();
  const challenge = `BDVS Encryption Key Generation: ${normalizedAddr}`;
  const signature = await signer.signMessage(challenge); // EIP-191 (Ethereum Improvement Proposal 191) message signing prompt

  const encoder = new TextEncoder();
  const signatureBytes = encoder.encode(signature);
  const saltBytes = encoder.encode(`bdvs-salt-${normalizedAddr}`);

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    signatureBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}
```

### F. Client-Side EIP-191 Auth Signature (TypeScript)
Direct Location: [clientCrypto.ts:L119-L135](./frontend/src/clientCrypto.ts#L119-L135)
```typescript
/**
 * Generates EIP-191 (Ethereum Improvement Proposal 191) cryptographic wallet signature headers to prove key ownership.
 */
export async function signAuthHeaders(signer: ethers.Signer, walletAddress: string): Promise<SignedAuthHeaders> {
  const timestamp = Date.now();
  const normalizedAddr = walletAddress.toLowerCase();
  const challenge = `BDVS Authentication: ${normalizedAddr}:${timestamp}`;
  const signature = await signer.signMessage(challenge);

  return {
    'x-wallet-address': walletAddress,
    'x-wallet-signature': signature,
    'x-wallet-timestamp': String(timestamp),
  };
}
```

### G. File Hashing (TypeScript Client)
Direct Location: [App.tsx:L152-L155](./frontend/src/App.tsx#L152-L155)
```typescript
async function extractHash(file: File) {
  const buffer = await file.arrayBuffer();
  return ethers.keccak256(new Uint8Array(buffer));
}
```

---

## 5. Implementation Notes & Architectural Design Decisions

To bridge the theoretical/architectural concepts described in the paper with the running codebase, the implementation coordinates specific tradeoffs and structures:

### A. Cryptographic Hashing Integration (Keccak256 vs. SHA-256 [Secure Hash Algorithm 256-bit])
The research paper specifies the use of `keccak256` for EVM (Ethereum Virtual Machine) gas efficiency and on-chain consistency. In this implementation, the utility function representing this operation is named `hashFileSha256` in [chain.js](./backend/chain.js#L655) to maintain backwards compatibility with earlier API (Application Programming Interface) versions. However, it computes a standard `keccak256` digest via `ethers.keccak256` to align with the paper's EVM (Ethereum Virtual Machine)-native model. Legacy SHA-256 (Secure Hash Algorithm 256-bit) records are handled via `hashFileSha256Legacy` to preserve validation compatibility for early registries.

### B. Encryption Pipeline & Resource Optimization (Client-Side vs. Backend-Assisted)
The paper outlines a model where all symmetric file encryption and decryption are executed locally in the browser to maintain a zero-knowledge relay backend.
* **Client-Side Utilities:** The browser-based encryption/decryption routines (`deriveWalletMasterKey`, `encryptFileClient`, `decryptFileClient`) are fully implemented and available in [clientCrypto.ts](./frontend/src/clientCrypto.ts) using the native browser Web Crypto API (Application Programming Interface).
* **Backend-Assisted Pipeline:** For the demo and prototype setup, the active pipeline utilizes backend-assisted encryption and decryption (`handleUpload` in [server.js](./backend/server.js#L551)) using Node's `crypto` module. This design choice optimizes browser thread utilization during large file uploads in web UI (User Interface) environments, while using the same key-wrapping logic (via metadata envelopes/manifest CIDs [Content Identifiers]) described in the paper.

### C. Requester Identity & Signature Verification
To authenticate requests, the client generates cryptographic proof headers (address, signature, and timestamp) using `signAuthHeaders()` in [clientCrypto.ts](./frontend/src/clientCrypto.ts#L119). In this version of the prototype, the backend extracts the requester's address via `getRequesterAddress()` in [server.js](./backend/server.js#L95) to coordinate contract-level authorization queries, laying the groundwork for full cryptographic signature recovery (`ecrecover`) in production-ready environments.

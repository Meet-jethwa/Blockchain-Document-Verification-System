# Blockchain Document Verification System (BDVS) — Function & Code Mapping

This document acts as an architectural bridge between the academic descriptions in the research paper and the reference implementation codebase. It maps the high-level capabilities, protocols, and variables named in the paper to their concrete source code locations, functions, and endpoint routes.

---

## 1. On-Chain Document Registry (Smart Contract)
The smart contract registry maintains the core truth about registration, versioning, access control permissions, and revocation. 

* **Contract File:** [DocumentRegistry.sol](./contracts/DocumentRegistry.sol)

| Paper Capability Name | Solidity Function | Location | Description |
| :--- | :--- | :--- | :--- |
| **Register Document** | `registerDocument(bytes32 hash, string calldata cid)` | [DocumentRegistry.sol:L116](./contracts/DocumentRegistry.sol#L116) | Computes and registers the initial root document hash. |
| **Add Document Version** | `addDocumentVersion(bytes32 rootHash, bytes32 hash, string calldata cid)` | [DocumentRegistry.sol:L150](./contracts/DocumentRegistry.sol#L150) | Appends a new version digest onto an existing root mapping. |
| **Grant Viewer Access** | `grantViewer(bytes32 hash, address viewer)` | [DocumentRegistry.sol:L179](./contracts/DocumentRegistry.sol#L179) | Authorizes a specific wallet to view a version. |
| **Revoke Viewer Access** | `revokeViewer(bytes32 hash, address viewer)` | [DocumentRegistry.sol:L195](./contracts/DocumentRegistry.sol#L195) | Resets the viewing permission for a specific version. |
| **Grant Root Viewer Access** | `grantRootViewer(bytes32 rootHash, address viewer)` | [DocumentRegistry.sol:L220](./contracts/DocumentRegistry.sol#L220) | Authorizes viewing permissions for all child versions under a root. |
| **Revoke Root Viewer Access**| `revokeRootViewer(bytes32 rootHash, address viewer)` | [DocumentRegistry.sol:L236](./contracts/DocumentRegistry.sol#L236) | Revokes viewing access to all versions under a root. |
| **Check View Permission** | `canViewDocument(bytes32 hash, address user)` | [DocumentRegistry.sol:L209](./contracts/DocumentRegistry.sol#L209) | Resolves if a wallet has access to a document (owner/viewer check). |
| **Check Document Exists** | `verifyDocument(bytes32 hash)` | [DocumentRegistry.sol:L257](./contracts/DocumentRegistry.sol#L257) | Read-only check for whether a hash is registered and active. |
| **Revoke Document** | `revokeDocument(bytes32 hash)` | [DocumentRegistry.sol:L282](./contracts/DocumentRegistry.sol#L282) | Invalidate a specific document version. |
| **Revoke Document Root** | `revokeDocumentRoot(bytes32 rootHash)` | [DocumentRegistry.sol:L294](./contracts/DocumentRegistry.sol#L294) | Revokes all versions sharing the root document chain. |

---

## 2. Relay Backend (API Services)
The Node.js backend operates as a middle tier that relays data to IPFS, validates request claims, and enforces contract permissions.

* **Backend Entry Point:** [server.js](./backend/server.js)
* **IPFS Connector:** [ipfs.js](./backend/ipfs.js)
* **Crypto Helper:** [fileCrypto.js](./backend/fileCrypto.js)

| Paper Capability Name | API Route & Method | Handler Code Location | Description |
| :--- | :--- | :--- | :--- |
| **Check Liveness** | `GET /api/health` | [server.js:L411](./backend/server.js#L411) | Checks server and RPC connectivity health. |
| **Upload Encrypted Document** | `POST /api/upload` | [server.js:L551](./backend/server.js#L551) | Encrypts file bytes via `encryptFile`, uploads cipher+metadata to IPFS. |
| **Verify Uploaded Document** | `POST /api/verify` | [server.js:L714](./backend/server.js#L714) | Computes a local hash on the uploaded file and checks it on-chain. |
| **Verify Digest** | `POST /api/verify-hash` | [server.js:L750](./backend/server.js#L750) | Checks a client-supplied hex digest directly against the blockchain. |
| **Download Document** | `GET /api/documents/:hash/download` | [server.js:L780](./backend/server.js#L780) | Verifies authority, fetches from IPFS, decrypts payload, and serves bytes. |

---

## 3. Client Application (Frontend & Cryptography)
The React client manages wallet logins, transaction signing, data preparation, and interface presentation.

* **Main App File:** [App.tsx](./frontend/src/App.tsx)
* **API Client File:** [api.ts](./frontend/src/api.ts)
* **Crypto SDK:** [clientCrypto.ts](./frontend/src/clientCrypto.ts)

| Paper Capability/Concept | Client-Side Function Name | Location | Description |
| :--- | :--- | :--- | :--- |
| **Local Digest Generation** | `extractHash(file: File)` | [App.tsx:L152](./frontend/src/App.tsx#L152) | Generates `keccak256` of a raw file before ledger interactions. |
| **Wallet-Derived Keys** | `deriveWalletMasterKey(signer, address)` | [clientCrypto.ts:L22](./frontend/src/clientCrypto.ts#L22) | Generates encryption key from signature over a static challenge string. |
| **Browser AES-GCM Encrypt** | `encryptFileClient(file, key)` | [clientCrypto.ts:L59](./frontend/src/clientCrypto.ts#L59) | Standard client-side AES-256-GCM file encryption. |
| **Browser AES-GCM Decrypt** | `decryptFileClient(cipher, iv, tag, key)` | [clientCrypto.ts:L90](./frontend/src/clientCrypto.ts#L90) | Standard client-side AES-256-GCM decryption logic. |
| **Signed-Challenge Headers** | `signAuthHeaders(signer, address)` | [clientCrypto.ts:L119](./frontend/src/clientCrypto.ts#L119) | Creates request headers mapping signature and timestamp to wallet. |

---

## 4. Key Code Snippets for the Paper

### A. On-Chain Document Registration (Solidity)
```solidity
/**
 * @notice Registers a new document hash on the blockchain
 * @param hash The keccak256 hash of the document (bytes32 = 32 bytes = 256 bits)
 * @param cid The IPFS Content Identifier where the actual file is stored (kept off-chain)
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

### B. Client-Side Cryptographic Key Derivation (TypeScript)
```typescript
/**
 * Derives a 256-bit AES-GCM CryptoKey from a wallet signature using PBKDF2.
 */
export async function deriveWalletMasterKey(signer: ethers.Signer, walletAddress: string): Promise<CryptoKey> {
  const normalizedAddr = walletAddress.toLowerCase();
  const challenge = `BDVS Encryption Key Generation: ${normalizedAddr}`;
  const signature = await signer.signMessage(challenge); // EIP-191 message signing prompt

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

### C. Client-Side EIP-191 Auth Signature (TypeScript)
```typescript
/**
 * Generates EIP-191 cryptographic wallet signature headers to prove key ownership.
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

### D. File Hashing (TypeScript Client)
```typescript
async function extractHash(file: File) {
  const buffer = await file.arrayBuffer();
  return ethers.keccak256(new Uint8Array(buffer));
}
```

---

## 5. Implementation Notes & Architectural Design Decisions

To bridge the theoretical/architectural concepts described in the paper with the running codebase, the implementation coordinates specific tradeoffs and structures:

### A. Cryptographic Hashing Integration (Keccak256 vs. SHA-256)
The research paper specifies the use of `keccak256` for EVM gas efficiency and on-chain consistency. In this implementation, the utility function representing this operation is named `hashFileSha256` in [chain.js](./backend/chain.js#L655) to maintain backwards compatibility with earlier API versions. However, it computes a standard `keccak256` digest via `ethers.keccak256` to align with the paper's EVM-native model. Legacy SHA-256 records are handled via `hashFileSha256Legacy` to preserve validation compatibility for early registries.

### B. Encryption Pipeline & Resource Optimization (Client-Side vs. Backend-Assisted)
The paper outlines a model where all symmetric file encryption and decryption are executed locally in the browser to maintain a zero-knowledge relay backend.
* **Client-Side Utilities:** The browser-based encryption/decryption routines (`deriveWalletMasterKey`, `encryptFileClient`, `decryptFileClient`) are fully implemented and available in [clientCrypto.ts](./frontend/src/clientCrypto.ts) using the native browser Web Crypto API.
* **Backend-Assisted Pipeline:** For the demo and prototype setup, the active pipeline utilizes backend-assisted encryption and decryption (`handleUpload` in [server.js](./backend/server.js#L551)) using Node's `crypto` module. This design choice optimizes browser thread utilization during large file uploads in web UI environments, while using the same key-wrapping logic (via metadata envelopes/manifest CIDs) described in the paper.

### C. Requester Identity & Signature Verification
To authenticate requests, the client generates cryptographic proof headers (address, signature, and timestamp) using `signAuthHeaders()` in [clientCrypto.ts](./frontend/src/clientCrypto.ts#L119). In this version of the prototype, the backend extracts the requester's address via `getRequesterAddress()` in [server.js](./backend/server.js#L95) to coordinate contract-level authorization queries, laying the groundwork for full cryptographic signature recovery (`ecrecover`) in production-ready environments.

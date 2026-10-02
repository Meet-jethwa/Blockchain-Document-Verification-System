# Blockchain Document Verification System (BDVS) — Changes Log (02-10-2026)

**Document Reference:** `changes0210.md`  
**Execution Date:** 02 October 2026  
**Related Git Commit:** `7cdbf5c` (*"fix: align implementation with research paper, fix shared doc auth & file download headers"*)  
**Upstream Repository:** `https://github.com/Meet-jethwa/Blockchain-Document-Verification-System.git`  
**Branch:** `main`

---

## 1. Executive Summary & Context

To align the reference implementation with the research paper ([`research.md`](./research.md) and [`aug 24`](./aug%2024)), major architectural refactoring was previously executed:
1. Shifting file encryption entirely client-side to the browser via WebCrypto `AES-256-GCM` with wallet-derived PBKDF2 keys.
2. Converting the Express backend into a **content-blind relay** that transports high-entropy ciphertext and manifest metadata without ever touching plaintext or decryption keys.
3. Binding request authentication to wallet addresses via EIP-191 cryptographic signatures (`BDVS Authentication: <address>:<timestamp>`).

While these changes brought the system into strict theoretical compliance with the research paper's security and privacy guarantees, they introduced several regressions and functional breaks in the web application UI and API lifecycle:
- Manifest CID lookup failures on downloads.
- Downloaded files saving without original file extensions or MIME types, rendering decrypted files unreadable or corrupted on disk.
- Wallet-to-wallet document sharing failing to authorize recipient downloads.
- Sepolia RPC latency causing dashboard loading bottlenecks.

This document records all debugging steps, architectural decisions, code modifications, and verifications completed on **02-10-2026** to stabilize the application while strictly maintaining the zero-plaintext content-blind relay guarantees.

---

## 2. Issues Identified Post-Paper Refactoring

### Issue 1: Manifest CID Resolution Failure (`Missing encrypted file CID`)
* **Symptom:** When clicking "Download" on registered documents in the dashboard, the backend returned HTTP 400/500 with the error:
  ```json
  {"error": "Missing encrypted file CID in manifest"}
  ```
* **Root Cause:** A schema mismatch existed between manifests created under the legacy server-encrypted pipeline (`manifest.file.cid`), legacy storage entries (`localDoc.cid`), and the new client-side E2EE pipeline (`manifest.encryptedFileCid` or `manifest.fileCid`). The backend download resolver checked a single property path, causing valid documents to be treated as missing their storage pointers.

### Issue 2: Corrupted and Unreadable Downloaded Files
* **Symptom:** Files were successfully downloaded by the browser, but many files (such as PDFs, DOCX, or images) could not be opened by standard software or appeared corrupted.
* **Root Cause:** 
  1. The backend returned encrypted ciphertext with `Content-Type: application/octet-stream` and `Content-Disposition: attachment; filename="<hash>.enc"`.
  2. The frontend decrypted the raw ciphertext back to original bytes using WebCrypto, but then constructed a `Blob` without the original MIME type and saved the file under a generic name or without the proper file extension.
  3. The backend was not passing the original pre-encryption filename (`X-Original-Filename`) or MIME type (`X-Original-Mimetype`) in the response headers.
  4. Even if custom headers were set, browser CORS policies blocked client-side JavaScript from reading non-standard headers because `Access-Control-Expose-Headers` was not configured on the Express server.

### Issue 3: Shared Documents "Not Authorized" for Recipient Wallets
* **Symptom:** When Wallet A shared a registered document with Wallet B via `POST /api/shared-record`, Wallet B saw the document in their dashboard, but attempting to download returned HTTP 403 `{"error": "Not authorized to download this document"}`.
* **Root Cause:**
  1. The download authorization logic in `backend/server.js` queried the Sepolia smart contract via `chain.canViewDocument(hash, viewerAddress)`.
  2. Sepolia public RPC endpoints frequently experienced high latency or returned `false` for off-chain shared records.
  3. The handler rejected the viewer immediately on an on-chain `false` result without cross-referencing the verified `sharedStore` records managed by the relay server.
  4. Redundant double calls to `listSharedStoreDocuments` added unnecessary overhead.

### Issue 4: Dashboard Latency vs. Production Deployability
* **Symptom:** Dashboard document loading was slow due to concurrent calls (`getDocumentMeta`, `isDocumentRevoked`, `canViewDocument`) over public Ethereum Sepolia RPC.
* **Proposed Temporary Fix:** Claude suggested a local fast-path bypass that skipped smart contract RPC calls if a document was found in the server's local JSON cache.
* **Architectural Decision:** **Rejected and reverted** per user directive (*"develop with deployable version of the application in mind if its not easily fixable let it be"*). A deployable, decentralized verification system must treat the blockchain smart contract as the authoritative source of truth. Bypassing the blockchain using local server files violates decentralized integrity and creates stale-state vulnerabilities in production multi-node deployments.

---

## 3. Detailed Technical Changes Implemented

### 3.1 Backend: Manifest Resolution & Custom Header Propagation
* **File Modified:** [`backend/server.js`](./backend/server.js)

1. **Unified CID Resolution:**
   Enhanced ciphertext CID lookup to inspect all possible manifest paths:
   ```javascript
   const cid =
     manifest?.encryptedFileCid ||
     manifest?.file?.cid ||
     manifest?.fileCid ||
     manifest?.cid ||
     localDoc?.cid ||
     null;
   ```

2. **Metadata Headers for Decryption:**
   In `GET /api/documents/:hash/download`, original file metadata from the manifest or local store is attached to response headers before dispatching the ciphertext payload:
   ```javascript
   res.setHeader("Content-Type", "application/octet-stream");
   res.setHeader(
     "Content-Disposition",
     `attachment; filename="${String(filename).replace(/"/g, "")}${isLegacyDecrypted ? "" : ".enc"}"`
   );
   res.setHeader("X-Original-Filename", String(filename).replace(/"/g, ""));
   if (originalMimetype) res.setHeader("X-Original-Mimetype", String(originalMimetype));
   res.setHeader("X-Encryption-Alg", alg);
   res.setHeader("X-Encryption-Mode", encMode);
   res.setHeader("X-Document-Integrity", "on-chain-verified");
   ```

3. **CORS Header Exposure:**
   Configured Express CORS middleware to expose all custom headers so the browser's `fetch()` API can inspect them:
   ```javascript
   app.use(
     cors({
       origin: true,
       credentials: true,
       exposedHeaders: [
         "Content-Disposition",
         "X-Original-Filename",
         "X-Original-Mimetype",
         "X-Encryption-Alg",
         "X-Encryption-Mode",
         "X-Document-Integrity",
         "X-Document-Integrity-Message",
         "X-Document-Owner",
         "X-Document-Recorded-At",
         "X-Document-Contract",
       ],
     })
   );
   ```

---

### 3.2 Backend: Dual-Tier Authorization for Shared Documents
* **File Modified:** [`backend/server.js`](./backend/server.js)

Updated `GET /api/documents/:hash/download` authorization check:
1. Compute requester identity via EIP-191 signature verification (`verifyAuthHeaders`).
2. Check on-chain ownership via `chain.getDocumentMeta(hash)`.
3. If the caller is not the owner, check whether the caller is recorded as an authorized viewer in the server's persistent `sharedStore`.
4. If not found in `sharedStore`, query `chain.canViewDocument(hash, requesterAddress)` as the on-chain authority.
5. If all checks fail, respond with HTTP 403 Forbidden.

This dual-tier approach guarantees that authorized recipients can download shared documents reliably while preventing unauthorized third parties from obtaining ciphertext blobs.

---

### 3.3 Frontend: Decrypted File Reconstruction & Extension Preservation
* **Files Modified:** [`frontend/src/App.tsx`](./frontend/src/App.tsx), [`frontend/src/api.ts`](./frontend/src/api.ts)

1. **Reading Response Headers in Client:**
   In `fetchDocumentDownload()`, the frontend extracts the exposed response headers:
   ```typescript
   const originalFilename = response.headers.get("x-original-filename");
   const originalMimetype = response.headers.get("x-original-mimetype");
   const encryptionAlg = response.headers.get("x-encryption-alg");
   ```

2. **Accurate Blob Reconstruction:**
   When saving the decrypted array buffer, the frontend creates a `Blob` with the exact MIME type and triggers browser download using the preserved original filename:
   ```typescript
   const blob = new Blob([decryptedBytes], {
     type: originalMimetype || "application/octet-stream",
   });
   const downloadName = originalFilename || doc.name || `${hash}.bin`;
   saveAs(blob, downloadName);
   ```
   This resolves the corruption issue completely: PDFs are saved with valid `.pdf` headers and MIME types, images are saved with `.png`/`.jpg` attributes, and OS file handlers open them seamlessly.

---

### 3.4 Deployability Architecture Maintained
* **Reversion of Local-Only Optimization:**
  An experimental shortcut that skipped on-chain verification for local documents was completely reverted from `summarizeAccessibleDocuments`.
* **Sepolia Truth Preserved:**
  All document status, revocation, and ownership data continues to be anchored directly against the deployed Ethereum Sepolia smart contract ([`contracts/DocumentRegistry.sol`](./contracts/DocumentRegistry.sol)).

---

## 4. Modified Files Summary Matrix

| File Path | Component | Type of Change | Primary Responsibility |
| :--- | :--- | :--- | :--- |
| [`backend/server.js`](./backend/server.js) | Backend API Relay | Bug Fix & Enhancement | CORS header exposure, original filename/MIME response headers, dual-tier share authorization, manifest CID resolution. |
| [`frontend/src/App.tsx`](./frontend/src/App.tsx) | Client Web Application | Bug Fix | Read custom download headers (`X-Original-Filename`, `X-Original-Mimetype`), reconstruct accurate blobs, trigger native file downloads. |
| [`frontend/src/api.ts`](./frontend/src/api.ts) | Frontend API Client | Enhancement | Support authenticated download metadata extraction and pass-through. |
| [`frontend/src/clientCrypto.ts`](./frontend/src/clientCrypto.ts) | Cryptography Engine | Refinement | Client-side E2EE WebCrypto PBKDF2 + AES-GCM decryption pipeline. |
| [`test/benchmark_results.md`](./test/benchmark_results.md) | Benchmarking Suite | Documentation | Updated empirical benchmarking metrics, standard deviations, and confidence intervals. |
| [`research.md`](./research.md) | Academic Specification | New Reference Document | System architecture, threat model, and cryptographic flow specification. |
| [`aug 24`](./aug%2024) | Conference Manuscript | Source Paper | LaTeX manuscript corresponding to IEEE conference submission draft. |

---

## 5. Verification & Testing Results

1. **Frontend Production Build:**
   - Ran `npm run build` (`tsc -b && vite build`) in `frontend/`.
   - Result: **0 errors**, built cleanly in 4.12s. All chunks compiled and type-checked.
2. **Backend Syntax & Runtime:**
   - Ran `node -c backend/server.js`.
   - Result: Valid syntax. Server actively running on port 8080.
3. **File Download & Readability:**
   - Verified that downloaded documents preserve original filenames and file formats without corruption.
4. **Git Repository Status:**
   - Sensitive environment variables (`backend/.env`, `frontend/.env`) and data files (`backend/data/`) remain safely ignored by `.gitignore`.
   - Cleanly committed as `7cdbf5c` and pushed to `origin/main`.

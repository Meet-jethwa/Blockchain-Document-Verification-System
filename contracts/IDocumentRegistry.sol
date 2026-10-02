// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title IDocumentRegistry
 * @notice Interface for the DocumentRegistry smart contract.
 *
 * This interface is provided to allow external contracts or off-chain tooling
 * to interact with the registry in a type-safe, upgrade-compatible way.
 * All state-changing functions emit corresponding events defined here.
 *
 * Key design notes (§IV-C):
 * - CID is deliberately NOT stored on-chain (kept off-chain in the backend index).
 *   registerDocument / addDocumentVersion require an empty CID string.
 * - Access control (grantViewer / revokeViewer) is relay-level only; the grantee
 *   receives retrieval authorization but cannot decrypt without the owner's key.
 */
interface IDocumentRegistry {

    // ─── Events ────────────────────────────────────────────────────────────────

    event DocumentRegistered(bytes32 indexed hash, address indexed owner, string cid);
    event DocumentVersionAdded(
        bytes32 indexed rootHash,
        bytes32 indexed hash,
        address indexed owner,
        uint256 version,
        string cid
    );
    event DocumentRevoked(bytes32 indexed hash, address indexed owner);
    event DocumentRootRevoked(bytes32 indexed rootHash, address indexed owner);
    event ViewerAccessGranted(bytes32 indexed hash, address indexed owner, address indexed viewer);
    event ViewerAccessRevoked(bytes32 indexed hash, address indexed owner, address indexed viewer);
    event RootViewerAccessGranted(bytes32 indexed rootHash, address indexed owner, address indexed viewer);
    event RootViewerAccessRevoked(bytes32 indexed rootHash, address indexed owner, address indexed viewer);

    // ─── Registration ──────────────────────────────────────────────────────────

    /**
     * @notice Registers a new document hash as version 1 (root).
     * @param hash keccak256 digest of the plaintext document.
     * @param cid  Must be empty string (""). CID is kept off-chain.
     */
    function registerDocument(bytes32 hash, string calldata cid) external;

    /**
     * @notice Adds a new version under an existing document root.
     * @param rootHash Hash of the version-1 (root) document.
     * @param hash     keccak256 digest of the new version's plaintext.
     * @param cid      Must be empty string (""). CID is kept off-chain.
     */
    function addDocumentVersion(bytes32 rootHash, bytes32 hash, string calldata cid) external;

    // ─── Revocation ────────────────────────────────────────────────────────────

    /**
     * @notice Revokes a specific document version.
     * @param hash The document hash to revoke.
     */
    function revokeDocument(bytes32 hash) external;

    /**
     * @notice Revokes all versions under a root hash.
     * @param rootHash The root (version-1) hash.
     */
    function revokeDocumentRoot(bytes32 rootHash) external;

    // ─── Access control ────────────────────────────────────────────────────────

    /**
     * @notice Grants relay-level retrieval access to a viewer for a specific version.
     *         Note: this authorises the backend relay to serve the ciphertext; it does
     *         not give the viewer a decryption key (§IV-C).
     * @param hash   The document hash.
     * @param viewer The viewer wallet address.
     */
    function grantViewer(bytes32 hash, address viewer) external;

    /**
     * @notice Revokes relay-level retrieval access for a viewer on a specific version.
     */
    function revokeViewer(bytes32 hash, address viewer) external;

    /**
     * @notice Grants relay-level retrieval access at the root level (all versions).
     */
    function grantRootViewer(bytes32 rootHash, address viewer) external;

    /**
     * @notice Revokes root-level retrieval access.
     */
    function revokeRootViewer(bytes32 rootHash, address viewer) external;

    // ─── Queries ───────────────────────────────────────────────────────────────

    /**
     * @notice Returns true iff the hash is registered and not revoked.
     */
    function verifyDocument(bytes32 hash) external view returns (bool);

    /**
     * @notice Returns true iff the CALLER is the registered owner and the hash is not revoked.
     */
    function verifyMyDocument(bytes32 hash) external view returns (bool);

    /**
     * @notice Returns true iff `user` has access to `hash` (owner or granted viewer) and it is not revoked.
     */
    function canViewDocument(bytes32 hash, address user) external view returns (bool);

    /**
     * @notice Returns whether `hash` is revoked (by version or by root).
     */
    function isDocumentRevoked(bytes32 hash) external view returns (bool);

    /**
     * @notice Returns the non-sensitive on-chain metadata for a document.
     * @return owner     The wallet address that registered the document.
     * @return createdAt Unix timestamp (seconds) of the registration block.
     */
    function getDocumentMeta(bytes32 hash) external view returns (address owner, uint256 createdAt);

    /**
     * @notice Returns the root hash and version number for a given document hash.
     */
    function getDocumentVersion(bytes32 hash) external view returns (bytes32 rootHash, uint256 version);

    /**
     * @notice Returns all version hashes registered under a root (includes root itself as version 1).
     */
    function getDocumentVersions(bytes32 rootHash) external view returns (bytes32[] memory);

    /**
     * @notice Returns all document hashes registered by the CALLER's wallet.
     */
    function getMyDocuments() external view returns (bytes32[] memory);

    /**
     * @notice Returns full document record. Reverts if document is revoked or caller lacks access.
     * @return owner     Registrant wallet address.
     * @return cid       Always "" (CID is not stored on-chain).
     * @return createdAt Unix timestamp of registration.
     */
    function getDocument(bytes32 hash) external view returns (address owner, string memory cid, uint256 createdAt);
}

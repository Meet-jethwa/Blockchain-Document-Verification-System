// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DocumentRegistry
 * @notice Stores cryptographic hashes of documents on the Ethereum blockchain.
 *         CIDs are NOT stored on-chain (they live in the backend database).
 *         Only the hash, owner, timestamp, version, and revocation status are on-chain.
 */
contract DocumentRegistry {

    struct Document {
        address owner;
        uint256 createdAt;

        // Versioning
        bytes32 rootHash;
        uint256 version;

        // Revocation
        bool revoked;
    }

    mapping(bytes32 => Document) private documents;
    mapping(address => bytes32[]) private documentsByOwner;

    // Per-document access control
    mapping(bytes32 => mapping(address => bool)) private documentViewers;

    // Root-level access control (applies to all versions under a root hash)
    mapping(bytes32 => mapping(address => bool)) private rootViewers;

    // Root hash -> list of version hashes (includes root itself as version 1)
    mapping(bytes32 => bytes32[]) private versionsByRoot;

    // Root hash revocation (revokes all versions under the root)
    mapping(bytes32 => bool) private revokedRoots;

    event DocumentRegistered(bytes32 indexed hash, address indexed owner);

    event DocumentVersionAdded(bytes32 indexed rootHash, bytes32 indexed hash, address indexed owner, uint256 version);
    event DocumentRevoked(bytes32 indexed hash, address indexed owner);
    event DocumentRootRevoked(bytes32 indexed rootHash, address indexed owner);

    event ViewerAccessGranted(bytes32 indexed hash, address indexed owner, address indexed viewer);
    event ViewerAccessRevoked(bytes32 indexed hash, address indexed owner, address indexed viewer);

    event RootViewerAccessGranted(bytes32 indexed rootHash, address indexed owner, address indexed viewer);
    event RootViewerAccessRevoked(bytes32 indexed rootHash, address indexed owner, address indexed viewer);

    function _exists(bytes32 hash) internal view returns (bool) {
        return documents[hash].owner != address(0);
    }

    function _isRoot(bytes32 hash) internal view returns (bool) {
        return _exists(hash) && documents[hash].rootHash == hash;
    }

    function _rootOf(bytes32 hash) internal view returns (bytes32) {
        Document storage d = documents[hash];
        require(d.owner != address(0), "Document not found");
        return d.rootHash;
    }

    function _isRevoked(bytes32 hash) internal view returns (bool) {
        if (!_exists(hash)) return false;
        Document storage d = documents[hash];
        return d.revoked || revokedRoots[d.rootHash];
    }

    function _isOwner(bytes32 hash, address user) internal view returns (bool) {
        return documents[hash].owner == user;
    }

    function _canView(bytes32 hash, address user) internal view returns (bool) {
        if (!_exists(hash)) return false;
        bytes32 root = documents[hash].rootHash;
        return _isOwner(hash, user) || documentViewers[hash][user] || rootViewers[root][user];
    }

    /**
     * @notice Registers a new document hash on the blockchain (no CID stored on-chain).
     */
    function registerDocument(bytes32 hash) external {
        require(documents[hash].owner == address(0), "Document already exists");

        documents[hash] = Document({
            owner: msg.sender,
            createdAt: block.timestamp,
            rootHash: hash,
            version: 1,
            revoked: false
        });

        documentsByOwner[msg.sender].push(hash);
        versionsByRoot[hash].push(hash);

        emit DocumentRegistered(hash, msg.sender);
    }

    /**
     * @notice Adds a new version under an existing document root.
     */
    function addDocumentVersion(bytes32 rootHash, bytes32 hash) external {
        require(_exists(rootHash), "Root not found");
        require(_isRoot(rootHash), "Not a root hash");
        require(!_isRevoked(rootHash), "Root revoked");
        require(_isOwner(rootHash, msg.sender), "Only root owner can add versions");
        require(documents[hash].owner == address(0), "Document already exists");

        uint256 nextVersion = versionsByRoot[rootHash].length + 1;
        documents[hash] = Document({
            owner: msg.sender,
            createdAt: block.timestamp,
            rootHash: rootHash,
            version: nextVersion,
            revoked: false
        });
        documentsByOwner[msg.sender].push(hash);
        versionsByRoot[rootHash].push(hash);

        emit DocumentVersionAdded(rootHash, hash, msg.sender, nextVersion);
    }

    function grantViewer(bytes32 hash, address viewer) external {
        require(_exists(hash), "Document not found");
        require(!_isRevoked(hash), "Document revoked");
        require(_isOwner(hash, msg.sender), "Only owner can grant access");
        require(viewer != address(0), "Invalid viewer");

        documentViewers[hash][viewer] = true;
        emit ViewerAccessGranted(hash, msg.sender, viewer);
    }

    function revokeViewer(bytes32 hash, address viewer) external {
        require(_exists(hash), "Document not found");
        require(_isOwner(hash, msg.sender), "Only owner can revoke access");
        require(viewer != address(0), "Invalid viewer");

        documentViewers[hash][viewer] = false;
        emit ViewerAccessRevoked(hash, msg.sender, viewer);
    }

    function canViewDocument(bytes32 hash, address user) external view returns (bool) {
        if (!_exists(hash)) return false;
        if (_isRevoked(hash)) return false;
        return _canView(hash, user);
    }

    function grantRootViewer(bytes32 rootHash, address viewer) external {
        require(_exists(rootHash), "Root not found");
        require(_isRoot(rootHash), "Not a root hash");
        require(!_isRevoked(rootHash), "Root revoked");
        require(_isOwner(rootHash, msg.sender), "Only root owner can grant access");
        require(viewer != address(0), "Invalid viewer");

        rootViewers[rootHash][viewer] = true;
        emit RootViewerAccessGranted(rootHash, msg.sender, viewer);
    }

    function revokeRootViewer(bytes32 rootHash, address viewer) external {
        require(_exists(rootHash), "Root not found");
        require(_isRoot(rootHash), "Not a root hash");
        require(_isOwner(rootHash, msg.sender), "Only root owner can revoke access");
        require(viewer != address(0), "Invalid viewer");

        rootViewers[rootHash][viewer] = false;
        emit RootViewerAccessRevoked(rootHash, msg.sender, viewer);
    }

    /// @notice Existence check (not revoked).
    function verifyDocument(bytes32 hash) external view returns (bool) {
        return _exists(hash) && !_isRevoked(hash);
    }

    /// @notice Ownership-bound check: only returns true if caller registered this hash.
    function verifyMyDocument(bytes32 hash) external view returns (bool) {
        return _isOwner(hash, msg.sender) && !_isRevoked(hash);
    }

    function revokeDocument(bytes32 hash) external {
        require(_exists(hash), "Document not found");
        require(_isOwner(hash, msg.sender), "Only owner can revoke");
        require(!documents[hash].revoked, "Already revoked");
        documents[hash].revoked = true;
        emit DocumentRevoked(hash, msg.sender);
    }

    function revokeDocumentRoot(bytes32 rootHash) external {
        require(_exists(rootHash), "Root not found");
        require(_isRoot(rootHash), "Not a root hash");
        require(_isOwner(rootHash, msg.sender), "Only root owner can revoke");
        require(!revokedRoots[rootHash], "Already revoked");
        revokedRoots[rootHash] = true;
        emit DocumentRootRevoked(rootHash, msg.sender);
    }

    function isDocumentRevoked(bytes32 hash) external view returns (bool) {
        return _isRevoked(hash);
    }

    function getDocumentVersion(bytes32 hash) external view returns (bytes32 rootHash, uint256 version) {
        require(_exists(hash), "Document not found");
        Document storage d = documents[hash];
        return (d.rootHash, d.version);
    }

    function getDocumentVersions(bytes32 rootHash) external view returns (bytes32[] memory) {
        require(_exists(rootHash), "Root not found");
        require(_isRoot(rootHash), "Not a root hash");
        return versionsByRoot[rootHash];
    }

    /// @notice Public metadata lookup (owner + timestamp). No CID on-chain.
    function getDocumentMeta(bytes32 hash) external view returns (address owner, uint256 createdAt) {
        Document storage d = documents[hash];
        require(d.owner != address(0), "Document not found");
        return (d.owner, d.createdAt);
    }

    function getMyDocuments() external view returns (bytes32[] memory) {
        return documentsByOwner[msg.sender];
    }
}

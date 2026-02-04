// SPDX-License-Identifier: MIT
// This specifies the software license (MIT is open-source)
pragma solidity ^0.8.20; // Specifies the Solidity compiler version to use

/**
 * @title DocumentRegistry
 * @notice This smart contract stores cryptographic hashes of documents on the Ethereum blockchain
 * @dev The contract prevents duplicate registrations and links documents to their uploaders' wallet addresses
 * 
 * KEY CONCEPTS :
 * 1. Immutability: Once data is written to the blockchain, it cannot be changed
 * 2. Hash-based verification: We store only the hash (fingerprint) of documents, not the actual content
 * 3. Ownership tracking: Each document hash is linked to the Ethereum address that registered it
 * 4. IPFS Integration: The actual document is stored on IPFS, we store the IPFS CID (Content Identifier)
 */
contract DocumentRegistry {
    
    // STRUCT: A custom data type that groups related data together
    // Think of it like a "record" or "object" in other programming languages
    struct Document {
        address owner;       // Ethereum wallet address of person who registered the document
        string cid;          // IPFS CID (Content Identifier) - link to the actual file stored on IPFS
        uint256 createdAt;   // Unix timestamp (seconds since Jan 1, 1970) when document was registered

        // Versioning
        bytes32 rootHash;    // Hash of the first version of this document
        uint256 version;     // 1-based version number

        // Revocation
        bool revoked;        // If true, this specific version is revoked (invalid)
    }

    // MAPPING 1: Links document hash to its full Document record
    // Think of this like a dictionary/hashmap: Key = document hash, Value = Document struct
    // "private" means only this contract can access it directly (but data is still visible on blockchain)
    mapping(bytes32 => Document) private documents;
    
    // MAPPING 2: Links wallet addresses to arrays of their document hashes
    // Allows us to quickly find all documents registered by a specific user
    // Key = wallet address, Value = array of document hashes
    mapping(address => bytes32[]) private documentsByOwner;

    // MAPPING 3: Per-document access control (viewer permission)
    // Key1 = document hash, Key2 = viewer address, Value = true if viewer can access document details
    mapping(bytes32 => mapping(address => bool)) private documentViewers;

    // MAPPING 4: Root-level access control (viewer permission applies to all versions under a root hash)
    mapping(bytes32 => mapping(address => bool)) private rootViewers;

    // MAPPING 5: Root hash -> list of version hashes (includes root itself as version 1)
    mapping(bytes32 => bytes32[]) private versionsByRoot;

    // MAPPING 6: Root hash revocation (revokes all versions under the root)
    mapping(bytes32 => bool) private revokedRoots;

    // EVENT: Blockchain events are logs that can be monitored by external applications
    // "indexed" keyword allows filtering events by that parameter
    // Events are cheaper than storing data and useful for tracking activity
    event DocumentRegistered(bytes32 indexed hash, address indexed owner, string cid);

    // Versioning + revocation events
    event DocumentVersionAdded(bytes32 indexed rootHash, bytes32 indexed hash, address indexed owner, uint256 version, string cid);
    event DocumentRevoked(bytes32 indexed hash, address indexed owner);
    event DocumentRootRevoked(bytes32 indexed rootHash, address indexed owner);

    // Access-control events
    event ViewerAccessGranted(bytes32 indexed hash, address indexed owner, address indexed viewer);
    event ViewerAccessRevoked(bytes32 indexed hash, address indexed owner, address indexed viewer);

    // Root-level access-control events
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
     * @notice Registers a new document hash on the blockchain
     * @param hash The keccak256 hash of the document (bytes32 = 32 bytes = 256 bits)
     * @param cid The IPFS Content Identifier where the actual file is stored
     * @dev "external" means this function can only be called from outside the contract (by users/other contracts)
     * @dev "msg.sender" is a global variable containing the address of whoever called this function
     * 
     * EXPLANATION FOR PROFESSOR:
     * - This function writes data to the blockchain (costs gas/transaction fee)
     * - It prevents the same hash from being registered twice (ensures uniqueness)
     * - It automatically records WHO registered it (msg.sender) and WHEN (block.timestamp)
     */
    function registerDocument(bytes32 hash, string calldata cid) external {
        // Check if this hash was already registered (if owner is zero address, it's new)
        // "require" will revert (undo) the transaction if the condition is false
        require(documents[hash].owner == address(0), "Document already exists");
        
        // Create and store the Document record
        // "block.timestamp" is the Unix timestamp of the current block being mined
        documents[hash] = Document({
            owner: msg.sender,           // Whoever called this function
            cid: cid,                    // IPFS identifier passed as parameter
            createdAt: block.timestamp,  // Current blockchain time
            rootHash: hash,              // First version => root is itself
            version: 1,
            revoked: false
        });
        
        // Add this hash to the user's list of documents
        documentsByOwner[msg.sender].push(hash);

        // Version list for this root
        versionsByRoot[hash].push(hash);
        
        // Emit an event to log this registration (useful for frontends to track activity)
        emit DocumentRegistered(hash, msg.sender, cid);
    }

    /**
     * @notice Adds a new version under an existing document root
     * @param rootHash The original (version 1) document hash
     * @param hash The new version's document hash
     * @param cid The IPFS CID for this new version
     * @dev Only the root owner can add versions. Root must not be revoked.
     */
    function addDocumentVersion(bytes32 rootHash, bytes32 hash, string calldata cid) external {
        require(_exists(rootHash), "Root not found");
        require(_isRoot(rootHash), "Not a root hash");
        require(!_isRevoked(rootHash), "Root revoked");
        require(_isOwner(rootHash, msg.sender), "Only root owner can add versions");
        require(documents[hash].owner == address(0), "Document already exists");

        uint256 nextVersion = versionsByRoot[rootHash].length + 1;
        documents[hash] = Document({
            owner: msg.sender,
            cid: cid,
            createdAt: block.timestamp,
            rootHash: rootHash,
            version: nextVersion,
            revoked: false
        });
        documentsByOwner[msg.sender].push(hash);
        versionsByRoot[rootHash].push(hash);

        emit DocumentVersionAdded(rootHash, hash, msg.sender, nextVersion, cid);
    }

    /**
     * @notice Grant a specific wallet address viewer access to a document you own
     * @param hash The document hash
     * @param viewer The address to grant access to
     * @dev Only the document owner can grant access
     */
    function grantViewer(bytes32 hash, address viewer) external {
        require(_exists(hash), "Document not found");
        require(!_isRevoked(hash), "Document revoked");
        require(_isOwner(hash, msg.sender), "Only owner can grant access");
        require(viewer != address(0), "Invalid viewer");

        documentViewers[hash][viewer] = true;
        emit ViewerAccessGranted(hash, msg.sender, viewer);
    }

    /**
     * @notice Revoke viewer access from a wallet address
     * @param hash The document hash
     * @param viewer The address to revoke access from
     * @dev Only the document owner can revoke access
     */
    function revokeViewer(bytes32 hash, address viewer) external {
        require(_exists(hash), "Document not found");
        require(_isOwner(hash, msg.sender), "Only owner can revoke access");
        require(viewer != address(0), "Invalid viewer");

        documentViewers[hash][viewer] = false;
        emit ViewerAccessRevoked(hash, msg.sender, viewer);
    }

    /**
     * @notice Checks whether a given address has viewer access to a document (owner counts as viewer)
     * @param hash The document hash
     * @param user The address to check
     */
    function canViewDocument(bytes32 hash, address user) external view returns (bool) {
        if (!_exists(hash)) return false;
        if (_isRevoked(hash)) return false;
        return _canView(hash, user);
    }

    /**
     * @notice Grant viewer access at the root level (applies to all versions under the root)
     * @param rootHash Root hash (version 1)
     * @param viewer Viewer wallet address
     */
    function grantRootViewer(bytes32 rootHash, address viewer) external {
        require(_exists(rootHash), "Root not found");
        require(_isRoot(rootHash), "Not a root hash");
        require(!_isRevoked(rootHash), "Root revoked");
        require(_isOwner(rootHash, msg.sender), "Only root owner can grant access");
        require(viewer != address(0), "Invalid viewer");

        rootViewers[rootHash][viewer] = true;
        emit RootViewerAccessGranted(rootHash, msg.sender, viewer);
    }

    /**
     * @notice Revoke root-level viewer access
     * @param rootHash Root hash (version 1)
     * @param viewer Viewer wallet address
     */
    function revokeRootViewer(bytes32 rootHash, address viewer) external {
        require(_exists(rootHash), "Root not found");
        require(_isRoot(rootHash), "Not a root hash");
        require(_isOwner(rootHash, msg.sender), "Only root owner can revoke access");
        require(viewer != address(0), "Invalid viewer");

        rootViewers[rootHash][viewer] = false;
        emit RootViewerAccessRevoked(rootHash, msg.sender, viewer);
    }

    /**
     * @notice Checks if a document hash exists in the registry (backwards-compatible version)
     * @param hash The document hash to check
     * @return bool True if the document exists, false otherwise
     * @dev "view" means this function only READS data, doesn't modify anything (no gas cost when called externally)
     * 
     * EXPLANATION FOR PROFESSOR:
     * - This is a read-only function (view) so it's FREE to call
     * - Returns true if ANY wallet has registered this hash
     * - Doesn't check ownership, just existence
     */
    function verifyDocument(bytes32 hash) external view returns (bool) {
        // If a document has been registered, its owner field won't be the zero address
        return _exists(hash) && !_isRevoked(hash);
    }

    /**
     * @notice Verifies if the caller's wallet registered this specific document
     * @param hash The document hash to check
     * @return bool True if the caller registered this document, false otherwise
     * @dev This prevents "replay attacks" - someone else can't claim your document as theirs
     * 
     * EXPLANATION FOR PROFESSOR:
     * - More secure than verifyDocument() because it checks OWNERSHIP
     * - Only returns true if msg.sender (caller) is the one who registered it
     * - Prevents malicious users from claiming they uploaded someone else's document
     */
    function verifyMyDocument(bytes32 hash) external view returns (bool) {
        // Check if the stored owner matches the person calling this function
        return _isOwner(hash, msg.sender) && !_isRevoked(hash);
    }

    /**
     * @notice Revoke a specific document hash (marks it invalid)
     * @dev Only the document owner can revoke. Revoked documents cannot be viewed via getDocument.
     */
    function revokeDocument(bytes32 hash) external {
        require(_exists(hash), "Document not found");
        require(_isOwner(hash, msg.sender), "Only owner can revoke");
        require(!documents[hash].revoked, "Already revoked");
        documents[hash].revoked = true;
        emit DocumentRevoked(hash, msg.sender);
    }

    /**
     * @notice Revoke an entire document root (revokes all versions under the root)
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

    /**
     * @notice Returns whether a given hash is revoked (either itself or its root)
     */
    function isDocumentRevoked(bytes32 hash) external view returns (bool) {
        return _isRevoked(hash);
    }

    /**
     * @notice Returns root hash + version for a given document hash
     */
    function getDocumentVersion(bytes32 hash) external view returns (bytes32 rootHash, uint256 version) {
        require(_exists(hash), "Document not found");
        Document storage d = documents[hash];
        return (d.rootHash, d.version);
    }

    /**
     * @notice Returns all version hashes under a root hash (includes the root itself)
     */
    function getDocumentVersions(bytes32 rootHash) external view returns (bytes32[] memory) {
        require(_exists(rootHash), "Root not found");
        require(_isRoot(rootHash), "Not a root hash");
        return versionsByRoot[rootHash];
    }

    /**
     * @notice Public, non-sensitive metadata lookup
     * @dev This does NOT return CID. Useful for backends/UI to show owner without requiring access.
     */
    function getDocumentMeta(bytes32 hash) external view returns (address owner, uint256 createdAt) {
        Document storage d = documents[hash];
        require(d.owner != address(0), "Document not found");
        return (d.owner, d.createdAt);
    }

    /**
     * @notice Retrieves full details of a registered document
     * @param hash The document hash to look up
     * @return owner The wallet address that registered this document
     * @return cid The IPFS Content Identifier for the file
     * @return createdAt The timestamp when it was registered
     * @dev "memory" keyword means the returned string is temporary (not stored permanently)
     * @dev "storage" keyword means we're reading from blockchain storage
     * 
     * EXPLANATION FOR PROFESSOR:
     * - Returns all metadata about a document
     * - Useful for displaying document history and retrieving IPFS links
     * - Reverts if document doesn't exist (require check)
     */
    function getDocument(bytes32 hash) external view returns (address owner, string memory cid, uint256 createdAt) {
        // "storage" means we're referencing the actual stored data (not making a copy)
        Document storage d = documents[hash];
        
        // Ensure the document exists before returning data
        require(d.owner != address(0), "Document not found");

        // Revocation: revoked documents cannot be viewed (CID should not be accessible)
        require(!_isRevoked(hash), "Document revoked");

        // Access control: only owner or approved viewer can read CID
        require(_canView(hash, msg.sender), "Access denied");
        
        // Return all three fields
        return (d.owner, d.cid, d.createdAt);
    }

    /**
     * @notice Gets all document hashes registered by the caller's wallet
     * @return bytes32[] Array of document hashes owned by the caller
     * @dev "memory" means the array is created temporarily and returned
     * 
     * EXPLANATION FOR PROFESSOR:
     * - Allows users to see their complete document history
     * - Returns only the hashes; frontend can call getDocument() for each to get full details
     * - Useful for building a "My Documents" dashboard
     */
    function getMyDocuments() external view returns (bytes32[] memory) {
        // Return the array of hashes for the calling wallet
        return documentsByOwner[msg.sender];
    }
}

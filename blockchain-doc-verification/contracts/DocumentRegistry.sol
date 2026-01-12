// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DocumentRegistry {
    struct Document {
        address owner;
        string cid; // IPFS CID (content identifier)
        uint256 createdAt;
    }

    mapping(bytes32 => Document) private documents;
    mapping(address => bytes32[]) private documentsByOwner;

    event DocumentRegistered(bytes32 hash, address indexed owner, string cid);

    function registerDocument(bytes32 hash, string calldata cid) external {
        require(documents[hash].owner == address(0), "Document already exists");
        documents[hash] = Document({ owner: msg.sender, cid: cid, createdAt: block.timestamp });
        documentsByOwner[msg.sender].push(hash);
        emit DocumentRegistered(hash, msg.sender, cid);
    }

    /// Backwards-compatible: existence check only.
    function verifyDocument(bytes32 hash) external view returns (bool) {
        return documents[hash].owner != address(0);
    }

    /// Prevents "relay/replay" in-app: only the registering wallet verifies true.
    function verifyMyDocument(bytes32 hash) external view returns (bool) {
        return documents[hash].owner == msg.sender;
    }

    function getDocument(bytes32 hash) external view returns (address owner, string memory cid, uint256 createdAt) {
        Document storage d = documents[hash];
        require(d.owner != address(0), "Document not found");
        return (d.owner, d.cid, d.createdAt);
    }

    function getMyDocuments() external view returns (bytes32[] memory) {
        return documentsByOwner[msg.sender];
    }
}

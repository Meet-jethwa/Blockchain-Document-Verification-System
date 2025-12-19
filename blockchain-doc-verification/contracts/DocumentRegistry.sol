// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DocumentRegistry {
    mapping(bytes32 => bool) private documents;
    event DocumentRegistered(bytes32 hash, address indexed sender);

    function registerDocument(bytes32 hash) external {
        require(!documents[hash], "Document already exists");
        documents[hash] = true;
        emit DocumentRegistered(hash, msg.sender);
    }

    function verifyDocument(bytes32 hash) external view returns (bool) {
        return documents[hash];
    }
}

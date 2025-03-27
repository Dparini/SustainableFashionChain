// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract SustainableFashion {
    string public name = "SustainableFashion";
    
    event ProductRegistered(uint256 id, string metadata);
    
    function registerProduct(uint256 id, string memory metadata) public {
        emit ProductRegistered(id, metadata);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Context.sol";

/**
 * @title CotToken
 * @dev ERC20 token representing 1kg of ethically sourced cotton
 */
contract CotToken is Context, ERC20, ERC20Burnable, AccessControl, Ownable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    // Batch data for each token mint
    struct BatchData {
        // string fabricBatchId; (removed duplicate)
        string warehouseId;      // ID of the warehouse where cotton is stored
        uint256 amount;          // Amount of tokens (1 token = 1kg)
        uint256 timestamp;       // When the tokens were minted
        address minter;          // Who minted the tokens
        uint256 certifiedAmount;
        address certifiedBy;
    }

    // Mapping from mint ID to batch data
    mapping(string => BatchData) public batchData;
    mapping(string => string) public fabricIdToBatchId;

    // Array to store all batch IDs
    string[] public allBatchIds;

    // Events
    event BatchTokensMinted(string indexed batchId, uint256 amount, string warehouseId);
    event BatchTokensBurned(string indexed batchId, uint256 amount);

    /**
     * @dev Constructor
     * @param admin Address to be granted admin role
     */
    constructor(address admin) ERC20("Certified Cotton Token", "COT") {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(MINTER_ROLE, admin);
    }

    /**
     * @dev Mint tokens to a specific address
     * @param to Address to receive the tokens
     * @param amount Amount of tokens to mint
     */
    function mintTo(address to, uint256 amount) public {
        require(hasRole(MINTER_ROLE, _msgSender()), "CotToken: must have minter role to mint");
        _mint(to, amount);
    }

    /**
     * @dev Mint new tokens for a cotton batch
     * @param batchId ID of the batch in Hyperledger Fabric
     * @param amount Amount of tokens to mint (1 token = 1kg of cotton)
     * @param warehouseId ID of the warehouse where cotton is stored
     * @param recipient Address that will receive the tokens
     */
    function mintBatch(
        string memory batchId,
        uint256 amount,
        string memory warehouseId,
        address recipient
    ) public {
        // Check that the caller has minter role
        require(hasRole(MINTER_ROLE, _msgSender()), "CotToken: must have minter role to mint");

        // Check that batch ID has not been used before
        require(bytes(batchData[batchId].warehouseId).length == 0, "CotToken: batch ID already used");

        // Store batch data
        batchData[batchId] = BatchData({
            certifiedAmount: amount,
            certifiedBy: msg.sender,
            warehouseId: warehouseId,
            amount: amount,
            timestamp: block.timestamp,
            minter: _msgSender()
        });

        // Add to list of all batch IDs
        allBatchIds.push(batchId);
        fabricIdToBatchId[batchId] = batchId;

        // Mint tokens
        _mint(recipient, amount);

        // Emit event
        emit BatchTokensMinted(batchId, amount, warehouseId);
    }

    // ... (rest of the previous contract remains the same)
}
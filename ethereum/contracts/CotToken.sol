// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Context.sol";

/**
 * @title CotToken
 * @dev ERC20 token representing 1kg of ethically sourced cotton
 */
contract CotToken is Context, ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    // Batch data for each token mint
    struct BatchData {
        string fabricBatchId;    // ID of the batch in Hyperledger Fabric
        string warehouseId;      // ID of the warehouse where cotton is stored
        uint256 amount;          // Amount of tokens (1 token = 1kg)
        uint256 timestamp;       // When the tokens were minted
        address minter;          // Who minted the tokens
    }

    // Mapping from mint ID to batch data
    mapping(string => BatchData) public batchData;

    // Array to store all batch IDs
    string[] public allBatchIds;

    // Events
    event BatchTokensMinted(string indexed batchId, uint256 amount, string warehouseId);
    event BatchTokensBurned(string indexed batchId, uint256 amount);

    /**
     * @dev Constructor
     * @param admin Address to be granted admin role
     */
    constructor(address admin) ERC20("Cotton Token", "COT") {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(MINTER_ROLE, admin);
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
        require(bytes(batchData[batchId].fabricBatchId).length == 0, "CotToken: batch ID already used");

        // Store batch data
        batchData[batchId] = BatchData({
            fabricBatchId: batchId,
            warehouseId: warehouseId,
            amount: amount,
            timestamp: block.timestamp,
            minter: _msgSender()
        });

        // Add to list of all batch IDs
        allBatchIds.push(batchId);

        // Mint tokens
        _mint(recipient, amount);

        // Emit event
        emit BatchTokensMinted(batchId, amount, warehouseId);
    }

    /**
     * @dev Burn tokens from a specific batch
     * @param batchId ID of the batch to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burnBatch(string memory batchId, uint256 amount) public {
        // Check that the batch exists
        require(bytes(batchData[batchId].fabricBatchId).length > 0, "CotToken: batch ID does not exist");

        // Check that the amount is valid
        require(amount <= batchData[batchId].amount, "CotToken: burn amount exceeds batch balance");

        // Update batch data
        batchData[batchId].amount -= amount;

        // Burn tokens
        _burn(_msgSender(), amount);

        // Emit event
        emit BatchTokensBurned(batchId, amount);
    }

    /**
     * @dev Get total number of batches
     * @return Number of batches
     */
    function getBatchCount() public view returns (uint256) {
        return allBatchIds.length;
    }

    /**
     * @dev Get batch ID by index
     * @param index Index of the batch
     * @return Batch ID
     */
    function getBatchId(uint256 index) public view returns (string memory) {
        require(index < allBatchIds.length, "CotToken: index out of bounds");
        return allBatchIds[index];
    }

    /**
     * @dev Grant minter role to an address
     * @param minter Address to be granted minter role
     */
    function addMinter(address minter) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "CotToken: must have admin role to add minter");
        grantRole(MINTER_ROLE, minter);
    }

    /**
     * @dev Grant bridge role to an address
     * @param bridge Address to be granted bridge role
     */
    function addBridge(address bridge) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "CotToken: must have admin role to add bridge");
        grantRole(BRIDGE_ROLE, bridge);
    }
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "./CottonReserveRegistry.sol";

/**
 * @title CotToken
 * @dev ERC20 token representing 1kg of ethically sourced cotton
 */
contract CotToken is Context, ERC20, ERC20Burnable, AccessControl, Ownable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");
    CottonReserveRegistry public immutable reserveRegistry;
    mapping(bytes32 => bool) public processedEvents;
    mapping(bytes32 => bytes32) public processedFabricTransactions;
    event VerifiedEventMinted(bytes32 indexed eventId, bytes32 indexed fabricTxId,
        string batchId, uint256 amount, address recipient);

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
    mapping(address => bool) public bridges;

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
        require(admin != address(0), "ZERO_ADDRESS");
        _transferOwnership(admin);
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(MINTER_ROLE, admin);
        reserveRegistry = new CottonReserveRegistry(admin, address(this));
    }

    // Deprecated unbacked issuance route: retained only to reject legacy callers.
    function mintTo(address, uint256) public view {
        require(hasRole(MINTER_ROLE, _msgSender()), "CotToken: must have minter role to mint");
        revert("BATCH_BACKING_REQUIRED");
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
        require(bytes(batchId).length > 0 && bytes(warehouseId).length > 0, "INVALID_BATCH");
        reserveRegistry.consume(keccak256(bytes(batchId)), amount);

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

    function eventIdFor(bytes32 fabricTxId, string memory batchId, uint256 amount)
        public pure returns (bytes32)
    {
        return keccak256(abi.encode(fabricTxId, keccak256(bytes(batchId)), amount, "MINT_COT"));
    }

    function mintVerifiedBatch(bytes32 fabricTxId, string calldata batchId,
        uint256 amount, string calldata warehouseId, address recipient)
        external onlyRole(BRIDGE_ROLE)
    {
        require(fabricTxId != bytes32(0), "MISSING_FABRIC_TX");
        bytes32 eventId = eventIdFor(fabricTxId, batchId, amount);
        require(!processedEvents[eventId], "EVENT_ALREADY_PROCESSED");
        // Even changing quantity/batch on a replay cannot reuse a Fabric transaction.
        require(processedFabricTransactions[fabricTxId] == bytes32(0), "FABRIC_TX_ALREADY_PROCESSED");
        require(bytes(batchId).length > 0 && bytes(warehouseId).length > 0, "INVALID_BATCH");
        processedEvents[eventId] = true;
        processedFabricTransactions[fabricTxId] = eventId;
        reserveRegistry.consume(keccak256(bytes(batchId)), amount);
        _mint(recipient, amount);
        if (bytes(batchData[batchId].warehouseId).length == 0) allBatchIds.push(batchId);
        batchData[batchId].amount += amount;
        batchData[batchId].certifiedAmount += amount;
        batchData[batchId].warehouseId = warehouseId;
        batchData[batchId].timestamp = block.timestamp;
        batchData[batchId].minter = msg.sender;
        fabricIdToBatchId[batchId] = batchId;
        require(totalSupply() <= reserveRegistry.totalVerifiedKg(), "GLOBAL_BACKING_INVARIANT");
        emit VerifiedEventMinted(eventId, fabricTxId, batchId, amount, recipient);
        emit BatchTokensMinted(batchId, amount, warehouseId);
    }

    function addBridge(address bridge) external onlyOwner {
        bridges[bridge] = true;
    }

    modifier onlyBridge() {
        require(bridges[msg.sender], "CotToken: caller is not an authorized bridge");
        _;
    }

 }

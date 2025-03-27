// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./CotToken.sol";
import "./ProductNFT.sol";

/**
 * @title SidechainBridge
 * @dev Bridge between Ethereum mainnet and a dedicated sidechain for SustainableFashion
 * This contract optimizes gas usage and improves scalability by batching transactions
 * and using a state channel mechanism for high-frequency updates
 */
contract SidechainBridge is AccessControlEnumerable, Pausable {
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // Root chain token contracts
    CotToken public cotToken;
    ProductNFT public productNFT;

    // Sidechain identifier
    uint256 public sidechainId;

    // Batch processing
    uint256 public batchNonce;
    uint256 public lastProcessedBatch;
    uint256 public batchSize;
    uint256 public batchTimeout;

    // Mapping from batch ID to whether it was processed
    mapping(uint256 => bool) public processedBatches;

    // Mapping from transaction hash to whether it was executed
    mapping(bytes32 => bool) public executedTransactions;

    // State channel infrastructure
    mapping(address => uint256) public userNonces;
    mapping(address => uint256) public deposits;

    // Events
    event BatchSubmitted(uint256 indexed batchId, bytes32 merkleRoot, uint256 timestamp);
    event BatchProcessed(uint256 indexed batchId, uint256 transactionCount);
    event TokensLockedForSidechain(address indexed user, uint256 amount, bytes32 txHash);
    event TokensReleasedFromSidechain(address indexed user, uint256 amount, bytes32 txHash);
    event NFTLockedForSidechain(address indexed user, uint256 tokenId, bytes32 txHash);
    event NFTReleasedFromSidechain(address indexed user, uint256 tokenId, bytes32 txHash);
    event StateChannelOpened(address indexed user, uint256 deposit, uint256 timestamp);
    event StateChannelClosed(address indexed user, uint256 finalAmount, uint256 timestamp);

    struct BatchData {
        string fabricBatchId;
        string fabricId;
        uint256 amountCertified;
        address certifier;
    }

    mapping(string => BatchData) public batchData;
    mapping(string => string) public fabricIdToBatchId;

    function getBatchData(string memory batchId) external view returns (BatchData memory) {
        return batchData[batchId];
    }

    function getBatchIdFromFabricId(string memory fabricId) public view returns (string memory) {
        return fabricIdToBatchId[fabricId];
    }

    /**
     * @dev Constructor
     * @param _cotToken Address of the CotToken contract
     * @param _productNFT Address of the ProductNFT contract
     * @param _sidechainId Identifier for the sidechain
     */
    constructor(address _cotToken, address _productNFT, uint256 _sidechainId) {
        cotToken = CotToken(_cotToken);
        productNFT = ProductNFT(_productNFT);
        sidechainId = _sidechainId;
        batchSize = 100; // Default batch size
        batchTimeout = 3600; // Default timeout (1 hour)

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(BRIDGE_ROLE, msg.sender);
        _setupRole(VALIDATOR_ROLE, msg.sender);
        _setupRole(OPERATOR_ROLE, msg.sender);
    }

    /**
     * @dev Pause the bridge operations
     * Only callable by admin
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause the bridge operations
     * Only callable by admin
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Configure batch parameters
     * @param _batchSize New batch size
     * @param _batchTimeout New batch timeout in seconds
     */
    function configureBatch(uint256 _batchSize, uint256 _batchTimeout)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        batchSize = _batchSize;
        batchTimeout = _batchTimeout;
    }

    /**
     * @dev Lock tokens to transfer to sidechain
     * @param amount Amount of tokens to lock
     * @return txHash Transaction hash for reference
     */
    function lockTokensForSidechain(uint256 amount)
        external
        whenNotPaused
        returns (bytes32 txHash)
    {
        require(amount > 0, "Amount must be greater than 0");

        // Generate unique transaction hash
        txHash = keccak256(abi.encodePacked(
            msg.sender, amount, block.timestamp, "LOCK_TOKENS", userNonces[msg.sender]++
        ));

        // Ensure transaction hasn't been executed
        require(!executedTransactions[txHash], "Transaction already executed");

        // Mark transaction as executed
        executedTransactions[txHash] = true;

        // Transfer tokens from user to bridge
        require(cotToken.transferFrom(msg.sender, address(this), amount), "Token transfer failed");

        emit TokensLockedForSidechain(msg.sender, amount, txHash);
        return txHash;
    }

    /**
     * @dev Lock NFT to transfer to sidechain
     * @param tokenId ID of the NFT to lock
     * @return txHash Transaction hash for reference
     */
    function lockNFTForSidechain(uint256 tokenId)
        external
        whenNotPaused
        returns (bytes32 txHash)
    {
        // Generate unique transaction hash
        txHash = keccak256(abi.encodePacked(
            msg.sender, tokenId, block.timestamp, "LOCK_NFT", userNonces[msg.sender]++
        ));

        // Ensure transaction hasn't been executed
        require(!executedTransactions[txHash], "Transaction already executed");

        // Mark transaction as executed
        executedTransactions[txHash] = true;

        // Transfer NFT from user to bridge
        productNFT.transferFrom(msg.sender, address(this), tokenId);

        emit NFTLockedForSidechain(msg.sender, tokenId, txHash);
        return txHash;
    }

    /**
     * @dev Release tokens from sidechain to mainnet
     * @param user Recipient address
     * @param amount Amount of tokens to release
     * @param signatures Array of validator signatures
     * @return txHash Transaction hash for reference
     */
    function releaseTokensFromSidechain(
        address user,
        uint256 amount,
        bytes[] calldata signatures
    )
        external
        whenNotPaused
        onlyRole(BRIDGE_ROLE)
        returns (bytes32 txHash)
    {
        require(amount > 0, "Amount must be greater than 0");

        // Generate unique transaction hash
        txHash = keccak256(abi.encodePacked(
            user, amount, block.timestamp, "RELEASE_TOKENS", userNonces[user]++
        ));

        // Ensure transaction hasn't been executed
        require(!executedTransactions[txHash], "Transaction already executed");

        // Verify validator signatures
        verifyValidatorSignatures(txHash, signatures);

        // Mark transaction as executed
        executedTransactions[txHash] = true;

        // Transfer tokens to user
        require(cotToken.transfer(user, amount), "Token transfer failed");

        emit TokensReleasedFromSidechain(user, amount, txHash);
        return txHash;
    }

    /**
     * @dev Release NFT from sidechain to mainnet
     * @param user Recipient address
     * @param tokenId ID of the NFT to release
     * @param signatures Array of validator signatures
     * @return txHash Transaction hash for reference
     */
    function releaseNFTFromSidechain(
        address user,
        uint256 tokenId,
        bytes[] calldata signatures
    )
        external
        whenNotPaused
        onlyRole(BRIDGE_ROLE)
        returns (bytes32 txHash)
    {
        // Generate unique transaction hash
        txHash = keccak256(abi.encodePacked(
            user, tokenId, block.timestamp, "RELEASE_NFT", userNonces[user]++
        ));

        // Ensure transaction hasn't been executed
        require(!executedTransactions[txHash], "Transaction already executed");

        // Verify validator signatures
        verifyValidatorSignatures(txHash, signatures);

        // Mark transaction as executed
        executedTransactions[txHash] = true;

        // Transfer NFT to user
        productNFT.transferFrom(address(this), user, tokenId);

        emit NFTReleasedFromSidechain(user, tokenId, txHash);
        return txHash;
    }

    /**
     * @dev Submit batch from sidechain
     * @param merkleRoot Merkle root of the transactions in batch
     * @param signatures Array of validator signatures
     * @return batchId Batch ID
     */
    function submitBatch(bytes32 merkleRoot, bytes[] calldata signatures)
        external
        whenNotPaused
        onlyRole(BRIDGE_ROLE)
        returns (uint256)
    {
        // Increment batch nonce
        batchNonce++;

        // Generate batch ID
        uint256 batchId = batchNonce;

        // Verify validator signatures
        verifyValidatorSignatures(merkleRoot, signatures);

        // Emit batch submitted event
        emit BatchSubmitted(batchId, merkleRoot, block.timestamp);

        return batchId;
    }

    /**
     * @dev Process batch from sidechain
     * @param batchId Batch ID to process
     * @param transactions Encoded transactions data
     * @param merkleProofs Merkle proofs for the transactions
     * @return success Whether the batch was successfully processed
     */
    function processBatch(
        uint256 batchId,
        bytes[] calldata transactions,
        bytes32[][] calldata merkleProofs
    )
        external
        whenNotPaused
        onlyRole(OPERATOR_ROLE)
        returns (bool success)
    {
        // Ensure batch hasn't been processed
        require(!processedBatches[batchId], "Batch already processed");

        // Ensure batches are processed in order
        require(batchId == lastProcessedBatch + 1, "Batches must be processed in order");

        // Mark batch as processed
        processedBatches[batchId] = true;
        lastProcessedBatch = batchId;

        // Process transactions
        // Note: In a real implementation, would verify merkle proofs and execute transactions

        emit BatchProcessed(batchId, transactions.length);
        return true;
    }

    /**
     * @dev Open a state channel for faster transactions
     * @param initialDeposit Initial deposit to fund the channel
     * @return channelId Unique identifier for the channel
     */
    function openStateChannel(uint256 initialDeposit)
        external
        whenNotPaused
        returns (bytes32 channelId)
    {
        require(initialDeposit > 0, "Initial deposit must be greater than 0");

        // Generate channel ID
        channelId = keccak256(abi.encodePacked(
            msg.sender, block.timestamp, "CHANNEL", userNonces[msg.sender]++
        ));

        // Transfer tokens from user to bridge
        require(cotToken.transferFrom(msg.sender, address(this), initialDeposit), "Token transfer failed");

        // Record deposit
        deposits[msg.sender] += initialDeposit;

        emit StateChannelOpened(msg.sender, initialDeposit, block.timestamp);
        return channelId;
    }

    /**
     * @dev Close a state channel
     * @param finalAmount Final amount to settle
     * @param signature Signature of the state
     * @return success Whether the channel was successfully closed
     */
    function closeStateChannel(
        uint256 finalAmount,
        bytes calldata signature
    )
        external
        whenNotPaused
        returns (bool success)
    {
        // Verify signature from authorized validator
        // Note: In a real implementation, would verify the signature here

        // Ensure enough balance in deposit
        require(deposits[msg.sender] >= finalAmount, "Insufficient deposit");

        // Transfer final amount to user
        uint256 refundAmount = deposits[msg.sender] - finalAmount;
        if (refundAmount > 0) {
            require(cotToken.transfer(msg.sender, refundAmount), "Token transfer failed");
        }

        // Reset deposit
        deposits[msg.sender] = 0;

        emit StateChannelClosed(msg.sender, finalAmount, block.timestamp);
        return true;
    }

    /**
     * @dev Add a validator
     * @param validator Address of the validator to add
     */
    function addValidator(address validator)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        grantRole(VALIDATOR_ROLE, validator);
    }

    /**
     * @dev Remove a validator
     * @param validator Address of the validator to remove
     */
    function removeValidator(address validator)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        revokeRole(VALIDATOR_ROLE, validator);
    }

    /**
     * @dev Add an operator
     * @param operator Address of the operator to add
     */
    function addOperator(address operator)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        grantRole(OPERATOR_ROLE, operator);
    }

    /**
     * @dev Verify validator signatures
     * @param messageHash Hash of the message that was signed
     * @param signatures Array of validator signatures
     * @return valid Whether the signatures are valid
     */
    function verifyValidatorSignatures(
        bytes32 messageHash,
        bytes[] memory signatures
    )
        internal
        view
        returns (bool valid)
    {
        // Require a minimum number of signatures (2/3 of validators)
        uint256 validSignatureCount = 0;
        uint256 validatorCount = getRoleMemberCount(VALIDATOR_ROLE);
        uint256 requiredSignatures = (validatorCount * 2) / 3 + 1; // 2/3 majority

        require(signatures.length >= requiredSignatures, "Not enough signatures");

        // Verify each signature
        address[] memory signers = new address[](signatures.length);

        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = recoverSigner(messageHash, signatures[i]);

            // Ensure signer is a validator
            require(hasRole(VALIDATOR_ROLE, signer), "Invalid validator signature");

            // Ensure no duplicate signers
            for (uint256 j = 0; j < i; j++) {
                require(signer != signers[j], "Duplicate signature");
            }

            signers[i] = signer;
            validSignatureCount++;
        }

        return validSignatureCount >= requiredSignatures;
    }

    /**
     * @dev Recover signer from signature
     * @param messageHash Hash of the message that was signed
     * @param signature Signature
     * @return signer Address of the signer
     */
    function recoverSigner(bytes32 messageHash, bytes memory signature)
        internal
        pure
        returns (address signer)
    {
        // Check the signature length
        require(signature.length == 65, "Invalid signature length");

        // Divide the signature into r, s and v variables
        bytes32 r;
        bytes32 s;
        uint8 v;

        // ecrecover takes the signature parameters, and the only way to get them
        // currently is to use assembly
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        // Version of signature should be 27 or 28, but some software generates 0 or 1 instead
        if (v < 27) {
            v += 27;
        }

        // If the version is correct, return the signer address
        require(v == 27 || v == 28, "Invalid signature version");

        // Recover signer using ecrecover
        return ecrecover(
            keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)),
            v,
            r,
            s
        );
    }
}
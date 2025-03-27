// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "./ProductNFT.sol";
import "./CotToken.sol";

/**
 * @title CircularRewards
 * @dev Rewards users for circular economy actions with tokens
 */
contract CircularRewards is Context, AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    // Token contract references
    ProductNFT public productNFT;
    CotToken public cotToken;

    // Reward configuration
    struct RewardConfig {
        string actionType;       // Type of circular action
        uint256 baseReward;      // Base reward amount in tokens
        bool active;             // Whether this reward is active
    }

    // Reward history
    struct RewardEvent {
        address user;            // User who received the reward
        uint256 tokenId;         // NFT token ID
        string actionType;       // Type of action
        uint256 rewardAmount;    // Amount of reward tokens
        uint256 timestamp;       // When the reward was issued
    }

    // Mapping from action type to reward configuration
    mapping(string => RewardConfig) public rewardConfigs;

    // All supported action types
    string[] public actionTypes;

    // All reward events
    RewardEvent[] public rewardHistory;

    // Events
    event RewardConfigAdded(string actionType, uint256 baseReward);
    event RewardConfigUpdated(string actionType, uint256 baseReward, bool active);
    event RewardIssued(address indexed user, uint256 indexed tokenId, string actionType, uint256 rewardAmount);

    /**
     * @dev Constructor
     * @param admin Address to be granted admin role
     * @param _productNFT Address of the ProductNFT contract
     * @param _cotToken Address of the CotToken contract
     */
    constructor(
        address admin,
        address _productNFT,
        address _cotToken
    ) {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(VERIFIER_ROLE, admin);

        productNFT = ProductNFT(_productNFT);
        cotToken = CotToken(_cotToken);

        // Set up default reward configs
        _addRewardConfig("Recycle", 50 ether); // 50 tokens
        _addRewardConfig("Repair", 20 ether);  // 20 tokens
        _addRewardConfig("Resell", 15 ether);  // 15 tokens
        _addRewardConfig("Upcycle", 30 ether); // 30 tokens
    }

    /**
     * @dev Add a new reward configuration
     * @param actionType Type of circular action
     * @param baseReward Base reward amount in tokens
     */
    function addRewardConfig(string memory actionType, uint256 baseReward) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "CircularRewards: must have admin role");
        _addRewardConfig(actionType, baseReward);
    }

    /**
     * @dev Internal function to add a reward configuration
     */
    function _addRewardConfig(string memory actionType, uint256 baseReward) internal {
        require(rewardConfigs[actionType].baseReward == 0, "CircularRewards: action type already exists");

        rewardConfigs[actionType] = RewardConfig({
            actionType: actionType,
            baseReward: baseReward,
            active: true
        });

        actionTypes.push(actionType);

        emit RewardConfigAdded(actionType, baseReward);
    }

    /**
     * @dev Update an existing reward configuration
     * @param actionType Type of circular action
     * @param baseReward Base reward amount in tokens
     * @param active Whether this reward is active
     */
    function updateRewardConfig(string memory actionType, uint256 baseReward, bool active) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "CircularRewards: must have admin role");
        require(rewardConfigs[actionType].baseReward > 0, "CircularRewards: action type does not exist");

        rewardConfigs[actionType].baseReward = baseReward;
        rewardConfigs[actionType].active = active;

        emit RewardConfigUpdated(actionType, baseReward, active);
    }

    /**
     * @dev Issue a reward for a circular economy action
     * @param user User who performed the action
     * @param tokenId NFT token ID
     * @param actionType Type of action
     * @param details Additional details about the action
     */
    function issueReward(
        address user,
        uint256 tokenId,
        string memory actionType,
        string memory details
    ) public {
        // Check that the caller has verifier role
        require(hasRole(VERIFIER_ROLE, _msgSender()), "CircularRewards: must have verifier role");

        // Check that the action type is valid and active
        require(rewardConfigs[actionType].baseReward > 0, "CircularRewards: invalid action type");
        require(rewardConfigs[actionType].active, "CircularRewards: action type is not active");

        // Check that the token exists and user owns it
        require(productNFT.ownerOf(tokenId) == user, "CircularRewards: user must own the token");

        // Calculate reward amount (default to base reward for now)
        uint256 rewardAmount = rewardConfigs[actionType].baseReward;

        // Record the action in the NFT
        productNFT.recordCircularAction(tokenId, actionType, details);

        // If the action is recycling, mark the product as recycled
        if (keccak256(abi.encodePacked(actionType)) == keccak256(abi.encodePacked("Recycle"))) {
            productNFT.recycleProduct(tokenId);
        }

        // Store reward event
        rewardHistory.push(RewardEvent({
            user: user,
            tokenId: tokenId,
            actionType: actionType,
            rewardAmount: rewardAmount,
            timestamp: block.timestamp
        }));

        // Issue tokens to the user (requires the contract to have minter role)
        cotToken.mint(user, rewardAmount);

        // Emit event
        emit RewardIssued(user, tokenId, actionType, rewardAmount);
    }

    /**
     * @dev Get the number of reward events
     * @return Number of reward events
     */
    function getRewardHistoryCount() public view returns (uint256) {
        return rewardHistory.length;
    }

    /**
     * @dev Get the number of action types
     * @return Number of action types
     */
    function getActionTypeCount() public view returns (uint256) {
        return actionTypes.length;
    }

    /**
     * @dev Grant verifier role to an address
     * @param verifier Address to be granted verifier role
     */
    function addVerifier(address verifier) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "CircularRewards: must have admin role");
        grantRole(VERIFIER_ROLE, verifier);
    }
}
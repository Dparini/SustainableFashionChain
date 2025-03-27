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
        string actionType;
        uint256 baseReward;
        bool active;
    }

    // Reward history
    struct RewardEvent {
        address user;
        uint256 tokenId;
        string actionType;
        uint256 rewardAmount;
        uint256 timestamp;
    }

    mapping(string => RewardConfig) public rewardConfigs;
    string[] public actionTypes;
    RewardEvent[] public rewardHistory;

    event RewardConfigAdded(string actionType, uint256 baseReward);
    event RewardConfigUpdated(string actionType, uint256 baseReward, bool active);
    event RewardIssued(address indexed user, uint256 indexed tokenId, string actionType, uint256 rewardAmount);

    constructor(
        address admin,
        address _productNFT,
        address _cotToken
    ) {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(VERIFIER_ROLE, admin);

        productNFT = ProductNFT(_productNFT);
        cotToken = CotToken(_cotToken);

        _addRewardConfig("Recycle", 50 ether);
        _addRewardConfig("Repair", 20 ether);
        _addRewardConfig("Resell", 15 ether);
        _addRewardConfig("Upcycle", 30 ether);
    }

    function addRewardConfig(string memory actionType, uint256 baseReward) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "CircularRewards: must have admin role");
        _addRewardConfig(actionType, baseReward);
    }

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

    function updateRewardConfig(string memory actionType, uint256 baseReward, bool active) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "CircularRewards: must have admin role");
        require(rewardConfigs[actionType].baseReward > 0, "CircularRewards: action type does not exist");

        rewardConfigs[actionType].baseReward = baseReward;
        rewardConfigs[actionType].active = active;

        emit RewardConfigUpdated(actionType, baseReward, active);
    }

    function issueReward(
        address user,
        uint256 tokenId,
        string memory actionType,
        string memory details
    ) public {
        require(hasRole(VERIFIER_ROLE, _msgSender()), "CircularRewards: must have verifier role");
        require(rewardConfigs[actionType].baseReward > 0, "CircularRewards: invalid action type");
        require(rewardConfigs[actionType].active, "CircularRewards: action type is not active");

        // Verify token ownership - either the user owns the token or we're relying on the BRIDGE_ROLE
        // which has already been assigned to this contract
        require(
            productNFT.ownerOf(tokenId) == user,
            "CircularRewards: user must own the token"
        );

        uint256 rewardAmount = rewardConfigs[actionType].baseReward;

        // Record the action in the NFT
        productNFT.recordCircularAction(tokenId, actionType, details);

        // Specifically handle recycling
        if (keccak256(abi.encodePacked(actionType)) == keccak256(abi.encodePacked("Recycle"))) {
            // Explicitly call recycleProduct, which should work because we've been granted BRIDGE_ROLE
            try productNFT.recycleProduct(tokenId) {
                // Successfully recycled
            } catch Error(string memory reason) {
                // Log the error for debugging but continue processing the reward
                // This is a graceful fallback in case of permission issues
                revert(string(abi.encodePacked("CircularRewards: recycling failed: ", reason)));
            }
        }

        // Store reward event
        rewardHistory.push(RewardEvent({
            user: user,
            tokenId: tokenId,
            actionType: actionType,
            rewardAmount: rewardAmount,
            timestamp: block.timestamp
        }));

        // Mint tokens to the user
        cotToken.mintTo(user, rewardAmount);

        emit RewardIssued(user, tokenId, actionType, rewardAmount);
    }

    function getRewardHistoryCount() public view returns (uint256) {
        return rewardHistory.length;
    }

    function getActionTypeCount() public view returns (uint256) {
        return actionTypes.length;
    }

    function addVerifier(address verifier) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "CircularRewards: must have admin role");
        grantRole(VERIFIER_ROLE, verifier);
    }
}
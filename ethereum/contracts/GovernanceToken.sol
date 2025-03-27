// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title GovernanceToken
 * @dev Governance token for SustainableFashionChain DAO
 * Allows stakeholders to vote on protocol parameters, upgrades, and policy changes
 */
contract GovernanceToken is ERC20, ERC20Votes, ERC20Snapshot, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant SNAPSHOT_ROLE = keccak256("SNAPSHOT_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // Token distribution parameters
    uint256 public immutable maxSupply;
    uint256 public immutable stakeholderAllocation;
    uint256 public immutable communityAllocation;
    uint256 public immutable teamAllocation;
    uint256 public immutable ecosystemFundAllocation;

    // Vesting parameters
    mapping(address => uint256) public vestingStart;
    mapping(address => uint256) public vestingEnd;
    mapping(address => uint256) public vestingAmount;
    mapping(address => uint256) public vestedTokensClaimed;

    // Staking parameters
    mapping(address => uint256) public stakedAmount;
    mapping(address => uint256) public stakingStart;
    uint256 public stakingRewardRate; // reward per token per second (scaled by 1e18)

    // Events
    event TokensVested(address indexed beneficiary, uint256 amount);
    event TokensClaimed(address indexed beneficiary, uint256 amount);
    event TokensStaked(address indexed staker, uint256 amount);
    event TokensUnstaked(address indexed staker, uint256 amount);
    event StakingRewardsClaimed(address indexed staker, uint256 amount);
    event StakingRewardRateUpdated(uint256 oldRate, uint256 newRate);

    /**
     * @dev Constructor
     * @param admin Address to be granted admin role
     * @param initialSupply Initial supply to mint to admin
     * @param _maxSupply Maximum token supply
     */
    constructor(
        address admin,
        uint256 initialSupply,
        uint256 _maxSupply
    ) ERC20("SustainableFashion Governance", "SFG") ERC20Permit("SustainableFashion Governance") {
        require(initialSupply <= _maxSupply, "Initial supply exceeds max supply");

        maxSupply = _maxSupply;

        // Set token allocation percentages (in basis points - 10000 = 100%)
        stakeholderAllocation = 4000; // 40%
        communityAllocation = 3000;   // 30%
        teamAllocation = 1500;        // 15%
        ecosystemFundAllocation = 1500; // 15%

        // Initialize staking reward rate (0.01% per day - scaled to per second)
        // 0.0001 / 86400 * 1e18 = 1157407407407
        stakingRewardRate = 1157407407407;

        // Set up roles
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(MINTER_ROLE, admin);
        _setupRole(SNAPSHOT_ROLE, admin);
        _setupRole(PAUSER_ROLE, admin);

        // Mint initial supply to admin
        _mint(admin, initialSupply);
    }

    /**
     * @dev Creates a new snapshot
     * Used for governance voting snapshots
     */
    function snapshot() external onlyRole(SNAPSHOT_ROLE) returns (uint256) {
        return _snapshot();
    }

    /**
     * @dev Pauses token transfers
     * Only callable by pauser
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpauses token transfers
     * Only callable by pauser
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Mints new tokens
     * Only callable by minter, and cannot exceed max supply
     * @param to Address to receive the minted tokens
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= maxSupply, "Exceeds max supply");
        _mint(to, amount);
    }

    /**
     * @dev Creates a vesting schedule for a beneficiary
     * Only callable by admin
     * @param beneficiary Address to receive vested tokens
     * @param amount Total amount of tokens to vest
     * @param startTime Start time of the vesting period
     * @param durationInSeconds Duration of the vesting period in seconds
     */
    function createVestingSchedule(
        address beneficiary,
        uint256 amount,
        uint256 startTime,
        uint256 durationInSeconds
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(amount > 0, "Amount must be greater than 0");
        require(durationInSeconds > 0, "Duration must be greater than 0");
        require(vestingAmount[beneficiary] == 0, "Beneficiary already has vesting schedule");

        // Ensure sufficient tokens available
        require(totalSupply() + amount <= maxSupply, "Exceeds max supply");

        // Set vesting parameters
        vestingStart[beneficiary] = startTime;
        vestingEnd[beneficiary] = startTime + durationInSeconds;
        vestingAmount[beneficiary] = amount;

        // Mint tokens to this contract to be claimed later
        _mint(address(this), amount);

        emit TokensVested(beneficiary, amount);
    }

    /**
     * @dev Allows beneficiary to claim vested tokens
     */
    function claimVestedTokens() external whenNotPaused {
        address beneficiary = msg.sender;
        require(vestingAmount[beneficiary] > 0, "No vesting schedule found");

        uint256 vestedAmount = calculateVestedAmount(beneficiary);
        uint256 claimableAmount = vestedAmount - vestedTokensClaimed[beneficiary];

        require(claimableAmount > 0, "No tokens available to claim");

        vestedTokensClaimed[beneficiary] += claimableAmount;

        // Transfer vested tokens to beneficiary
        _transfer(address(this), beneficiary, claimableAmount);

        emit TokensClaimed(beneficiary, claimableAmount);
    }

    /**
     * @dev Calculates vested amount for a beneficiary
     * @param beneficiary Address of the beneficiary
     * @return Amount of tokens vested so far
     */
    function calculateVestedAmount(address beneficiary) public view returns (uint256) {
        if (vestingAmount[beneficiary] == 0) {
            return 0;
        }

        if (block.timestamp < vestingStart[beneficiary]) {
            return 0;
        }

        if (block.timestamp >= vestingEnd[beneficiary]) {
            return vestingAmount[beneficiary];
        }

        // Linear vesting calculation
        uint256 timeElapsed = block.timestamp - vestingStart[beneficiary];
        uint256 totalVestingDuration = vestingEnd[beneficiary] - vestingStart[beneficiary];

        return (vestingAmount[beneficiary] * timeElapsed) / totalVestingDuration;
    }

    /**
     * @dev Stake tokens for governance rights and rewards
     * @param amount Amount of tokens to stake
     */
    function stakeTokens(uint256 amount) external whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");

        // Claim any pending rewards before updating stake
        claimStakingRewards();

        // Transfer tokens to contract
        _transfer(msg.sender, address(this), amount);

        // Update staking info
        stakedAmount[msg.sender] += amount;
        if (stakingStart[msg.sender] == 0) {
            stakingStart[msg.sender] = block.timestamp;
        }

        emit TokensStaked(msg.sender, amount);
    }

    /**
     * @dev Unstake tokens
     * @param amount Amount of tokens to unstake
     */
    function unstakeTokens(uint256 amount) external whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        require(stakedAmount[msg.sender] >= amount, "Insufficient staked amount");

        // Claim any pending rewards before updating stake
        claimStakingRewards();

        // Update staking info
        stakedAmount[msg.sender] -= amount;

        // Transfer tokens back to user
        _transfer(address(this), msg.sender, amount);

        emit TokensUnstaked(msg.sender, amount);
    }

    /**
     * @dev Claim staking rewards
     */
    function claimStakingRewards() public whenNotPaused {
        uint256 rewards = calculateStakingRewards(msg.sender);

        if (rewards > 0) {
            // Ensure sufficient tokens available for rewards
            require(totalSupply() + rewards <= maxSupply, "Exceeds max supply");

            // Update staking start time for future calculations
            stakingStart[msg.sender] = block.timestamp;

            // Mint reward tokens to staker
            _mint(msg.sender, rewards);

            emit StakingRewardsClaimed(msg.sender, rewards);
        }
    }

    /**
     * @dev Calculate staking rewards for a user
     * @param staker Address of the staker
     * @return Amount of reward tokens earned
     */
    function calculateStakingRewards(address staker) public view returns (uint256) {
        if (stakedAmount[staker] == 0 || stakingStart[staker] == 0) {
            return 0;
        }

        uint256 stakingDuration = block.timestamp - stakingStart[staker];

        // Calculate rewards: amount * rate * duration / 1e18
        return (stakedAmount[staker] * stakingRewardRate * stakingDuration) / 1e18;
    }

    /**
     * @dev Update staking reward rate
     * Only callable by admin
     * @param newRate New reward rate (scaled by 1e18)
     */
    function updateStakingRewardRate(uint256 newRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldRate = stakingRewardRate;
        stakingRewardRate = newRate;

        emit StakingRewardRateUpdated(oldRate, newRate);
    }

    /**
     * @dev Get staking info for a user
     * @param staker Address of the staker
     * @return amount Amount of tokens staked
     * @return since Timestamp when staking started
     * @return rewards Pending rewards
     */
    function getStakingInfo(address staker) external view returns (uint256 amount, uint256 since, uint256 rewards) {
        return (stakedAmount[staker], stakingStart[staker], calculateStakingRewards(staker));
    }

    /**
     * @dev Get vesting info for a beneficiary
     * @param beneficiary Address of the beneficiary
     * @return total Total vesting amount
     * @return vested Amount vested so far
     * @return claimed Amount claimed so far
     * @return claimable Amount available to claim
     */
    function getVestingInfo(address beneficiary) external view returns (
        uint256 total,
        uint256 vested,
        uint256 claimed,
        uint256 claimable
    ) {
        uint256 vestedAmount = calculateVestedAmount(beneficiary);

        return (
            vestingAmount[beneficiary],
            vestedAmount,
            vestedTokensClaimed[beneficiary],
            vestedAmount - vestedTokensClaimed[beneficiary]
        );
    }

    // Override functions to make ERC20Votes work with ERC20Snapshot
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Snapshot) whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Votes) {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._burn(account, amount);
    }
 }

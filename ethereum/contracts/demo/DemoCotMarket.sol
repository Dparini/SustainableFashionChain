// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../CotToken.sol";
import "./DemoPriceFeed.sol";

/** Fixed-price local exercise venue. Not an AMM or production exchange.
 * Trades transfer existing backed COT; they never mint. Freshness and min/max
 * settlement bounds are enforced onchain at inclusion, not only in eth_call.
 */
contract DemoCotMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;
    CotToken public immutable cot;
    IERC20 public immutable usd;
    DemoPriceFeed public immutable feed;
    uint256 public constant feeBps = 20;
    uint256 public constant MAX_ORACLE_AGE = 3600;
    uint256 public constant MAX_EXPOSURE_BPS = 3500;
    uint256 public constant MAX_SINGLE_TRADE_BPS = 1000;
    uint256 public constant MIN_LIQUIDITY_USD = 10000 * 1e6;
    event Trade(address indexed trader, bool buy, uint256 cotAmount, uint256 usdAmount);

    constructor(address cotAddress, address usdAddress, address feedAddress) {
        require(cotAddress != address(0) && usdAddress != address(0) && feedAddress != address(0), "ZERO_ADDRESS");
        cot = CotToken(cotAddress); usd = IERC20(usdAddress); feed = DemoPriceFeed(feedAddress);
    }

    function quote(uint256 amount, bool isBuy) public view returns (uint256) {
        require(amount > 0, "ZERO_AMOUNT");
        (, int256 price, , uint256 updated, ) = feed.latestRoundData();
        require(updated > 0 && updated <= block.timestamp, "INVALID_ORACLE_TIME");
        require(block.timestamp - updated <= MAX_ORACLE_AGE, "STALE_ORACLE");
        require(price > 0, "INVALID_ORACLE_PRICE");
        uint256 multiplier = isBuy ? 10000 + feeBps : 10000 - feeBps;
        // 18 COT decimals × 8 price decimals → 6 USD decimals, including fee.
        uint256 numerator = amount * uint256(price) * multiplier;
        uint256 denominator = 1e24;
        return isBuy ? (numerator + denominator - 1) / denominator : numerator / denominator;
    }

    function _backingAndDeadline(uint256 deadline) internal view {
        require(block.timestamp <= deadline, "TRADE_EXPIRED");
        require(cot.totalSupply() <= cot.reserveRegistry().totalVerifiedKg(), "INSUFFICIENT_BACKING");
    }

    function _portfolioBounds(uint256 amount, uint256 usdAmount, bool isBuy) internal view {
        (, int256 answer, , , ) = feed.latestRoundData();
        uint256 price = uint256(answer); // quote() already validates the round.
        uint256 cotBalance = cot.balanceOf(msg.sender);
        uint256 usdBalance = usd.balanceOf(msg.sender);
        require(usd.balanceOf(address(this)) >= MIN_LIQUIDITY_USD &&
            cot.balanceOf(address(this)) * price >= MIN_LIQUIDITY_USD * 1e20, "MIN_LIQUIDITY");
        // Compare exact integer valuations without truncating COT or USD decimals.
        uint256 nav = cotBalance * price + usdBalance * 1e20;
        require(usdAmount * 1e20 * 10000 <= nav * MAX_SINGLE_TRADE_BPS, "MAX_SINGLE_TRADE");
        require(isBuy ? usdBalance >= usdAmount : cotBalance >= amount, "INSUFFICIENT_PORTFOLIO");
        uint256 postCot = isBuy ? cotBalance + amount : cotBalance - amount;
        uint256 postUsd = isBuy ? usdBalance - usdAmount : usdBalance + usdAmount;
        uint256 postNav = postCot * price + postUsd * 1e20;
        require(postCot * price * 10000 <= postNav * MAX_EXPOSURE_BPS, "MAX_COT_EXPOSURE");
    }

    function buy(uint256 amount, uint256 maxUsd, uint256 deadline) external nonReentrant {
        _backingAndDeadline(deadline);
        uint256 cost = quote(amount, true);
        require(cost <= maxUsd, "MAX_SLIPPAGE");
        _portfolioBounds(amount, cost, true);
        usd.safeTransferFrom(msg.sender, address(this), cost);
        IERC20(address(cot)).safeTransfer(msg.sender, amount);
        emit Trade(msg.sender, true, amount, cost);
    }

    function sell(uint256 amount, uint256 minUsd, uint256 deadline) external nonReentrant {
        _backingAndDeadline(deadline);
        uint256 proceeds = quote(amount, false);
        require(proceeds >= minUsd, "MAX_SLIPPAGE");
        _portfolioBounds(amount, proceeds, false);
        IERC20(address(cot)).safeTransferFrom(msg.sender, address(this), amount);
        usd.safeTransfer(msg.sender, proceeds);
        emit Trade(msg.sender, false, amount, proceeds);
    }
}

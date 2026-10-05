// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/access/Ownable.sol";

/** Local demonstration feed. Not an actual Chainlink cotton price feed. */
contract DemoPriceFeed is Ownable {
    uint8 public constant decimals = 8;
    uint80 public roundId;
    int256 public answer;
    uint256 public updatedAt;
    function setPrice(int256 price, uint256 timestamp) external onlyOwner {
        roundId++;
        answer = price;
        updatedAt = timestamp;
    }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, updatedAt, updatedAt, roundId);
    }
}

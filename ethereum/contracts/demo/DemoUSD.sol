// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/** Test-only settlement collateral. No economic value, no deployed USDC claim. */
contract DemoUSD is ERC20, Ownable {
    constructor() ERC20("Local demo dollars", "demoUSD") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external onlyOwner { _mint(to, amount); }
}

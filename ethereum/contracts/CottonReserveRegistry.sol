// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";

/** Authorized backing attestations, not a trustless proof of physical custody.
 * All kg values are scaled by 1e18. Consumption is cumulative: ordinary token
 * burns do not authorize reusing the same physical cotton for new claims.
 */
contract CottonReserveRegistry is AccessControl {
    bytes32 public constant ATTESTOR_ROLE = keccak256("ATTESTOR_ROLE");
    address public immutable token;

    struct Reserve {
        bytes32 batchId;
        uint256 verifiedKg;
        uint256 tokenizedKg;
        uint256 lastUpdated;
        bool active;
        bytes32 certificationHash;
        bytes32 fabricVerificationTxId;
    }

    mapping(bytes32 => Reserve) public reserves;
    uint256 public totalVerifiedKg;
    uint256 public totalTokenizedKg;

    event ReserveAttested(bytes32 indexed batchId, uint256 verifiedKg,
        bytes32 certificationHash, bytes32 fabricVerificationTxId);
    event ReserveConsumed(bytes32 indexed batchId, uint256 amount);
    event ReserveDeactivated(bytes32 indexed batchId);

    constructor(address admin, address tokenAddress) {
        require(admin != address(0) && tokenAddress != address(0), "ZERO_ADDRESS");
        token = tokenAddress;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ATTESTOR_ROLE, admin);
    }

    function attestReserve(bytes32 batchId, uint256 verifiedKg,
        bytes32 certificationHash, bytes32 fabricVerificationTxId)
        external onlyRole(ATTESTOR_ROLE)
    {
        require(batchId != bytes32(0) && verifiedKg > 0, "INVALID_RESERVE");
        require(certificationHash != bytes32(0) && fabricVerificationTxId != bytes32(0), "MISSING_PROVENANCE");
        Reserve storage reserve = reserves[batchId];
        require(verifiedKg >= reserve.tokenizedKg, "BACKING_BELOW_ISSUANCE");
        // A batch's provenance is fixed. Amend quantity only with the same identity.
        if (reserve.lastUpdated != 0) {
            require(reserve.certificationHash == certificationHash &&
                reserve.fabricVerificationTxId == fabricVerificationTxId, "PROVENANCE_MISMATCH");
        }
        uint256 previous = reserve.active ? reserve.verifiedKg : 0;
        totalVerifiedKg = totalVerifiedKg - previous + verifiedKg;
        reserve.batchId = batchId;
        reserve.verifiedKg = verifiedKg;
        reserve.lastUpdated = block.timestamp;
        reserve.active = true;
        reserve.certificationHash = certificationHash;
        reserve.fabricVerificationTxId = fabricVerificationTxId;
        emit ReserveAttested(batchId, verifiedKg, certificationHash, fabricVerificationTxId);
    }

    function consume(bytes32 batchId, uint256 amount) external {
        require(msg.sender == token, "ONLY_TOKEN");
        Reserve storage reserve = reserves[batchId];
        require(reserve.active, "UNVERIFIED_RESERVE");
        require(amount > 0 && reserve.tokenizedKg + amount <= reserve.verifiedKg, "INSUFFICIENT_BACKING");
        reserve.tokenizedKg += amount;
        reserve.lastUpdated = block.timestamp;
        totalTokenizedKg += amount;
        emit ReserveConsumed(batchId, amount);
    }

    function deactivateReserve(bytes32 batchId) external onlyRole(ATTESTOR_ROLE) {
        Reserve storage reserve = reserves[batchId];
        require(reserve.active, "UNVERIFIED_RESERVE");
        require(reserve.tokenizedKg == 0, "RESERVE_HAS_CLAIMS");
        totalVerifiedKg -= reserve.verifiedKg;
        reserve.active = false;
        reserve.lastUpdated = block.timestamp;
        emit ReserveDeactivated(batchId);
    }
}

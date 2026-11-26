// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts-v5.7/access/Ownable.sol";

import {AdvancedVestingWallet} from "./AdvancedVestingWallet.sol";
import {FactoryCaller} from "./FactoryCaller.sol";

/// @notice Deploys cliff + linear vesting wallets. Separate from the token deployers.
contract VestingDeployer is FactoryCaller {
    constructor(address owner_) Ownable(owner_) {}

    function deploy(
        address beneficiary,
        uint64 startTimestamp,
        uint64 durationSeconds,
        uint64 cliffSeconds,
        bytes32 salt
    ) external onlyFactory returns (address wallet) {
        wallet = address(
            new AdvancedVestingWallet{salt: salt}(beneficiary, startTimestamp, durationSeconds, cliffSeconds)
        );
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts-v5.7/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts-v5.7/access/Ownable2Step.sol";
import {VestingWallet} from "@openzeppelin/contracts-v5.7/finance/VestingWallet.sol";
import {VestingWalletCliff} from "@openzeppelin/contracts-v5.7/finance/VestingWalletCliff.sol";

/**
 * @title AdvancedVestingWallet
 * @notice Vesting wallet with a cliff and then the OpenZeppelin linear schedule.
 * @dev Before `cliff()` nothing is releasable. From the cliff onward the linear schedule applies,
 *      measured from `start()`, so the amount accrued during the cliff becomes releasable at the cliff.
 *      The beneficiary is the owner. Replacing that owner takes two steps: `release` keeps paying the
 *      current owner until the pending owner calls `acceptOwnership`.
 */
contract AdvancedVestingWallet is VestingWalletCliff, Ownable2Step {
    constructor(address beneficiary, uint64 startTimestamp, uint64 durationSeconds, uint64 cliffSeconds)
        VestingWallet(beneficiary, startTimestamp, durationSeconds)
        VestingWalletCliff(cliffSeconds)
    {}

    function transferOwnership(address newOwner) public override(Ownable, Ownable2Step) {
        Ownable2Step.transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal override(Ownable, Ownable2Step) {
        Ownable2Step._transferOwnership(newOwner);
    }
}

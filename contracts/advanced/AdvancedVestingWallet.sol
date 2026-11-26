// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VestingWallet} from "@openzeppelin/contracts-v5.7/finance/VestingWallet.sol";
import {VestingWalletCliff} from "@openzeppelin/contracts-v5.7/finance/VestingWalletCliff.sol";

/**
 * @title AdvancedVestingWallet
 * @notice Vesting wallet with a cliff and then the OpenZeppelin linear schedule.
 * @dev Before `cliff()` nothing is releasable. From the cliff onward the linear schedule applies,
 *      measured from `start()`, so the amount accrued during the cliff becomes releasable at the cliff.
 */
contract AdvancedVestingWallet is VestingWalletCliff {
    constructor(address beneficiary, uint64 startTimestamp, uint64 durationSeconds, uint64 cliffSeconds)
        VestingWallet(beneficiary, startTimestamp, durationSeconds)
        VestingWalletCliff(cliffSeconds)
    {}
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AdvancedTokenInit} from "../advanced/AdvancedTokenCore.sol";
import {AdvancedTokenVotes} from "../advanced/AdvancedTokenVotes.sol";

/// @notice Test harness with a tiny votes supply cap. Not used in production.
contract VotesMaxSupplyHarness is AdvancedTokenVotes {
    constructor(AdvancedTokenInit memory init) AdvancedTokenVotes(init) {}

    function _maxSupply() internal view override returns (uint256) {
        return 10;
    }
}

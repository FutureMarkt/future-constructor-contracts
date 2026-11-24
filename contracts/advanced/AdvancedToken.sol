// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AdvancedTokenCore, AdvancedTokenInit} from "./AdvancedTokenCore.sol";

/**
 * @title AdvancedToken
 * @notice Advanced ERC-20 without permit or votes.
 * @dev `init.initialSupply` is raw base units. The factory is the only component that scales whole tokens.
 */
contract AdvancedToken is AdvancedTokenCore {
    constructor(AdvancedTokenInit memory init) AdvancedTokenCore(init) {
        _mintInitial(init);
    }
}

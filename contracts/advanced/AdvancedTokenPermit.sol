// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts-v5.7/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts-v5.7/token/ERC20/extensions/ERC20Permit.sol";

import {AdvancedTokenCore, AdvancedTokenInit} from "./AdvancedTokenCore.sol";

/**
 * @title AdvancedTokenPermit
 * @notice Advanced token with ERC-2612 permit.
 * @dev The EIP-712 name is the token name and must fit in 31 bytes.
 *      `init.initialSupply` is raw base units.
 */
contract AdvancedTokenPermit is AdvancedTokenCore, ERC20Permit {
    constructor(AdvancedTokenInit memory init) AdvancedTokenCore(init) ERC20Permit(init.name) {
        _mintInitial(init);
    }

    function decimals() public view override(AdvancedTokenCore, ERC20) returns (uint8) {
        return super.decimals();
    }

    function _update(address from, address to, uint256 value) internal override(AdvancedTokenCore, ERC20) {
        AdvancedTokenCore._update(from, to, value);
    }
}

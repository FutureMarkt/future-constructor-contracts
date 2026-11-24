// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Nonces} from "@openzeppelin/contracts-v5.7/utils/Nonces.sol";
import {ERC20} from "@openzeppelin/contracts-v5.7/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts-v5.7/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts-v5.7/token/ERC20/extensions/ERC20Votes.sol";

import {AdvancedTokenCore, AdvancedTokenInit} from "./AdvancedTokenCore.sol";

/**
 * @title AdvancedTokenVotes
 * @notice Separate votes variant. Includes permit because both features share one EIP-712 domain.
 * @dev The token name must fit in 31 bytes. Voting power moves on every final balance update, including the tax leg.
 *      `init.initialSupply` is raw base units.
 */
contract AdvancedTokenVotes is AdvancedTokenCore, ERC20Permit, ERC20Votes {
    constructor(AdvancedTokenInit memory init) AdvancedTokenCore(init) ERC20Permit(init.name) {
        _mintInitial(init);
    }

    function decimals() public view override(AdvancedTokenCore, ERC20) returns (uint8) {
        return super.decimals();
    }

    function _update(address from, address to, uint256 value) internal override(AdvancedTokenCore, ERC20, ERC20Votes) {
        AdvancedTokenCore._update(from, to, value);
    }

    function _finalizeUpdate(address from, address to, uint256 value) internal override {
        super._finalizeUpdate(from, to, value);
        if (from == address(0)) {
            uint256 supply = totalSupply();
            uint256 maxSupply = _maxSupply();
            if (supply > maxSupply) revert ERC20ExceededSafeSupply(supply, maxSupply);
        }
        _transferVotingUnits(from, to, value);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}

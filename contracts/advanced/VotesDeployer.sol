// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts-v5.7/access/Ownable.sol";

import {AdvancedTokenInit} from "./AdvancedTokenCore.sol";
import {AdvancedTokenVotes} from "./AdvancedTokenVotes.sol";
import {FactoryCaller} from "./FactoryCaller.sol";

/// @notice Deploys the votes variant (permit included). Separate contract because this bytecode is the largest.
contract VotesDeployer is FactoryCaller {
    constructor(address owner_) Ownable(owner_) {}

    function deploy(AdvancedTokenInit memory init, bytes32 salt) external onlyFactory returns (address token) {
        token = address(new AdvancedTokenVotes{salt: salt}(init));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts-v5.7/access/Ownable.sol";

import {AdvancedToken} from "./AdvancedToken.sol";
import {AdvancedTokenInit} from "./AdvancedTokenCore.sol";
import {FactoryCaller} from "./FactoryCaller.sol";

/// @notice Deploys AdvancedToken. Kept separate so the factory bytecode does not embed the token.
contract TokenDeployer is FactoryCaller {
    constructor(address owner_) Ownable(owner_) {}

    function deploy(AdvancedTokenInit memory init, bytes32 salt) external onlyFactory returns (address token) {
        token = address(new AdvancedToken{salt: salt}(init));
    }
}

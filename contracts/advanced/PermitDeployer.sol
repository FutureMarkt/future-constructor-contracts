// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts-v5.7/access/Ownable.sol";

import {AdvancedTokenInit} from "./AdvancedTokenCore.sol";
import {AdvancedTokenPermit} from "./AdvancedTokenPermit.sol";
import {FactoryCaller} from "./FactoryCaller.sol";

/// @notice Deploys the permit variant. Separate contract so its creation code is not inside the factory.
contract PermitDeployer is FactoryCaller {
    constructor(address owner_) Ownable(owner_) {}

    function deploy(AdvancedTokenInit memory init, bytes32 salt) external onlyFactory returns (address token) {
        token = address(new AdvancedTokenPermit{salt: salt}(init));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable2Step} from "@openzeppelin/contracts-v5.7/access/Ownable2Step.sol";

/**
 * @notice Deployer base. The factory address can be set once by the current owner.
 * @dev Ownership moves in two steps. A single `transferOwnership` does not let the pending
 *      account call `setFactory`. The current owner can still bind the real factory, or
 *      cancel the pending transfer, before the new owner accepts.
 */
abstract contract FactoryCaller is Ownable2Step {
    address public factory;

    error OnlyFactory();
    error FactoryAlreadySet();
    error ZeroAddress();

    event FactorySet(address indexed factory);

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    function setFactory(address factory_) external onlyOwner {
        if (factory != address(0)) revert FactoryAlreadySet();
        if (factory_ == address(0)) revert ZeroAddress();
        factory = factory_;
        emit FactorySet(factory_);
    }
}

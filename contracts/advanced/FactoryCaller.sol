// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts-v5.7/access/Ownable.sol";

/**
 * @notice Deployer base. The factory address can be set once by the deployer owner.
 */
abstract contract FactoryCaller is Ownable {
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

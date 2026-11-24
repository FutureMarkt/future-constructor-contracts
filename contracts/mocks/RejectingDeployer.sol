// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITokenFactory {
    struct TokenConfig {
        string name;
        string symbol;
        uint8 decimals;
        uint256 initialSupply;
        address initialOwner;
    }

    function deployToken(TokenConfig calldata config) external payable returns (address token);
}

/// @notice Forwards a deployment and cannot receive a refund (no receive/fallback).
contract RejectingDeployer {
    function deploy(address factory, ITokenFactory.TokenConfig calldata config) external payable returns (address) {
        return ITokenFactory(factory).deployToken{value: msg.value}(config);
    }
}

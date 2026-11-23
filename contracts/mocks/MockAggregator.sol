// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../vendor/AggregatorV3Interface.sol";

/**
 * @title MockAggregator
 * @notice Mock Chainlink price feed aggregator for testing
 */
contract MockAggregator is AggregatorV3Interface {
    uint8 private immutable _decimals;
    int256 private _price;
    uint256 private _updatedAt;
    uint80 private _roundId;

    constructor(uint8 decimals_, int256 initialPrice) {
        _decimals = decimals_;
        _price = initialPrice;
        _updatedAt = block.timestamp;
        _roundId = 1;
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external pure override returns (string memory) {
        return "Mock Price Feed";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 _id)
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_id, _price, _updatedAt, _updatedAt, _id);
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, _price, _updatedAt, _updatedAt, _roundId);
    }

    function setPrice(int256 newPrice) external {
        _price = newPrice;
        _updatedAt = block.timestamp;
        _roundId++;
    }

    function updateTimestamp() external {
        _updatedAt = block.timestamp;
    }
}

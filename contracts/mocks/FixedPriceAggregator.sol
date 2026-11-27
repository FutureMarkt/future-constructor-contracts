// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AggregatorV3Interface} from "../vendor/AggregatorV3Interface.sol";

/// @notice Fixed-price AggregatorV3 feed for the Polygon Amoy testnet deployment.
/// @dev `latestRoundData` sets `updatedAt` to `block.timestamp`, so the factory freshness check stays open.
///      The price is immutable. `scripts/deploy-amoy-mock-feed.ts` is the only deployer and it exits unless the chain id is 80002.
contract FixedPriceAggregator is AggregatorV3Interface {
    uint8 private constant FEED_DECIMALS = 8;
    uint80 private constant ROUND = 1;

    int256 private immutable _price;
    string private _description;
    uint256 private immutable _startedAt;

    error NonPositivePrice();

    constructor(string memory description_, int256 price_) {
        if (price_ <= 0) revert NonPositivePrice();
        _description = description_;
        _price = price_;
        _startedAt = block.timestamp;
    }

    function decimals() external pure override returns (uint8) {
        return FEED_DECIMALS;
    }

    function description() external view override returns (string memory) {
        return _description;
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 roundId_)
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (roundId_, _price, _startedAt, block.timestamp, ROUND);
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (ROUND, _price, _startedAt, block.timestamp, ROUND);
    }
}

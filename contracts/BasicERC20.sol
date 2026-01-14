// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title BasicERC20
 * @notice Minimal ERC-20 implementation with configurable decimals and premint.
 */
contract BasicERC20 is ERC20 {
    /// @notice Maximum number of decimals allowed
    uint8 private constant MAX_DECIMALS = 30;
    /// @notice Minimum number of decimals allowed (0 for native-like tokens, but typically 6+)
    uint8 private constant MIN_DECIMALS = 0;
    /// @notice Maximum total supply to prevent overflow issues (type(uint256).max / 1e18)
    uint256 private constant MAX_SUPPLY = type(uint256).max / 1e18;

    uint8 private immutable _customDecimals;

    /**
     * @notice Creates a new ERC-20 token
     * @param name_ Token name
     * @param symbol_ Token symbol
     * @param decimals_ Number of decimals (0-30)
     * @param totalSupply_ Initial supply (will be multiplied by 10^decimals_)
     * @param initialOwner_ Address that will receive all initial tokens
     * @dev Reverts if owner is zero, decimals out of range, or supply would overflow
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 totalSupply_,
        address initialOwner_
    ) ERC20(name_, symbol_) {
        require(initialOwner_ != address(0), "Initial owner is zero");
        require(decimals_ >= MIN_DECIMALS && decimals_ <= MAX_DECIMALS, "Decimals out of range");
        require(totalSupply_ <= MAX_SUPPLY, "Supply exceeds maximum");

        _customDecimals = decimals_;

        if (totalSupply_ > 0) {
            // Check for overflow before multiplication
            uint256 decimalsMultiplier = 10 ** uint256(decimals_);
            require(
                totalSupply_ <= type(uint256).max / decimalsMultiplier,
                "Supply overflow"
            );
            
            uint256 scaledSupply = totalSupply_ * decimalsMultiplier;
            _mint(initialOwner_, scaledSupply);
        }
    }

    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts-v5.7/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts-v5.7/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts-v5.7/access/Ownable2Step.sol";

/**
 * @title AdvancedTaxToken
 * @notice ERC-20 with buy/sell tax on transfers that enter or leave a marked AMM pair.
 * @dev Wallet-to-wallet transfers are not taxed. OpenZeppelin Contracts 5.7.0.
 *      The existing TokenFactory is unchanged and still compiles against 5.4.0.
 *
 *      `initialSupply` is raw base units. This contract does not scale it.
 *      Only AdvancedTokenFactory multiplies a whole-token amount by `10 ** decimals`, and it does that once.
 */
contract AdvancedTaxToken is ERC20, Ownable2Step {
    /// @notice Hard ceiling: buy bps + sell bps. Not configurable.
    uint16 public constant MAX_TOTAL_FEE_BPS = 1000;
    uint256 private constant _BPS = 10_000;

    uint8 private immutable _decimals;
    /// @notice Deployer factory. Always excluded. Not the AMM pair.
    address public immutable factory;

    address public feeRecipient;
    uint16 public buyFeeBps;
    uint16 public sellFeeBps;

    mapping(address account => bool) private _pools;
    mapping(address account => bool) private _excluded;

    event FeesUpdated(uint16 buyFeeBps, uint16 sellFeeBps);
    event PoolUpdated(address indexed pool, bool isPool);
    event ExclusionUpdated(address indexed account, bool excluded);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event TaxCollected(address indexed from, address indexed to, uint256 fee, bool isBuy);

    error FeeTooHigh(uint16 buyFeeBps, uint16 sellFeeBps);
    error FeeIncreaseForbidden(uint16 currentBuy, uint16 currentSell, uint16 newBuy, uint16 newSell);
    error ZeroAddress();
    error InvalidFeeRecipient(address recipient);
    error DecimalsOutOfRange(uint8 decimals);

    uint8 public constant MAX_DECIMALS = 30;

    /**
     * @param initialSupply Raw base units minted to `initialOwner`. Zero mints nothing.
     *        This contract does not multiply by `10 ** decimals`. AdvancedTokenFactory scales once.
     * @param factory_ Address excluded together with the owner (the future factory passes itself).
     * @param buyFeeBps_ Tax when tokens leave a marked pool, in basis points.
     * @param sellFeeBps_ Tax when tokens enter a marked pool, in basis points.
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        address initialOwner,
        address factory_,
        address feeRecipient_,
        uint16 buyFeeBps_,
        uint16 sellFeeBps_
    ) ERC20(name_, symbol_) Ownable(initialOwner) {
        if (decimals_ > MAX_DECIMALS) revert DecimalsOutOfRange(decimals_);
        if (factory_ == address(0)) revert ZeroAddress();
        _validateFeeRecipient(feeRecipient_);
        _validateFeeSum(buyFeeBps_, sellFeeBps_);

        _decimals = decimals_;
        factory = factory_;
        feeRecipient = feeRecipient_;
        buyFeeBps = buyFeeBps_;
        sellFeeBps = sellFeeBps_;

        if (initialSupply > 0) {
            _mint(initialOwner, initialSupply);
        }
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function isPool(address account) public view returns (bool) {
        return _pools[account];
    }

    /// @notice Owner and factory are excluded even if the mapping says otherwise.
    function isExcluded(address account) public view returns (bool) {
        return account == owner() || account == factory || _excluded[account];
    }

    /// @notice Rates can stay the same or go down. They cannot go up, and their sum cannot exceed the ceiling.
    function setFees(uint16 newBuyFeeBps, uint16 newSellFeeBps) external onlyOwner {
        _validateFeeSum(newBuyFeeBps, newSellFeeBps);
        if (newBuyFeeBps > buyFeeBps || newSellFeeBps > sellFeeBps) {
            revert FeeIncreaseForbidden(buyFeeBps, sellFeeBps, newBuyFeeBps, newSellFeeBps);
        }
        buyFeeBps = newBuyFeeBps;
        sellFeeBps = newSellFeeBps;
        emit FeesUpdated(newBuyFeeBps, newSellFeeBps);
    }

    /// @notice Marks an AMM pair. Only transfers that touch a marked pair are taxed.
    function setPool(address pool, bool enabled) external onlyOwner {
        if (pool == address(0)) revert ZeroAddress();
        _pools[pool] = enabled;
        emit PoolUpdated(pool, enabled);
    }

    /// @notice Extra exclusion list. Does not remove the automatic owner and factory exclusion.
    function setExcluded(address account, bool excluded) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        _excluded[account] = excluded;
        emit ExclusionUpdated(account, excluded);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        _validateFeeRecipient(newRecipient);
        address previous = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(previous, newRecipient);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }

        (uint256 fee, bool isBuy) = _quoteTax(from, to, value);
        if (fee == 0) {
            super._update(from, to, value);
            return;
        }

        super._update(from, feeRecipient, fee);
        super._update(from, to, value - fee);
        emit TaxCollected(from, to, fee, isBuy);
    }

    /// @dev Entering a pool is a sell. Leaving a pool toward a non-pool is a buy. Pool-to-pool is a sell only.
    function _quoteTax(address from, address to, uint256 value) internal view returns (uint256 fee, bool isBuy) {
        if (value == 0 || isExcluded(from) || isExcluded(to)) {
            return (0, false);
        }
        if (_pools[to]) {
            return (_feeAmount(value, sellFeeBps), false);
        }
        if (_pools[from]) {
            return (_feeAmount(value, buyFeeBps), true);
        }
        return (0, false);
    }

    function _feeAmount(uint256 value, uint16 rate) internal pure returns (uint256) {
        if (rate == 0) return 0;
        return (value / _BPS) * rate + ((value % _BPS) * rate) / _BPS;
    }

    function _validateFeeSum(uint16 buyBps, uint16 sellBps) private pure {
        if (uint256(buyBps) + uint256(sellBps) > MAX_TOTAL_FEE_BPS) {
            revert FeeTooHigh(buyBps, sellBps);
        }
    }

    function _validateFeeRecipient(address recipient) private view {
        if (recipient == address(0) || recipient == address(this)) {
            revert InvalidFeeRecipient(recipient);
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts-v5.7/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts-v5.7/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts-v5.7/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts-v5.7/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts-v5.7/utils/Pausable.sol";

/**
 * @notice Arguments for an advanced token. `initialSupply`, `cap`, `recipients` and `amounts` are raw base units.
 * @dev The factory scales whole-token amounts once before it builds this struct. This contract does not scale again.
 */
struct AdvancedTokenInit {
    string name;
    string symbol;
    uint8 decimals;
    uint256 initialSupply;
    address initialOwner;
    address factory;
    address feeRecipient;
    uint16 buyFeeBps;
    uint16 sellFeeBps;
    bool hasMint;
    bool hasBurn;
    bool hasPause;
    bool hasTax;
    uint256 cap;
    address[] recipients;
    uint256[] amounts;
}

/**
 * @title AdvancedTokenCore
 * @notice Shared advanced ERC-20: distribution, optional mint and cap, holder burn, pause, buy/sell tax, Ownable2Step.
 * @dev Permit and votes live in child contracts so this bytecode stays out of those deployers.
 *      `initialSupply` is raw base units. A supply cap of 0 means the cap is off.
 */
abstract contract AdvancedTokenCore is ERC20, ERC20Burnable, Ownable2Step, Pausable {
    uint16 public constant MAX_TOTAL_FEE_BPS = 1000;
    uint256 private constant _BPS = 10_000;
    uint8 public constant MAX_DECIMALS = 30;
    uint256 public constant MAX_DISTRIBUTION = 10;

    uint8 private immutable _decimals;
    /// @notice Token factory excluded from tax. Not the AMM factory and not the router.
    address public immutable factory;
    bool public immutable hasMint;
    bool public immutable hasBurn;
    bool public immutable hasPause;
    bool public immutable hasTax;
    /// @notice Raw supply cap. Zero means uncapped.
    uint256 public immutable cap;

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
    error MintDisabled();
    error BurnDisabled();
    error PauseDisabled();
    error TaxDisabled();
    error CapExceeded(uint256 cap, uint256 supply);
    error BadDistribution();

    constructor(AdvancedTokenInit memory init) ERC20(init.name, init.symbol) Ownable(init.initialOwner) {
        if (init.factory == address(0)) revert ZeroAddress();
        if (init.decimals > MAX_DECIMALS) revert DecimalsOutOfRange(init.decimals);
        if (init.hasTax) {
            _validateFeeRecipient(init.feeRecipient);
            _validateFeeSum(init.buyFeeBps, init.sellFeeBps);
        } else if (init.buyFeeBps != 0 || init.sellFeeBps != 0) {
            revert TaxDisabled();
        }
        if (init.cap != 0 && init.initialSupply > init.cap) revert CapExceeded(init.cap, init.initialSupply);

        _decimals = init.decimals;
        factory = init.factory;
        hasMint = init.hasMint;
        hasBurn = init.hasBurn;
        hasPause = init.hasPause;
        hasTax = init.hasTax;
        cap = init.cap;
        feeRecipient = init.feeRecipient;
        buyFeeBps = init.buyFeeBps;
        sellFeeBps = init.sellFeeBps;
    }

    /// @notice Mints the raw initial supply. Concrete contracts call this at the end of their own constructor.
    function _mintInitial(AdvancedTokenInit memory init) internal {
        if (init.recipients.length == 0) {
            if (init.amounts.length != 0) revert BadDistribution();
            if (init.initialSupply > 0) _mint(init.initialOwner, init.initialSupply);
            return;
        }
        if (init.recipients.length != init.amounts.length || init.recipients.length > MAX_DISTRIBUTION) {
            revert BadDistribution();
        }
        uint256 sum;
        for (uint256 i; i < init.recipients.length; ++i) {
            if (init.recipients[i] == address(0)) revert ZeroAddress();
            sum += init.amounts[i];
            _mint(init.recipients[i], init.amounts[i]);
        }
        if (sum != init.initialSupply) revert BadDistribution();
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function isPool(address account) external view returns (bool) {
        return _pools[account];
    }

    function isExcluded(address account) public view returns (bool) {
        return account == owner() || account == factory || _excluded[account];
    }

    function mint(address to, uint256 amount) external onlyOwner {
        if (!hasMint) revert MintDisabled();
        uint256 next = totalSupply() + amount;
        if (cap != 0 && next > cap) revert CapExceeded(cap, next);
        _mint(to, amount);
    }

    function burn(uint256 value) public override {
        if (!hasBurn) revert BurnDisabled();
        super.burn(value);
    }

    function burnFrom(address account, uint256 value) public override {
        if (!hasBurn) revert BurnDisabled();
        super.burnFrom(account, value);
    }

    function pause() external onlyOwner {
        if (!hasPause) revert PauseDisabled();
        _pause();
    }

    function unpause() external onlyOwner {
        if (!hasPause) revert PauseDisabled();
        _unpause();
    }

    function setFees(uint16 newBuyFeeBps, uint16 newSellFeeBps) external onlyOwner {
        if (!hasTax) revert TaxDisabled();
        _validateFeeSum(newBuyFeeBps, newSellFeeBps);
        if (newBuyFeeBps > buyFeeBps || newSellFeeBps > sellFeeBps) {
            revert FeeIncreaseForbidden(buyFeeBps, sellFeeBps, newBuyFeeBps, newSellFeeBps);
        }
        buyFeeBps = newBuyFeeBps;
        sellFeeBps = newSellFeeBps;
        emit FeesUpdated(newBuyFeeBps, newSellFeeBps);
    }

    function setPool(address pool, bool enabled) external onlyOwner {
        if (pool == address(0)) revert ZeroAddress();
        _pools[pool] = enabled;
        emit PoolUpdated(pool, enabled);
    }

    function setExcluded(address account, bool excluded) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        _excluded[account] = excluded;
        emit ExclusionUpdated(account, excluded);
    }

    /// @notice Fee recipient can be changed. It cannot be the zero address or this token.
    function setFeeRecipient(address newRecipient) external onlyOwner {
        _validateFeeRecipient(newRecipient);
        address previous = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(previous, newRecipient);
    }

    function _update(address from, address to, uint256 value) internal virtual override {
        _requireNotPaused();
        (uint256 fee, bool isBuy) = _quoteTax(from, to, value);
        if (fee == 0) {
            _finalizeUpdate(from, to, value);
            return;
        }
        _finalizeUpdate(from, feeRecipient, fee);
        _finalizeUpdate(from, to, value - fee);
        emit TaxCollected(from, to, fee, isBuy);
    }

    /// @dev Child contracts hook the final balance update. Votes adds checkpoints here.
    function _finalizeUpdate(address from, address to, uint256 value) internal virtual {
        super._update(from, to, value);
    }

    function _quoteTax(address from, address to, uint256 value) internal view returns (uint256 fee, bool isBuy) {
        if (!hasTax || value == 0 || isExcluded(from) || isExcluded(to)) return (0, false);
        if (_pools[to]) return (_feeAmount(value, sellFeeBps), false);
        if (_pools[from]) return (_feeAmount(value, buyFeeBps), true);
        return (0, false);
    }

    function _feeAmount(uint256 value, uint16 rate) internal pure returns (uint256) {
        if (rate == 0) return 0;
        return (value / _BPS) * rate + ((value % _BPS) * rate) / _BPS;
    }

    function _validateFeeSum(uint16 buyBps, uint16 sellBps) private pure {
        if (uint256(buyBps) + uint256(sellBps) > MAX_TOTAL_FEE_BPS) revert FeeTooHigh(buyBps, sellBps);
    }

    function _validateFeeRecipient(address recipient) private view {
        if (recipient == address(0) || recipient == address(this)) revert InvalidFeeRecipient(recipient);
    }
}

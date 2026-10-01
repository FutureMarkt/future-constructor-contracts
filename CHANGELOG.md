# Changelog - Security Fixes

## Summary

Built on OpenZeppelin Contracts v5; factory source code is verified on Sourcify; no independent audit.

Issues identified in the internal code review have been addressed in the contracts.

## Changes Made

### BasicERC20.sol

#### HIGH-1: Integer Overflow Protection
- ✅ Added overflow check before multiplication: `totalSupply_ <= type(uint256).max / decimalsMultiplier`
- ✅ Added maximum supply constant: `MAX_SUPPLY = type(uint256).max / 1e18`
- ✅ Added validation for `totalSupply_ <= MAX_SUPPLY`

#### LOW-1: Decimals Validation
- ✅ Added minimum decimals check: `decimals_ >= MIN_DECIMALS`
- ✅ Added constants: `MAX_DECIMALS = 30`, `MIN_DECIMALS = 0`

#### LOW-3: Maximum Supply Cap
- ✅ Added `MAX_SUPPLY` constant and validation

#### Code Quality
- ✅ Added comprehensive NatSpec documentation
- ✅ Added constants for all magic numbers
- ✅ Improved code comments

---

### TokenFactory.sol

#### HIGH-2: Price Feed Manipulation Protection
- ✅ Added price bounds validation:
  - `MIN_NORMALIZED_PRICE = 1e16` (prevents division by extremely small values)
  - `MAX_NORMALIZED_PRICE = 1e25` (prevents overflow)
- ✅ Added price bounds checks in `currentFee()`:
  - `require(normalizedPrice >= MIN_NORMALIZED_PRICE, "Price too low")`
  - `require(normalizedPrice <= MAX_NORMALIZED_PRICE, "Price too high")`
- ✅ Cached `feeUsdWei` in local variable for gas optimization

#### HIGH-3: DoS via Unbounded Array Growth
- ✅ **Removed** `deployedTokens` array completely
- ✅ **Removed** `tokensLength()` function
- ✅ Events provide sufficient indexing for off-chain services
- ✅ **Added** `getNonce()` function to track per-creator nonces
- ✅ **Added** `_nonces` mapping to replace array functionality

#### MED-1: Improved Salt Generation
- ✅ Enhanced `_salt()` function to include:
  - Per-creator nonce (`_nonces[creator]`)
  - `block.prevrandao` (post-merge randomness)
  - `block.number`
- ✅ Prevents front-running by making addresses unpredictable
- ✅ Nonce is incremented after each deployment

#### MED-2: Refund Logic Improvements
- ✅ **Added** `RefundFailed` event:
  - `event RefundFailed(address indexed recipient, uint256 amount, address indexed fallbackRecipient)`
- ✅ Emits event when refund fails and funds are sent to `feeRecipient`
- ✅ Improves transparency for users

#### MED-3: Constructor Validation
- ✅ Added explicit check: `require(msg.sender != address(0), "Owner is zero")`
- ✅ Although Ownable handles this, explicit check improves clarity

#### LOW-2: String Length Validation
- ✅ Added maximum length checks:
  - `MAX_NAME_LENGTH = 100`
  - `MAX_SYMBOL_LENGTH = 20`
- ✅ Validation: `bytes(config.name).length <= MAX_NAME_LENGTH`
- ✅ Validation: `bytes(config.symbol).length <= MAX_SYMBOL_LENGTH`

#### Code Quality Improvements
- ✅ **Added comprehensive NatSpec documentation** for all public/external functions
- ✅ **Added constants** to replace all magic numbers:
  - `MAX_DECIMALS = 30`
  - `MIN_DECIMALS = 0`
  - `MAX_NAME_LENGTH = 100`
  - `MAX_SYMBOL_LENGTH = 20`
  - `PRICE_SCALE = 1e18`
  - `MIN_NORMALIZED_PRICE = 1e16`
  - `MAX_NORMALIZED_PRICE = 1e25`
  - `TARGET_DECIMALS = 18`
- ✅ Standardized all error messages to English
- ✅ Improved code comments and documentation
- ✅ Added `@custom:security` tags for security-related functions

#### Gas Optimizations
- ✅ Cached `feeUsdWei` in `currentFee()` to avoid multiple SLOADs
- ✅ Removed unbounded array (saves ~20k gas per deployment)
- ✅ Optimized refund calculation logic

---

## Breaking Changes

⚠️ **IMPORTANT**: These changes may break existing integrations:

1. **Removed `deployedTokens` array**: Any code relying on this array will need to use events instead
2. **Removed `tokensLength()` function**: Use `getNonce()` or query events instead
3. **Added `getNonce()` function**: New function to track per-creator deployment count

## Migration Guide

### For Frontend/Backend Services:

**Before:**
```solidity
uint256 count = factory.tokensLength();
address token = factory.deployedTokens(index);
```

**After:**
```solidity
// Use events instead
// Listen to TokenCreated events for indexing
// Or use getNonce() to track deployment count per creator
uint256 nonce = factory.getNonce(creatorAddress);
```

### For Testing:

Update tests to:
1. Use events instead of `deployedTokens` array
2. Account for improved salt generation (addresses will differ)
3. Test new validation bounds (string lengths, price bounds)
4. Test `RefundFailed` event emission

---

## Testing Recommendations

1. ✅ Test overflow scenarios with maximum `totalSupply_`
2. ✅ Test with extreme price feed values (near MIN/MAX bounds)
3. ✅ Test refund behavior with contracts that reject funds
4. ✅ Test salt unpredictability (ensure addresses differ per deployment)
5. ✅ Test pause/unpause functionality
6. ✅ Test fee changes during active deployments
7. ✅ Test with zero fee configuration
8. ✅ Test string length validations (0, 1, max, max+1)
9. ✅ Test price bounds (values below MIN, above MAX)

---

## Security

Built on OpenZeppelin Contracts v5; factory source code is verified on Sourcify; no independent audit.

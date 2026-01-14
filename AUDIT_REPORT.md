# Security Audit Report: TokenFactory & BasicERC20

**Auditor:** Security Analysis Team  
**Date:** 2024  
**Contract Version:** 0.8.20  
**Contracts Analyzed:** 
- `TokenFactory.sol`
- `BasicERC20.sol`

---

## Executive Summary

This audit identifies **9 security issues** (3 High, 3 Medium, 3 Low) and **5 optimization recommendations**. The contract demonstrates good security practices including reentrancy protection, access control, and price feed validation. However, several critical issues require immediate attention before production deployment.

---

## Critical & High Severity Issues

### 🔴 [HIGH-1] Integer Overflow Risk in Token Supply Calculation

**Location:** `BasicERC20.sol:26`, `TokenFactory.sol:84`

**Issue:**
```solidity
uint256 scaledSupply = totalSupply_ * (10 ** uint256(decimals_));
```

While Solidity 0.8.20 has built-in overflow protection, this operation can revert on certain inputs, causing DoS. More importantly, there's no validation that `totalSupply_` won't cause an overflow when multiplied by `10 ** decimals`.

**Impact:** 
- DoS for large `totalSupply_` values
- Potential precision loss
- No maximum supply cap

**Recommendation:**
```solidity
require(totalSupply_ <= type(uint256).max / (10 ** uint256(decimals_)), "Supply overflow");
```

**Severity:** High

---

### 🔴 [HIGH-2] Price Feed Manipulation & Stale Price Risk

**Location:** `TokenFactory.sol:112-131`

**Issues:**

1. **Missing price feed pause check:** Chainlink oracles can be paused, but the contract doesn't check for this.

2. **No price bounds validation:** Extreme price values (near zero or extremely high) can cause incorrect fee calculations.

3. **View function with state changes:** `currentFee()` is `view` but can revert, making it unsuitable for off-chain calls.

**Impact:**
- Incorrect fee calculations
- DoS when oracle is paused
- Potential exploitation with manipulated prices

**Recommendation:**
```solidity
// Add price bounds check
require(priceUint >= 1e8, "Price too low"); // Example: minimum $0.01 with 8 decimals
require(priceUint <= 1e15, "Price too high"); // Example: maximum $10M with 8 decimals

// Check for paused feed (if Chainlink provides this)
// Consider making currentFee() a regular function, not view
```

**Severity:** High

---

### 🔴 [HIGH-3] DoS via Unbounded Array Growth

**Location:** `TokenFactory.sol:29, 82`

**Issue:**
```solidity
address[] public deployedTokens;
// ...
deployedTokens.push(token);
```

The `deployedTokens` array grows indefinitely. While reading is not blocked, operations that iterate over this array (like off-chain indexing) will become increasingly expensive.

**Impact:**
- Gas costs for array operations increase linearly
- Potential DoS for off-chain services
- No way to retrieve all deployed tokens efficiently

**Recommendation:**
1. Remove `deployedTokens` array if not critical (events are sufficient)
2. Implement pagination if array is needed
3. Add optional cleanup mechanism

**Severity:** Medium-High (bordering on High due to gas cost implications)

---

## Medium Severity Issues

### 🟡 [MED-1] Predictable Salt Generation

**Location:** `TokenFactory.sol:181-183`

**Issue:**
```solidity
function _salt(address creator, string memory name, string memory symbol) private view returns (bytes32) {
    return keccak256(abi.encode(creator, name, symbol, block.number, block.timestamp));
}
```

The salt includes `block.number` and `block.timestamp`, which are predictable and can be front-run. An attacker could pre-compute token addresses and potentially deploy malicious contracts at those addresses first.

**Impact:**
- Front-running risk
- Predictable token addresses
- Potential address collision attacks

**Recommendation:**
```solidity
function _salt(address creator, string memory name, string memory symbol) private view returns (bytes32) {
    // Add nonce or use CREATE2 with deterministic but harder to predict salt
    return keccak256(abi.encode(creator, name, symbol, block.prevrandao, msg.sender, nonce[creator]));
}
// Or simply remove block.number/timestamp for true deterministic addresses:
return keccak256(abi.encodePacked(creator, name, symbol));
```

**Severity:** Medium

---

### 🟡 [MED-2] Refund Logic Vulnerability

**Location:** `TokenFactory.sol:91-99`

**Issue:**
```solidity
uint256 refund = msg.value - requiredFee;
if (refund > 0) {
    (bool okRefund,) = payable(msg.sender).call{value: refund}("");
    if (!okRefund) {
        (bool okFallback,) = feeRecipient.call{value: refund}("");
        require(okFallback, "Refund and fallback failed");
    }
}
```

**Problems:**
1. If `msg.sender` is a contract without receive/fallback, refund fails but funds go to `feeRecipient` instead of being lost. This is actually good, but the behavior is unexpected.
2. No event emitted when refund is sent to `feeRecipient` instead of original sender.
3. Potential reentrancy via external call (though `nonReentrant` protects against this).

**Impact:**
- Unexpected fund routing
- Lack of transparency in refund failures
- User confusion

**Recommendation:**
```solidity
uint256 refund = msg.value - requiredFee;
if (refund > 0) {
    (bool okRefund,) = payable(msg.sender).call{value: refund}("");
    if (!okRefund) {
        // Emit event for transparency
        emit RefundFailed(msg.sender, refund, feeRecipient);
        (bool okFallback,) = feeRecipient.call{value: refund}("");
        require(okFallback, "Refund and fallback failed");
    }
}
```

**Severity:** Medium

---

### 🟡 [MED-3] Missing Zero-Address Check in Constructor

**Location:** `TokenFactory.sol:45-51`

**Issue:**
The constructor validates `aggregator_` and `feeRecipient_` but doesn't validate that `msg.sender` (owner) is not address(0). While unlikely in practice, this could cause issues if contract is deployed incorrectly.

**Impact:**
- Owner could be set to zero address
- Contract becomes ungovernable
- Cannot pause or update settings

**Recommendation:**
The `Ownable(msg.sender)` already handles this, but add explicit check for clarity:
```solidity
require(msg.sender != address(0), "Owner is zero");
```

**Severity:** Low-Medium (mitigated by OpenZeppelin's Ownable)

---

## Low Severity Issues

### 🟢 [LOW-1] Missing Input Validation for Decimals

**Location:** `TokenFactory.sol:63`, `BasicERC20.sol:21`

**Issue:**
Only checks that `decimals <= 30`, but doesn't validate minimum value. While ERC-20 doesn't require minimum, allowing 0 decimals for tokens is unusual.

**Recommendation:**
```solidity
require(config.decimals >= 0 && config.decimals <= 30, "Decimals out of range");
// Or enforce minimum:
require(config.decimals >= 6 && config.decimals <= 30, "Decimals out of range");
```

**Severity:** Low

---

### 🟢 [LOW-2] Insufficient String Length Validation

**Location:** `TokenFactory.sol:61-62`

**Issue:**
Only checks that strings are non-empty, but doesn't validate maximum length. Extremely long strings could cause issues in events and off-chain processing.

**Current code:**
```solidity
require(bytes(config.name).length > 0, "Name required");
require(bytes(config.symbol).length > 0, "Symbol required");
```

**Recommendation:**
```solidity
require(bytes(config.name).length > 0 && bytes(config.name).length <= 100, "Invalid name length");
require(bytes(config.symbol).length > 0 && bytes(config.symbol).length <= 20, "Invalid symbol length");
```

**Severity:** Low

---

### 🟢 [LOW-3] No Maximum Supply Cap

**Location:** `BasicERC20.sol:25-28`

**Issue:**
No validation for maximum `totalSupply_`. While overflow protection exists, extremely large supplies can cause issues in downstream integrations.

**Recommendation:**
```solidity
uint256 public constant MAX_SUPPLY = type(uint256).max / 1e18; // Reasonable cap
require(totalSupply_ <= MAX_SUPPLY, "Supply exceeds maximum");
```

**Severity:** Low

---

## Gas Optimization Recommendations

### ⚡ [GAS-1] Cache `feeUsdWei` in `currentFee()`

**Location:** `TokenFactory.sol:112-131`

Store `feeUsdWei` in a local variable to avoid multiple SLOADs:

```solidity
uint256 fee = feeUsdWei;
if (fee == 0) {
    return 0;
}
// ... use 'fee' instead of 'feeUsdWei'
```

---

### ⚡ [GAS-2] Use `assembly` for refund calculation

**Location:** `TokenFactory.sol:91-99`

Safe arithmetic is already handled, but consider removing array push if not critical.

---

### ⚡ [GAS-3] Remove `deployedTokens` array if not used

**Location:** `TokenFactory.sol:29, 82`

Events provide sufficient indexing. Removing the array saves ~20k gas per deployment.

---

## Code Quality Issues

### 📝 [QUAL-1] Inconsistent Error Messages

Some errors are in Russian, others in English. Standardize on English.

---

### 📝 [QUAL-2] Missing NatSpec Documentation

Add NatSpec comments for all public/external functions:

```solidity
/**
 * @notice Calculates the current fee in native currency
 * @dev Queries Chainlink price feed and converts USD fee to native tokens
 * @return The fee amount in wei
 * @custom:security Uses non-view function pattern to prevent front-running
 */
```

---

### 📝 [QUAL-3] Magic Numbers

Replace magic numbers with named constants:

```solidity
uint256 private constant MAX_DECIMALS = 30;
uint256 private constant PRICE_SCALE = 1e18;
```

---

## Positive Security Practices ✅

1. ✅ Reentrancy protection via `nonReentrant`
2. ✅ Access control via `Ownable`
3. ✅ Emergency pause mechanism
4. ✅ Price feed staleness checks
5. ✅ Zero address validations
6. ✅ Safe arithmetic (Solidity 0.8.20)
7. ✅ Events for important state changes

---

## Recommendations Summary

### Must Fix Before Production:
1. Add price bounds validation in `currentFee()`
2. Add overflow check in supply calculation
3. Consider removing or paginating `deployedTokens` array
4. Improve salt generation to prevent front-running
5. Add refund failure event

### Should Fix:
1. Improve documentation (NatSpec)
2. Add maximum supply cap
3. Standardize error messages
4. Add string length limits

### Nice to Have:
1. Gas optimizations
2. Remove magic numbers
3. Enhanced price feed pause detection

---

## Conclusion

The contract demonstrates good security fundamentals, but **should not be deployed to mainnet without addressing HIGH-1, HIGH-2, and HIGH-3**. The medium and low severity issues should be addressed in the next iteration.

**Overall Security Rating:** 6.5/10

**Recommended Actions:**
1. Address all High severity issues
2. Implement medium severity fixes
3. Conduct additional testing with edge cases
4. Consider external audit by reputable firm before mainnet deployment

---

## Test Cases to Add

1. Test overflow scenarios with maximum `totalSupply_`
2. Test with extreme price feed values (near zero, very high)
3. Test refund behavior with contracts that reject funds
4. Test salt predictability and front-running scenarios
5. Test pause/unpause functionality
6. Test fee changes during active deployments
7. Test with zero fee configuration

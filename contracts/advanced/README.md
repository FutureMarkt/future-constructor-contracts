# Advanced Tokens

This directory is prepared for the implementation of advanced ERC-20 tokens with extended functionality.

## Planned Features

Based on the product specification (CPO §4.0.1) and the existing AdvancedTokenFactory ABI from the app, the advanced token system will include:

### Core Features

1. **Initial Distribution** (`initialDistribution`)
   - Distribute tokens to multiple recipients on deployment
   - Support up to 10 addresses with custom amounts
   - Validation: sum of distributed amounts must equal total supply

2. **Minting for Administrator** (`mint`)
   - Owner can mint new tokens after deployment
   - Optional supply cap (ERC20Capped), off unless the deployer turns it on

3. **Burning** (`burn`)
   - Present on the current form
   - Not part of this tax change

4. **Pause Mechanism** (`pause`)
   - Owner can pause all token transfers
   - Renounce ownership should be blocked while paused
   - Uses Pausable pattern from OpenZeppelin

5. **Transfer tax** (`transferFee`) — implemented in `AdvancedTaxToken.sol` (OpenZeppelin 5.7.0, `Ownable2Step`).
   - Separate buy and sell rates in basis points.
   - `MAX_TOTAL_FEE_BPS = 1000` is a constant. Buy + sell above 1000 reverts. The ceiling cannot be changed.
   - After deployment, `setFees` can only keep a rate or lower it.
   - Wallet-to-wallet transfers are not taxed.
   - A transfer into a marked AMM pair is a sell. A transfer out of a marked pair to a non-pair is a buy. Pair-to-pair is charged the sell rate once.
   - The token owner marks pairs with `setPool` (event `PoolUpdated`).
   - The current owner and the immutable `factory` address are always excluded. The owner also has an exclusion list (`setExcluded`).
   - `addLiquidity` by the owner is untaxed because the owner is excluded, so the pair receives the full amount.
   - Sell never reverts because of the tax: at most 10% is taken from the amount, and the rest is delivered. There is no blacklist and no pause in this module.
   - The frontend ABI still has one `feeBasisPoints`. The proposed replacement is below. The factory is not in this change.

### Factory Configuration

The AdvancedTokenFactory will:
- Accept configuration via three parameter structs: `TokenConfig`, `FeatureFlags`, `AdvancedConfig`
- Calculate fee based on enabled features using `currentFee(flags)`
- Use same price feed mechanism as base factory
- Emit `AdvancedTokenCreated` event with deployment details

### ABI-Derived Interface

From `future-constructor/src/abi/advancedTokenFactory.ts`:

```solidity
// TokenConfig struct
struct TokenConfig {
    string name;
    string symbol;
    uint8 decimals;
    uint256 initialSupply;
    address initialOwner;
}

// FeatureFlags struct
struct FeatureFlags {
    bool initialDistribution;
    bool mint;
    bool burn;
    bool pause;
    bool transferFee;
}

// AdvancedConfig struct
struct AdvancedConfig {
    address[] distributionRecipients;
    uint256[] distributionAmounts;
    address feeRecipient;
    uint16 feeBasisPoints;
}

// Main function
function deployAdvancedToken(
    TokenConfig calldata config,
    FeatureFlags calldata flags,
    AdvancedConfig calldata advanced
) external payable returns (address token);

// Fee calculation
function currentFee(FeatureFlags calldata flags) external view returns (uint256);

// Event
event AdvancedTokenCreated(
    address indexed creator,
    address indexed token,
    string name,
    string symbol,
    uint8 decimals,
    uint256 totalSupply,
    uint256 feePaid
);
```

## Proposed factory ABI

`future-constructor/src/abi/advancedTokenFactory.ts` still has one `feeBasisPoints` and one `feeRecipient` inside `AdvancedConfig`. That cannot express buy and sell. The factory is not implemented here. Proposed shape for the next factory change:

```solidity
struct TaxConfig {
    address feeRecipient;
    uint16 buyFeeBps;
    uint16 sellFeeBps;
}

struct AdvancedConfig {
    address[] distributionRecipients;
    uint256[] distributionAmounts;
    TaxConfig tax;
}
```

`deployAdvancedToken` would pass `TaxConfig` through to `AdvancedTaxToken`. Pools do not belong in the deploy call: the pair address exists only after the token exists. The owner marks pairs later.

```solidity
function setPool(address pool, bool enabled) external;
function setExcluded(address account, bool excluded) external;
function setFees(uint16 newBuyFeeBps, uint16 newSellFeeBps) external;
function setFeeRecipient(address newRecipient) external;

event PoolUpdated(address indexed pool, bool isPool);
event ExclusionUpdated(address indexed account, bool excluded);
event FeesUpdated(uint16 buyFeeBps, uint16 sellFeeBps);
event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
event TaxCollected(address indexed from, address indexed to, uint256 fee, bool isBuy);
```

`AdvancedTaxToken` constructor `initialSupply` is the raw base-unit amount. The future factory should scale whole tokens by `10 ** decimals`, the same way `BasicERC20` does. The current form sends unscaled `initialSupply` and scaled distribution amounts.

## Decisions already recorded

Owner via CEO on 23.11.2026, and the CPO on this step:

- v1 options are the current form, plus Permit, Votes, and vesting. Cap and Ownable2Step are free options. Cap defaults off. Ownable2Step is in this token.
- Tax rules are the ones implemented above. Legal review is out of scope.
- Permit, Votes, and vesting are in v1 but not in this change. Votes and vesting should be separate modules. Vesting is a `VestingWallet` created by the future factory.
- New contracts use OpenZeppelin 5.7.0 via the `@openzeppelin/contracts-v5.7` alias. `TokenFactory` stays on 5.4.0.
- Service prices follow `CMO/цены-продуктов-по-сетям.md` §2. The form will be aligned later.

## Choices this module made

These points are not in the owner answers of 23.11 or the CPO answers for this step.

1. **Fee recipient can be changed.** `AdvancedERC20` in `future-constructor` (`src/lib/tokenSource/contracts/AdvancedERC20.sol`, branch `dev`) keeps `feeRecipient` immutable. Искал в: that file, `src/abi/advancedTokenFactory.ts`, CEO brief `CEO-agent/брифы/2026-11-23-advanced-tokens-product.md` §6, CPO answers for this step. Не нашёл a rule for changing the recipient after deploy. This token lets the owner call `setFeeRecipient`. The recipient cannot be the zero address or the token itself.
2. **Pair to pair is a sell.** Искал в: the same files and the CPO tax rules. Не нашёл a rule for a transfer from one marked pair to another. This token charges the sell rate once.
3. **`initialSupply` is raw base units.** `BasicERC20` and the downloadable `AdvancedERC20` multiply a whole-token amount by `10 ** decimals`. Искал в: those two contracts and `advancedTokenFactory.ts` (`uint256 initialSupply`, no scaling comment). Не нашёл which unit this standalone token should take. The constructor takes raw units. The future factory should scale whole tokens before it calls the constructor, the same way a caller of `BasicERC20` would pass an already decided amount only if that token did not scale itself. Do not scale twice.
4. **The AMM router is not excluded.** The CEO brief §6.2 recommends excluding the pool and the router. The CPO answer for this step excludes the token factory and the owner, and marks pools. Искал в: brief §6.2 and the CPO tax rules. Не нашёл an instruction to exclude the router. A Uniswap V2 router does not hold the tokens, so a sell still works without that exclusion.

## Known behavior of the existing factory

`TokenFactory.currentFee()` uses integer division. A non-zero `feeUsdWei` becomes 0 native wei when `feeUsdWei * 1e18 < normalizedPrice`. At the highest allowed price this starts below `1e7` wei-USD. The production fee of $3 does not hit it. The pending test in `test/TokenFactory.test.ts` records the current behavior. It is not changed here.

## Implementation status

- Done in this change: `AdvancedTaxToken` and the Uniswap V2 mock tests.
- Not done: factory, distribution, mint/burn, pause, cap, Permit, Votes, vesting, UI.

## Technical requirements

- Existing factory: Solidity `0.8.20`, optimizer 200 runs, `evmVersion: shanghai`, OpenZeppelin **5.4.0**.
- Tax token: OpenZeppelin **5.7.0**, same compiler settings, so the deployed factory bytecode is not rebuilt.
- Factory init code plus the token must stay within 24,576 bytes when the factory is written.

## Security considerations

- Full test coverage is required before any mainnet deployment.
- The CEO brief asks for several rounds of AI review before a UI release. That review is not an independent third-party review.
- No mainnet deployment without an explicit owner approval.

## References

- Product spec: `CPO/план-развития-продукта.md` §4.0.1
- Pricing: `CMO/цены-продуктов-по-сетям.md` §2
- OpenZeppelin upgrade: `Product/OZ-UPGRADE-2026-10.md`
- CEO brief: `CEO-agent/брифы/2026-11-23-advanced-tokens-product.md`
- Existing ABI: `future-constructor/src/abi/advancedTokenFactory.ts`
- Existing UI: `future-constructor/src/app/[locale]/(site)/create/advanced/page.tsx`

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

## Factory ABI for the frontend

The previous frontend file `future-constructor/src/abi/advancedTokenFactory.ts` has one `feeBasisPoints`. This repo now has the factory. Copy these files into the app:

- TypeScript: `contracts/advanced/abi/advancedTokenFactory.ts`
- JSON: `contracts/advanced/abi/advancedTokenFactory.json`

`TokenConfig.initialSupply`, `AdvancedConfig.distributionAmounts` and `AdvancedConfig.cap` are whole tokens. The factory multiplies each by `10 ** decimals` once. The token stores the raw result and does not scale again. Cap `0` means no cap. Pools are not deploy arguments: the owner calls `setPool` after the pair exists.

`FeatureFlags` adds `permit` and `votes` to the old five flags. Vesting is a separate call, `createVestingWallet(beneficiary, startTimestamp, durationSeconds, cliffSeconds)`.

A votes deployment uses `AdvancedTokenVotes`, which also implements permit, because both features share one EIP-712 name. The name must be at most 31 bytes when `permit` or `votes` is set. The permit fee is charged only when the permit flag is set.

## Service fees

Initial amounts come from `CMO/цены-продуктов-по-сетям.md` §2. They are constructor arguments, not a chain-id branch. The owner changes them with `setBaseFee` and `setOptionFee` (events `BaseFeeUpdated` and `OptionFeeUpdated`). Values are USD with 18 decimals.

| Option | ETH | Other networks | Storage |
| --- | ---: | ---: | --- |
| Base deploy | $6 | $3 | `baseFeeUsdWei` |
| Mint | $2 | $1 | `mintFeeUsdWei` |
| Burn | $2 | $1 | `burnFeeUsdWei` |
| Initial distribution | $2 | $1 | `distributionFeeUsdWei` |
| Pause | $2 | $1 | `pauseFeeUsdWei` |
| Transfer tax | $20 | $10 | `transferFeeUsdWei` |
| Cap | $0 | $0 | no fee field |
| Ownable2Step | $0 | $0 | no fee field |
| Permit | not in §2 | not in §2 | `permitFeeUsdWei`, default 0 |
| Votes | not in §2 | not in §2 | `votesFeeUsdWei`, default 0 |
| Vesting | not in §2 | not in §2 | `vestingFeeUsdWei`, default 0 |

`currentFee(flags)` converts the USD sum with the same Chainlink bounds as `TokenFactory`. If the USD sum is positive and the native result rounds to 0, the call reverts with `FeeRoundsToZero`. A zero USD sum stays free and does not read the price.

The CMO row for burn is titled “for the administrator”. The CPO decision for this delivery is holder `burn` and `burnFrom` by allowance. The $2 / $1 row is the price of that holder-burn option.

## Bytecode

EIP-170 limit is 24,576 bytes of deployed code. One factory that embedded every token variant did not leave room, and EIP-1167 clones cannot set the immutable decimals, fees, or the 31-byte EIP-712 name. The factory therefore keeps four deployers and only makes an external call:

| Contract | Deployed bytes | solc / EVM |
| --- | ---: | --- |
| `AdvancedToken` | 5,885 | 0.8.28 / cancun |
| `AdvancedTokenPermit` | 7,677 | 0.8.28 / cancun |
| `AdvancedTokenVotes` | 11,209 | 0.8.28 / cancun |
| `TokenDeployer` | 12,040 | 0.8.28 / cancun |
| `PermitDeployer` | 14,272 | 0.8.28 / cancun |
| `VotesDeployer` | 19,107 | 0.8.28 / cancun |
| `AdvancedVestingWallet` | 2,472 | 0.8.28 / cancun |
| `VestingDeployer` | 4,081 | 0.8.28 / cancun |
| `AdvancedTokenFactory` | 9,579 | 0.8.28 / cancun |
| `TokenFactory` (unchanged) | 9,399 | 0.8.20 / shanghai |

Permit and votes compile for Cancun because OpenZeppelin 5.7 `Bytes.sol` uses `MCOPY`. `TokenFactory` and `AdvancedTaxToken` stay on solc 0.8.20 and Shanghai.

## Decisions already recorded

Owner via CEO on 23.11.2026, and the CPO on the tax step and this step:

- v1 options are distribution, mint, burn, pause, and tax, plus Permit, Votes, and vesting. Cap and Ownable2Step are free. Cap defaults off.
- Tax: separate buy and sell rates, sum at most 1000 bps, rates only decrease, owner-marked pools, owner and factory excluded, wallet transfers untaxed. `setFeeRecipient` stays, with an event, and cannot be zero or the token. Pair-to-pair is one sell fee. The router is not excluded.
- The token `initialSupply` is raw base units. Only the factory scales, and it scales once.
- Votes is the separate `AdvancedTokenVotes` contract. Vesting is `AdvancedVestingWallet` (`VestingWalletCliff`: cliff, then linear).
- New contracts use OpenZeppelin 5.7.0. `TokenFactory` stays on 5.4.0.
- Service prices start from CMO §2 and are owner-configurable.

## Open points

1. **Permit, votes, and vesting prices.** Искал в: `CMO/цены-продуктов-по-сетям.md` §2 and the summary table. Не нашёл a price for Permit, Votes, or vesting. Those three storage fees default to 0. The owner can set them.
2. **Vesting in the same transaction as the token.** Искал в: the CPO request (“created by the factory”) and the deploy ABI, which has no vesting fields. Не нашёл whether the buyer pays for vesting inside `deployAdvancedToken`. Vesting is `createVestingWallet`.
3. **Permit inside the votes variant.** Искал в: the CPO request to keep Votes as a separate module where possible. Не нашёл whether that module must also expose permit. `AdvancedTokenVotes` includes permit because both features need one EIP-712 domain. The permit flag still controls only the permit fee.
4. **`renounceOwnership` while paused.** Искал в: the CPO answers for this delivery and CEO brief §6. The 07.10 draft recommended blocking renounce while paused. Не нашёл an owner decision. Pause does not block renounce.

## Known behavior of the existing factory

`TokenFactory.currentFee()` uses integer division. A non-zero `feeUsdWei` becomes 0 native wei when `feeUsdWei * 1e18 < normalizedPrice`. At the highest allowed price this starts below `1e7` wei-USD. The production fee of $3 does not hit it. The pending test in `test/TokenFactory.test.ts` records the current behavior. It is not changed here. `AdvancedTokenFactory` reverts instead of returning that 0.

## Implementation status

- Done: tax token, advanced token (distribution, mint, cap, holder burn, pause, tax, Ownable2Step), permit variant, votes variant, vesting wallet, factory, deployers, tests.
- Not done: the app UI, testnet deployment, and prices for permit, votes, and vesting.

## Technical requirements

- Existing factory: Solidity `0.8.20`, optimizer 200 runs, `evmVersion: shanghai`, OpenZeppelin **5.4.0**.
- Advanced contracts: Solidity `0.8.28`, optimizer 200 runs, `evmVersion: cancun`, OpenZeppelin **5.7.0**.
- Each deployed contract and each deployer stays within 24,576 bytes. The factory does not embed token creation code.

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

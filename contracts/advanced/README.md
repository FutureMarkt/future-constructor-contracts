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

`FeatureFlags` adds `permit` and `votes` to the old five flags. Vesting is a separate call, `createVestingWallet(beneficiary, startTimestamp, durationSeconds, cliffSeconds, maxFee)`. Both payable entry points take `maxFee` in native wei. If the quoted fee is above `maxFee`, the call reverts with `FeeAboveMax` and nothing is charged. A surplus `msg.value` is still refunded.

The constructor takes `sequencerUptimeFeed`. The zero address disables the L2 sequencer check (L1). A non-zero address must be a contract. A positive fee then reads every `latestRoundData` field. `startedAt == 0`, `updatedAt == 0`, or either timestamp in the future reverts `InvalidSequencerRound`. `answeredInRound < roundId` reverts `StaleRound`. `answer != 0` reverts `SequencerDown`. A recovery within `SEQUENCER_GRACE_PERIOD` (1 hour, `<=`, the Chainlink consumer rule) reverts `SequencerGracePeriod`. `updatedAt` is not capped by `MAX_PRICE_AGE`: this feed updates when the sequencer status changes, and a one-hour age would reject a healthy "up" round. `TokenFactory` is unchanged and does not read a sequencer feed.

`createVestingWallet` treats `startTimestamp == 0` as `block.timestamp`. A start that is already in the past (`0 < start < block.timestamp`) reverts `StartInPast`. After that substitution, `VestingAlreadyFinished` still reverts when `start + duration <= block.timestamp`, so a zero duration that begins now is rejected and a zero duration with a future start stays a timelock. The vesting wallet cannot `renounceOwnership` (`RenounceDisabled`); the beneficiary moves only through Ownable2Step. A deployer cannot renounce before `setFactory` (`RenounceBeforeFactorySet`). Mint and burn are not taxed, including when the other side is a marked pool. `renounceOwnership` on a token or on this factory reverts with `RenounceWhilePaused` while that contract is paused.

A votes deployment uses `AdvancedTokenVotes`, which also implements permit, because both features share one EIP-712 name. The name must be at most 31 bytes when `permit` or `votes` is set. The permit fee is charged only when the permit flag is set.

## Service fees

Initial amounts come from `CMO/цены-продуктов-по-сетям.md` §2, plus the owner decision of 24.11.2026 for Permit, Votes, and vesting (решение владельца 24.11.2026). They are constructor arguments, not a chain-id branch. The owner changes them with `setBaseFee` and `setOptionFee` (events `BaseFeeUpdated` and `OptionFeeUpdated`). Values are USD with 18 decimals.

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
| Permit | $2 | $1 | `permitFeeUsdWei` |
| Votes | $2 | $1 | `votesFeeUsdWei` |
| Vesting (`createVestingWallet`) | $2 | $1 | `vestingFeeUsdWei` |

Permit, Votes, and vesting use the same add-on as mint, burn, distribution, and pause. Решение владельца 24.11.2026. `setOptionFee` still replaces any of those three. Vesting is not part of `currentFee(flags)`: `createVestingWallet` quotes `currentVestingFee()`.

At a $2000 native price the constructor schedule quotes: Ethereum base $6 = 0.003 native, all seven flags $38 = 0.019 native, vesting $2 = 0.001 native. Other networks: base $3 = 0.0015 native, all seven flags $19 = 0.0095 native, vesting $1 = 0.0005 native.

`currentFee(flags)` converts the USD sum with the same Chainlink bounds as `TokenFactory`. If the USD sum is positive and the native result rounds to 0, the call reverts with `FeeRoundsToZero`. A zero USD sum stays free and does not read the price.

The CMO row for burn is titled “for the administrator”. The CPO decision for this delivery is holder `burn` and `burnFrom` by allowance. The $2 / $1 row is the price of that holder-burn option.

## Deployer ownership

The four deployers are `Ownable2Step`, not one-step `Ownable`. `setFactory` stays `onlyOwner` and can run only once.

That is the smaller change, and it closes the reported capture. `transferOwnership` only stores a pending owner. That account cannot call `setFactory` or `deploy` until it accepts, and the current owner can still bind the real factory or cancel the pending transfer with `transferOwnership(address(0))`. A stranger cannot call `setFactory` at all. After a successful `setFactory`, a later owner cannot point the deployer at another factory.

An accepted two-step handover before `setFactory` is an intentional change of owner: the new owner then holds the one binding slot. Bind the factory before starting that handover. Predicting the factory address with CREATE2 and binding inside the factory constructor was the other option. It removes that residual window, and it also forces every deployment script to get the address prediction right. The two-step owner is the variant this repo ships.

The vesting wallet uses the same two-step owner. `release` pays the current owner until the pending owner calls `acceptOwnership`.

## Bytecode

EIP-170 limit is 24,576 bytes of deployed code. One factory that embedded every token variant did not leave room, and EIP-1167 clones cannot set the immutable decimals, fees, or the 31-byte EIP-712 name. The factory therefore keeps four deployers and only makes an external call:

| Contract | Deployed bytes | solc / EVM |
| --- | ---: | --- |
| `AdvancedToken` | 5,976 | 0.8.28 / cancun |
| `AdvancedTokenPermit` | 7,768 | 0.8.28 / cancun |
| `AdvancedTokenVotes` | 11,300 | 0.8.28 / cancun |
| `TokenDeployer` | 12,421 | 0.8.28 / cancun |
| `PermitDeployer` | 14,653 | 0.8.28 / cancun |
| `VotesDeployer` | 19,488 | 0.8.28 / cancun |
| `AdvancedVestingWallet` | 2,723 | 0.8.28 / cancun |
| `VestingDeployer` | 4,618 | 0.8.28 / cancun |
| `AdvancedTokenFactory` | 10,326 | 0.8.28 / cancun |
| `AdvancedTaxToken` | 4,423 | 0.8.20 / shanghai |
| `TokenFactory` (unchanged) | 9,399 | 0.8.20 / shanghai |

Permit and votes compile for Cancun because OpenZeppelin 5.7 `Bytes.sol` uses `MCOPY`. `TokenFactory` and `AdvancedTaxToken` stay on solc 0.8.20 and Shanghai.

## Decisions already recorded

Owner via CEO on 23.11.2026, and the CPO on the tax step and this step:

- v1 options are distribution, mint, burn, pause, and tax, plus Permit, Votes, and vesting. Cap and Ownable2Step are free. Cap defaults off.
- Tax: separate buy and sell rates, sum at most 1000 bps, rates only decrease, owner-marked pools, owner and factory excluded, wallet transfers untaxed. `setFeeRecipient` stays, with an event, and cannot be zero or the token. Pair-to-pair is one sell fee. The router is not excluded.
- The token `initialSupply` is raw base units. Only the factory scales, and it scales once.
- Votes is the separate `AdvancedTokenVotes` contract. Vesting is `AdvancedVestingWallet` (`VestingWalletCliff`: cliff, then linear) with Ownable2Step.
- New contracts use OpenZeppelin 5.7.0. `TokenFactory` stays on 5.4.0.
- Service prices start from CMO §2 and are owner-configurable. Решение владельца 24.11.2026: Permit, Votes, and vesting start at +$2 on Ethereum and +$1 on other networks, the same add-on as mint. `setOptionFee` still changes them.
- AI review #1: renounce is rejected while the token or the factory is paused. Mint and burn are untaxed. Decimals above 30 revert on the tax token too. A finished vesting schedule cannot be created. `maxFee` caps the native fee of a deploy. The new factory can take an L2 sequencer feed. Deployers are Ownable2Step.

## Open points

1. **Vesting in the same transaction as the token.** Искал в: the CPO request (“created by the factory”) and the deploy ABI, which has no vesting fields. Не нашёл whether the buyer pays for vesting inside `deployAdvancedToken`. Vesting is `createVestingWallet`.
2. **Permit inside the votes variant.** Искал в: the CPO request to keep Votes as a separate module where possible. Не нашёл whether that module must also expose permit. `AdvancedTokenVotes` includes permit because both features need one EIP-712 domain. The permit flag still controls only the permit fee.

## Known behaviour

Tax applies only when a transfer touches an address the owner has marked with `setPool`. That is the product model.

- A non-owner who adds liquidity transfers tokens into the marked pair. That transfer is a sell. Removing liquidity transfers tokens out of the pair. That transfer is a buy. The owner and the factory are excluded, so the owner's own seed of the pair is not taxed. The router is not excluded: excluding it would turn the sell tax off.
- A second pair that the owner has not marked is a wallet-to-wallet transfer. It is not taxed. The owner calls `setPool` for every live pair. The contracts do not watch an AMM factory and do not mark pairs by themselves.
- The mock router prices a sell from the tokens the pair actually received. `UniswapV2Router02.swapExactTokensForTokens` prices the quoted `amountIn` and then reverts `K` on a taxed sell. The token still delivers `value - fee` and does not revert. An integrator uses a supporting-fee route.
- The factory has no `receive` and no ERC-20 rescue. A direct native transfer reverts. An ERC-20 sent to the factory stays there. A rescue function is not part of this version.

## Known behavior of the existing factory

`TokenFactory.currentFee()` uses integer division. A non-zero `feeUsdWei` becomes 0 native wei when `feeUsdWei * 1e18 < normalizedPrice`. At the highest allowed price this starts below `1e7` wei-USD. The production fee of $3 does not hit it. The pending test in `test/TokenFactory.test.ts` records the current behavior. It is not changed here. `AdvancedTokenFactory` reverts instead of returning that 0.

## Implementation status

- Done: tax token, advanced token (distribution, mint, cap, holder burn, pause, tax, Ownable2Step), permit variant, votes variant, vesting wallet, factory, deployers, tests.
- Not done: the app UI and testnet deployment. Permit, Votes, and vesting now have starting prices (решение владельца 24.11.2026).

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

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
   - Should include optional supply cap (ERC20Capped)
   - Cap enabled by default in UI

3. **Burning for Token Holders** (`burn`)
   - Token holders can burn their own tokens (ERC20Burnable)
   - NOT owner-burn from arbitrary addresses (anti-scam measure)

4. **Pause Mechanism** (`pause`)
   - Owner can pause all token transfers
   - Renounce ownership should be blocked while paused
   - Uses Pausable pattern from OpenZeppelin

5. **Transfer Fee** (`transferFee`)
   - Optional fee on transfers. The frontend ABI has a single `feeBasisPoints` (`uint16`) and one `feeRecipient`.
   - The create form currently allows 1–1000 bps (0.01%–10%) on every transfer, with no exemption list.
   - **Owner decision for the next implementation step (tax module), 24.11.2026:**
     - the tax ceiling is hardcoded in the contract;
     - buy tax + sell tax together are at most 10%;
     - the pool and the factory are exempt.
   - That decision is not representable by the current ABI (no separate buy/sell rates, no exemption list). The ABI and the `/create/advanced` form have to change together with the contract.
   - Still a high-risk feature for DEX pools and scanner flags. Legal review is not recorded in the repos.

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

## Open Questions for Owner

**Искал в:** CPO/план-развития-продукта.md, CMO/цены-продуктов-по-сетям.md, Product/OZ-UPGRADE-2026-10.md, Product/ROADMAP.md, Product/BACKLOG.md, memory/facts.md, future-constructor (dev), future-constructor-contracts (main), CEO brief

**Не нашёл:**

1. **Состав v1**: Делать текущие опции UI (распределение, admin mint, admin burn с любого адреса, пауза, комиссия на перевод) или рекомендованный набор из плана (mint + cap, burn холдером, пауза с защитой, Ownable2Step, без tax)?

2. **Transfer fee (tax).** Часть решения уже есть (см. выше): потолок в коде, buy+sell ≤ 10% суммарно, исключения для пула и фабрики. Искал в: CPO §4.0.1, CMO §2, ABI `advancedTokenFactory.ts`, страница `/create/advanced`, бриф CEO. Не нашёл: отдельные поля buy/sell и список исключений в ABI; кто задаёт адреса пула и фабрики (деплоер, владелец токена, константа); можно ли ставку только понижать после деплоя; нужна ли юридическая проверка до включения опции.

3. **Permit, Votes, vesting**: Включать в эту версию или позже?

4. **Версия OpenZeppelin для новых контрактов.** Текущая фабрика зафиксирована на **5.4.0** (это версия прод-байткода и точный пин из Product/OZ-UPGRADE-2026-10.md; 5.7.0 меняет слот ReentrancyGuard и разойдётся с уже верифицированным байткодом). Для расширенной фабрики документ рекомендует 5.7.x и явный `evmVersion: cancun`. Искал в: Product/OZ-UPGRADE-2026-10.md. Не нашёл отдельного «да» владельца на 5.7.0 против 5.6.x.

5. **Cap для minting**: Является ли cap обязательным или опциональным? По умолчанию включён или выключен?

6. **Ownable2Step**: Включать ли в базовую реализацию?

7. **Pricing**: Цены опций по CMO §2 финальны или требуют пересмотра?
   - Base: $6 (Ethereum) / $3 (другие сети)
   - Опции: $1-2 каждая, кроме transferFee ($10-20)

## Implementation Status

**Current Status**: PREPARED (not yet implemented)

This directory contains only the README with requirements. Actual implementation will begin after:
1. Owner answers open questions above
2. Final requirements are confirmed
3. Contract specifications are approved

## Technical Requirements

- Existing factory: Solidity `0.8.20`, optimizer 200 runs, `evmVersion: shanghai` (explicit, same as the solc 0.8.20 default), OpenZeppelin **5.4.0** pinned.
- Advanced factory, when implemented: OpenZeppelin **5.7.x** and an explicit `evmVersion` (document recommends `cancun`) in a separate compiler profile, so the already deployed factory bytecode is not rebuilt.
- Factory init code plus the token must stay within 24,576 bytes.

## Security Considerations

- Full test coverage is required before any mainnet deployment.
- The CEO brief asks for several rounds of AI review before a UI release. That review is not an independent third-party review.
- No mainnet deployment without an explicit owner approval.
- The transfer-fee feature needs the hardcoded ceiling, pool and factory exemptions, and a legal check that is not in the repos yet.

## References

- Product spec: `CPO/план-развития-продукта.md` §4.0.1
- Pricing: `CMO/цены-продуктов-по-сетям.md` §2
- OpenZeppelin upgrade: `Product/OZ-UPGRADE-2026-10.md`
- CEO brief: `CEO-agent/брифы/2026-11-23-advanced-tokens-product.md`
- Existing ABI: `future-constructor/src/abi/advancedTokenFactory.ts`
- Existing UI: `future-constructor/src/app/[locale]/(site)/create/advanced/page.tsx`

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
   - Optional fee on each transfer (0-1000 basis points = 0-10%)
   - Fee recipient address
   - **High risk feature** - requires careful implementation
   - Considerations: DEX compatibility, honeypot scanners, legal review

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

2. **Transfer fee (tax)**: Включать ли в v1? Если да, нужны:
   - Исключения для пула и роутера
   - Жёсткий потолок и только понижение ставки
   - Юридическая консультация

3. **Permit, Votes, vesting**: Включать в эту версию или позже?

4. **Версия OpenZeppelin**: Использовать 5.7.x (рекомендация из OZ-UPGRADE) или 5.6.x (последняя с записью аудита)?

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

- Solidity version: `0.8.20` (or as specified in final requirements)
- OpenZeppelin version: `5.1.0` (may be updated to 5.7.x per requirements)
- evmVersion: `shanghai` (explicit in hardhat config)
- Optimizer: enabled, 200 runs
- Gas limit: consider factory + token init code must fit in 24,576 bytes

## Security Considerations

- Full test coverage required before mainnet deployment
- Multiple rounds of AI audit required (per CEO brief)
- No mainnet deployment without owner approval
- Never use word "audited" without independent professional audit
- Transfer fee feature requires extra scrutiny and legal review

## References

- Product spec: `CPO/план-развития-продукта.md` §4.0.1
- Pricing: `CMO/цены-продуктов-по-сетям.md` §2
- OpenZeppelin upgrade: `Product/OZ-UPGRADE-2026-10.md`
- CEO brief: `CEO-agent/брифы/2026-11-23-advanced-tokens-product.md`
- Existing ABI: `future-constructor/src/abi/advancedTokenFactory.ts`
- Existing UI: `future-constructor/src/app/[locale]/(site)/create/advanced/page.tsx`

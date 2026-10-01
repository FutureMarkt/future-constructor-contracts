# Future Constructor

A no-code ERC-20 token creator built on **BNB Smart Chain** and other EVM-compatible networks. Create custom ERC-20 tokens instantly with configurable parameters, powered by Chainlink price feeds for accurate USD-based fees.

**Website:** https://constructor.futuremarkt.com  
**Operator:** Future Markt

---

## Overview

Future Constructor is a smart contract factory that allows anyone to deploy standard ERC-20 tokens without writing code. Users pay a fixed USD-denominated fee (converted to native currency via Chainlink oracles) and receive a fully functional ERC-20 token with customizable name, symbol, decimals, and initial supply.

### Key Features

- ✅ No-code ERC-20 token deployment
- ✅ Multi-chain support: BNB Smart Chain, Ethereum, Polygon, Arbitrum One, Base
- ✅ USD-based fees converted to native tokens via Chainlink price feeds
- ✅ Configurable token parameters (name, symbol, decimals, supply)
- ✅ Pausable factory with owner controls
- ✅ Comprehensive input validation and overflow protection

---

## Technology Stack

- **Blockchain**: BNB Smart Chain (primary) + EVM-compatible chains
- **Smart Contracts**: Solidity 0.8.20
- **Compiler Settings**: 
  - Optimizer enabled: 200 runs
  - EVM Version: Shanghai
  - Libraries: OpenZeppelin Contracts 5.4.0 (imported via 5.1.0 with compatible components)
- **Development**: Hardhat 3.x, TypeScript
- **Price Feeds**: Chainlink Aggregators

---

## Supported Networks

| Network | Chain ID | Status |
|---------|----------|--------|
| **BNB Smart Chain** | 56 | ✅ Active |
| **Ethereum Mainnet** | 1 | ✅ Active |
| **Polygon Mainnet** | 137 | ✅ Active |
| **Arbitrum One** | 42161 | ✅ Active |
| **Base** | 8453 | ✅ Active |
| BNB Smart Chain Testnet | 97 | 🔧 For testing |
| Arbitrum Sepolia Testnet | 421614 | 🔧 For testing |

---

## Deployed Contracts

### Current factory `0x7820C4E3C28caeaa8c729F96cF43471Ef117b852`

Deployed on BNB Smart Chain, Arbitrum One, and Base. There is no contract at this address on Ethereum or Polygon.

Source code is an exact match on Sourcify for each deployment below. BaseScan does not show this contract as verified.

| Network | Deployed (UTC) | Explorer | Sourcify |
|---------|----------------|----------|----------|
| BNB Smart Chain | 21 January 2026 | [0x7820...b852](https://bscscan.com/address/0x7820C4E3C28caeaa8c729F96cF43471Ef117b852) | [Exact match](https://repo.sourcify.dev/56/0x7820C4E3C28caeaa8c729F96cF43471Ef117b852) |
| Arbitrum One | 27 September 2026 | [0x7820...b852](https://arbiscan.io/address/0x7820C4E3C28caeaa8c729F96cF43471Ef117b852) | [Exact match](https://repo.sourcify.dev/42161/0x7820C4E3C28caeaa8c729F96cF43471Ef117b852) |
| Base | 27 September 2026 | [0x7820...b852](https://basescan.org/address/0x7820C4E3C28caeaa8c729F96cF43471Ef117b852) | [Exact match](https://repo.sourcify.dev/8453/0x7820C4E3C28caeaa8c729F96cF43471Ef117b852) |

### Legacy factory `0x3171C50E87F67b921FCB9261E1D9fD598b03dA04`

This is the legacy TokenFactory. It is still the factory on Ethereum and Polygon. On BNB Smart Chain, Arbitrum One, and Base it was replaced by `0x7820C4E3C28caeaa8c729F96cF43471Ef117b852`. On Base it was the factory in use from January 2026 through September 2026.

Source code is an exact match on Sourcify for every deployment below. Polygonscan shows an exact source match. Etherscan does not show this contract as verified.

| Network | Deployed (UTC) | Explorer | Sourcify |
|---------|----------------|----------|----------|
| BNB Smart Chain | 21 January 2026 | [0x3171...dA04](https://bscscan.com/address/0x3171C50E87F67b921FCB9261E1D9fD598b03dA04) | [Exact match](https://repo.sourcify.dev/56/0x3171C50E87F67b921FCB9261E1D9fD598b03dA04) |
| Ethereum | 22 January 2026 | [0x3171...dA04](https://etherscan.io/address/0x3171C50E87F67b921FCB9261E1D9fD598b03dA04) | [Exact match](https://repo.sourcify.dev/1/0x3171C50E87F67b921FCB9261E1D9fD598b03dA04) |
| Polygon | 22 January 2026 | [0x3171...dA04 on Polygonscan (exact match)](https://polygonscan.com/address/0x3171C50E87F67b921FCB9261E1D9fD598b03dA04) | [Exact match](https://repo.sourcify.dev/137/0x3171C50E87F67b921FCB9261E1D9fD598b03dA04) |
| Arbitrum One | 22 January 2026 | [0x3171...dA04](https://arbiscan.io/address/0x3171C50E87F67b921FCB9261E1D9fD598b03dA04) | [Exact match](https://repo.sourcify.dev/42161/0x3171C50E87F67b921FCB9261E1D9fD598b03dA04) |
| Base | 22 January 2026 | [0x3171...dA04](https://basescan.org/address/0x3171C50E87F67b921FCB9261E1D9fD598b03dA04) | [Exact match](https://repo.sourcify.dev/8453/0x3171C50E87F67b921FCB9261E1D9fD598b03dA04) |

### Fee Configuration

- **Fee Amount:** $3 per token, $6 on Ethereum
- **Fee Recipient:** `0x7f0C375dc32653CA5d778835ed5dC5D34d7C97cc`
- **Price Conversion:** Chainlink price feeds convert USD to native currency in real-time

---

## Installation

### Prerequisites

- Node.js 16+ and npm
- Git

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd future-constructor-contracts

# Install dependencies
npm install
```

---

## Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Private Keys (without 0x prefix)
ETHEREUM_PRIVATE_KEY=your_ethereum_private_key_here
POLYGON_PRIVATE_KEY=your_polygon_private_key_here
BSC_PRIVATE_KEY=your_bsc_private_key_here
ARBITRUM_PRIVATE_KEY=your_arbitrum_private_key_here
BASE_PRIVATE_KEY=your_base_private_key_here

# RPC URLs (optional - defaults are used if not set)
ETHEREUM_RPC_URL=https://eth.llamarpc.com
POLYGON_RPC_URL=https://polygon-rpc.com
BSC_RPC_URL=https://bsc-dataseed1.binance.org
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
BASE_RPC_URL=https://mainnet.base.org

# Chainlink Aggregator Addresses
CHAINLINK_AGGREGATOR_ETHEREUM=0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
CHAINLINK_AGGREGATOR_POLYGON=0xAB594600376Ec9fD91F8e885dADF0CE036862dE0
CHAINLINK_AGGREGATOR_BSC=0x0567F2323251f0aab15c8Df3f986C17B5b4CF09b
CHAINLINK_AGGREGATOR_ARBITRUM=0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612
CHAINLINK_AGGREGATOR_BASE=0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70

# Fee Configuration
FEE_RECIPIENT=0x7f0C375dc32653CA5d778835ed5dC5D34d7C97cc
FEE_USD_WEI=3000000000000000000  # $3 USD (18 decimals)

# Block Explorer API Keys (for contract verification)
ETHERSCAN_API_KEY=your_etherscan_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key
BSCSCAN_API_KEY=your_bscscan_api_key
ARBISCAN_API_KEY=your_arbiscan_api_key
BASESCAN_API_KEY=your_basescan_api_key
```

See `env.template` for a complete example.

---

## Build & Test

### Compile Contracts

```bash
npm run compile
# or
npx hardhat compile
```

### Run Tests

```bash
npm test
# or
npx hardhat test
```

---

## Deployment

The project includes deployment scripts for all supported networks:

### Deploy to BNB Smart Chain

```bash
npm run deploy:bsc
# or
npx hardhat run scripts/deploy-bsc.ts --network bsc
```

### Deploy to Ethereum

```bash
npm run deploy:ethereum
# or
npx hardhat run scripts/deploy-ethereum.ts --network ethereum
```

### Deploy to Polygon

```bash
npm run deploy:polygon
# or
npx hardhat run scripts/deploy-polygon.ts --network polygon
```

### Deploy to Arbitrum One

```bash
npm run deploy:arbitrum
# or
npx hardhat run scripts/deploy-arbitrum.ts --network arbitrum
```

### Deploy to Base

```bash
npm run deploy:base
# or
npx hardhat run scripts/deploy-base.ts --network base
```

**Requirements:**
1. Valid private key in `.env` for target network
2. Chainlink aggregator address for target network
3. Native currency for gas fees on target network
4. Optional: Block explorer API key for automatic verification

---

## Security

Built on OpenZeppelin Contracts v5; factory source code is verified on Sourcify; no independent audit.

- **Internal Review:** See [docs/INTERNAL_REVIEW.md](./docs/INTERNAL_REVIEW.md) for findings and status
- **Use at Your Own Risk:** Deploy and use these contracts at your own discretion
- **Report Issues:** If you discover security vulnerabilities, please report them to futuremarktgroup@gmail.com

### Security Best Practices Implemented

- ✅ Reentrancy protection (`ReentrancyGuard`)
- ✅ Access control (`Ownable`)
- ✅ Pausable functionality for emergency stops
- ✅ Comprehensive input validation
- ✅ Safe arithmetic (Solidity 0.8.20 built-in)
- ✅ Price feed staleness checks
- ✅ Overflow protection in token supply calculations

---

## Documentation

- **[docs/INTERNAL_REVIEW.md](./docs/INTERNAL_REVIEW.md)** - Internal code review. Built on OpenZeppelin Contracts v5; factory source code is verified on Sourcify; no independent audit.
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history and security fixes
- **[SETUP_ENV.md](./SETUP_ENV.md)** - Environment setup guide
- **[ARBITRUM_DEPLOY.md](./ARBITRUM_DEPLOY.md)** - Arbitrum deployment guide

---

## Links

- **Website:** https://constructor.futuremarkt.com
- **Lite Paper:** https://constructor.futuremarkt.com/en/lite-paper
- **Terms of Service:** https://constructor.futuremarkt.com/en/terms
- **Privacy Policy:** https://constructor.futuremarkt.com/en/privacy
- **X:** https://x.com/fm_constructor
- **Telegram:** https://t.me/fm_constructor
- **Bluesky:** https://bsky.app/profile/fm-constructor.bsky.social
- **Farcaster:** https://farcaster.xyz/fm-constructor
- **YouTube:** https://www.youtube.com/@fm_constructor
- **Contact:** futuremarktgroup@gmail.com

---

## License

MIT

---

## Disclaimer

Future Constructor is provided "as is" without warranties of any kind. Built on OpenZeppelin Contracts v5; factory source code is verified on Sourcify; no independent audit. Users deploy and interact with these contracts at their own risk. Always conduct your own security assessment before deploying to production.

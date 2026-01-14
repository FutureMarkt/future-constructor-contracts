# Future Constructor Contracts

Smart contracts for the Future Constructor Token Factory project. This project uses Hardhat 3 Beta for development, testing, and deployment.

## Contracts

- **TokenFactory.sol** - Factory contract for deploying ERC-20 tokens with configurable USD fees
- **BasicERC20.sol** - Minimal ERC-20 token implementation with configurable decimals
- **AggregatorV3Interface.sol** - Chainlink price feed interface

## Features

- ✅ Deploy minimal ERC-20 tokens with custom parameters
- ✅ Configurable USD fees converted to native tokens via Chainlink
- ✅ Security audited (see [AUDIT_REPORT.md](./AUDIT_REPORT.md))
- ✅ Support for Polygon and BNB Smart Chain
- ✅ Pausable and upgradeable fee configuration
- ✅ Comprehensive input validation and overflow protection

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Private Keys (without 0x prefix)
POLYGON_PRIVATE_KEY=your_polygon_private_key_here
BSC_PRIVATE_KEY=your_bsc_private_key_here
ARBITRUM_PRIVATE_KEY=your_arbitrum_private_key_here

# RPC URLs (optional - defaults are used if not set)
POLYGON_RPC_URL=https://polygon-rpc.com
BSC_RPC_URL=https://bsc-dataseed1.binance.org
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc

# Chainlink Aggregator Addresses
CHAINLINK_AGGREGATOR_POLYGON=0xf9680D99D6D8bF626D6681C5B7DfF154dDbfF56d
CHAINLINK_AGGREGATOR_BSC=0x0567F2323251f0aab15c8Df3f986C17B5b4CF09b
CHAINLINK_AGGREGATOR_ARBITRUM=0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612

# Fee Configuration
FEE_RECIPIENT=0x0000000000000000000000000000000000000000
FEE_USD_WEI=0

# Block Explorer API Keys (for contract verification)
POLYGONSCAN_API_KEY=your_polygonscan_api_key
BSCSCAN_API_KEY=your_bscscan_api_key
ARBISCAN_API_KEY=your_arbiscan_api_key
```

## Compilation

```bash
npm run compile
# or
npx hardhat compile
```

## Testing

```bash
npm test
# or
npx hardhat test
```

Run specific test types:

```bash
npx hardhat test solidity
npx hardhat test mocha
```

## Deployment

### Deploy to Polygon

```bash
npm run deploy:polygon
# or
npx hardhat run scripts/deploy-polygon.ts --network polygon
```

### Deploy to BNB Smart Chain

```bash
npm run deploy:bsc
# or
npx hardhat run scripts/deploy-bsc.ts --network bsc
```

### Deploy to Arbitrum One

```bash
npm run deploy:arbitrum
# or
npx hardhat run scripts/deploy-arbitrum.ts --network arbitrum
```

**⚠️ Important for Arbitrum deployment:**

1. **Minimum required `.env` variables for Arbitrum:**
   ```env
   ARBITRUM_PRIVATE_KEY=your_private_key_without_0x_prefix
   CHAINLINK_AGGREGATOR_ARBITRUM=0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612
   ```

2. **Optional but recommended:**
   - `ARBITRUM_RPC_URL` - Custom RPC endpoint (defaults to public Arbitrum RPC)
   - `FEE_RECIPIENT` - Address to receive fees (defaults to deployer address)
   - `FEE_USD_WEI` - Initial fee in USD (18 decimals, default: 0 = free)
   - `ARBISCAN_API_KEY` - For contract verification after deployment

3. **Ensure you have ETH on Arbitrum One** - You need ETH for gas fees (not ETH on mainnet!)

4. **Recommended RPC providers for Arbitrum:**
   - Public: `https://arb1.arbitrum.io/rpc` (free, default)
   - Alchemy: `https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY` (more reliable)
   - Infura: `https://arbitrum-mainnet.infura.io/v3/YOUR_API_KEY` (more reliable)

## Scripts

- `npm run compile` - Compile contracts
- `npm test` - Run all tests
- `npm run deploy:polygon` - Deploy to Polygon network
- `npm run deploy:bsc` - Deploy to BNB Smart Chain
- `npm run deploy:arbitrum` - Deploy to Arbitrum One network

## Documentation

- [AUDIT_REPORT.md](./AUDIT_REPORT.md) - Security audit report
- [CHANGELOG.md](./CHANGELOG.md) - Changelog with all security fixes

## Security

All contracts have been audited and all identified issues have been fixed. See [AUDIT_REPORT.md](./AUDIT_REPORT.md) for details.

**Security Rating:** 9.0/10

## Networks Supported

- Polygon Mainnet (Chain ID: 137)
- Polygon Mumbai Testnet (Chain ID: 80001)
- BNB Smart Chain (Chain ID: 56)
- Arbitrum One (Chain ID: 42161)
- Arbitrum Sepolia Testnet (Chain ID: 421614)

## License

MIT

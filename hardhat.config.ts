import { configVariable, defineConfig } from "hardhat/config";
import * as dotenv from "dotenv";
import "@nomicfoundation/hardhat-ethers";
// import "@nomicfoundation/hardhat-verify"; // Temporarily disabled due to compatibility issues

// Load environment variables
dotenv.config();

export default defineConfig({
  solidity: {
    profiles: {
      default: {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      production: {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    ethereum: {
      type: "http",
      chainType: "l1",
      // Public RPC endpoints for Ethereum Mainnet:
      // - https://eth.llamarpc.com (LlamaNodes, no API key)
      // - https://1rpc.io/eth (1RPC, no API key)
      // For better reliability, use Alchemy or Infura (requires API key):
      // - https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY (Alchemy)
      // - https://mainnet.infura.io/v3/YOUR_API_KEY (Infura)
      url: process.env.ETHEREUM_RPC_URL || process.env.NEXT_PUBLIC_RPC_ETHEREUM || "https://eth.llamarpc.com",
      accounts: process.env.ETHEREUM_PRIVATE_KEY ? [process.env.ETHEREUM_PRIVATE_KEY] : [],
      chainId: 1,
      timeout: 120000,
    },
    polygon: {
      type: "http",
      chainType: "l1",
      url: process.env.POLYGON_RPC_URL || process.env.NEXT_PUBLIC_RPC_POLYGON || "https://polygon-rpc.com",
      accounts: process.env.POLYGON_PRIVATE_KEY ? [process.env.POLYGON_PRIVATE_KEY] : [],
      chainId: 137,
    },
    polygonMumbai: {
      type: "http",
      chainType: "l1",
      url: process.env.MUMBAI_RPC_URL || "https://rpc.ankr.com/polygon_mumbai",
      accounts: process.env.POLYGON_PRIVATE_KEY ? [process.env.POLYGON_PRIVATE_KEY] : [],
      chainId: 80001,
    },
    bsc: {
      type: "http",
      chainType: "l1",
      // Public RPC endpoints for BSC (no API key required):
      // - https://bsc-dataseed1.binance.org (Binance, default)
      // - https://bsc-dataseed2.binance.org (Binance alternative)
      // - https://1rpc.io/bnb (1RPC)
      url: process.env.BSC_RPC_URL || process.env.NEXT_PUBLIC_RPC_BSC || "https://bsc-dataseed1.binance.org",
      accounts: process.env.BSC_PRIVATE_KEY ? [process.env.BSC_PRIVATE_KEY] : [],
      chainId: 56,
      timeout: 120000,
      gasPrice: 5000000000, // 5 gwei
      gas: 8000000, // Gas limit for deployment
    },
    arbitrum: {
      type: "http",
      chainType: "l1",
      // Public RPC endpoints for Arbitrum One:
      // - https://arb1.arbitrum.io/rpc (Arbitrum, default)
      // - https://1rpc.io/arb (1RPC, no API key)
      // - https://arbitrum-one.public.blastapi.io (BlastAPI, no API key)
      // For better reliability, use Alchemy or Infura (requires API key):
      // - https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY (Alchemy)
      // - https://arbitrum-mainnet.infura.io/v3/YOUR_API_KEY (Infura)
      url: process.env.ARBITRUM_RPC_URL || process.env.NEXT_PUBLIC_RPC_ARBITRUM || "https://arb1.arbitrum.io/rpc",
      accounts: process.env.ARBITRUM_PRIVATE_KEY ? [process.env.ARBITRUM_PRIVATE_KEY] : [],
      chainId: 42161,
      timeout: 120000,
    },
    arbitrumSepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: process.env.ARBITRUM_PRIVATE_KEY ? [process.env.ARBITRUM_PRIVATE_KEY] : [],
      chainId: 421614,
      timeout: 120000,
    },
    base: {
      type: "http",
      chainType: "l1",
      // Public RPC endpoints for Base Mainnet:
      // - https://mainnet.base.org (Base, default)
      // - https://1rpc.io/base (1RPC, no API key)
      // For better reliability, use Alchemy or Infura (requires API key):
      // - https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY (Alchemy)
      // - https://base-mainnet.infura.io/v3/YOUR_API_KEY (Infura)
      url: process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_RPC_BASE || "https://mainnet.base.org",
      accounts: process.env.BASE_PRIVATE_KEY ? [process.env.BASE_PRIVATE_KEY] : [],
      chainId: 8453,
      timeout: 120000,
    },
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      polygon: process.env.POLYGONSCAN_API_KEY || "",
      polygonMumbai: process.env.POLYGONSCAN_API_KEY || "",
      bsc: process.env.BSCSCAN_API_KEY || "",
      arbitrum: process.env.ARBISCAN_API_KEY || "",
      arbitrumOne: process.env.ARBISCAN_API_KEY || "",
      arbitrumSepolia: process.env.ARBISCAN_API_KEY || "",
      base: process.env.BASESCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "arbitrum",
        chainId: 42161,
        urls: {
          apiURL: "https://api.arbiscan.io/api",
          browserURL: "https://arbiscan.io",
        },
      },
      {
        network: "arbitrumOne",
        chainId: 42161,
        urls: {
          apiURL: "https://api.arbiscan.io/api",
          browserURL: "https://arbiscan.io",
        },
      },
      {
        network: "arbitrumSepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api-sepolia.arbiscan.io/api",
          browserURL: "https://sepolia.arbiscan.io",
        },
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
});

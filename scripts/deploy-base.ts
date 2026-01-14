import hre from "hardhat";
import * as dotenv from "dotenv";
import { ethers as ethersLib } from "ethers";

// Load environment variables
dotenv.config();

async function main() {
  console.log("Starting deployment of TokenFactory to Base Mainnet...\n");
  
  // Connect to network (Hardhat v3 way)
  await hre.network.connect();
  
  // Get provider from network connection
  const rpcUrl = process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_RPC_BASE || "https://mainnet.base.org";
  
  console.log(`Connecting to RPC: ${rpcUrl.replace(/\/v[0-9]+\/[^\/]+$/, '/***')}\n`);
  
  const provider = new ethersLib.JsonRpcProvider(rpcUrl, {
    name: "base",
    chainId: 8453,
  });
  
  // Test connection with timeout
  try {
    await Promise.race([
      provider.getBlockNumber(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("RPC timeout")), 10000))
    ]);
  } catch (error) {
    throw new Error(`Failed to connect to RPC endpoint: ${error}. Please check BASE_RPC_URL in .env or use a reliable endpoint (Alchemy or Infura).`);
  }
  
  // Get deployer from private key
  const privateKey = process.env.BASE_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("BASE_PRIVATE_KEY is not set in .env");
  }
  const deployer = new ethersLib.Wallet(privateKey, provider);
  
  // Create ethers-like object for compatibility
  const ethers = {
    provider,
    getSigners: () => Promise.resolve([deployer]),
    getContractFactory: async (name: string) => {
      const artifact = await hre.artifacts.readArtifact(name);
      return new ethersLib.ContractFactory(artifact.abi, artifact.bytecode, deployer);
    },
    formatEther: ethersLib.formatEther,
    getAddress: ethersLib.getAddress,
  };
  
  const networkInfo = await provider.getNetwork();
  console.log(`Connected to network: ${networkInfo.name} (Chain ID: ${networkInfo.chainId})\n`);

  // Get deployment parameters from environment variables
  // Default Chainlink ETH/USD aggregator for Base Mainnet
  const aggregatorAddressRaw = (process.env.CHAINLINK_AGGREGATOR_BASE || "0x71041dddad3595F9CeD3DcCFBe3D1F4b0a16Bb70").replace(/^["']|["']$/g, "");
  const feeUsdWei = (process.env.FEE_USD_WEI || "0").replace(/^["']|["']$/g, "");

  // Use deployer address as feeRecipient if not specified
  const feeRecipientRaw = process.env.FEE_RECIPIENT || "";
  const feeRecipient = feeRecipientRaw ? feeRecipientRaw.replace(/^["']|["']$/g, "") : deployer.address;

  // Validate address formats
  if (!/^0x[a-fA-F0-9]{40}$/.test(aggregatorAddressRaw)) {
    throw new Error(`Invalid aggregator address format: ${aggregatorAddressRaw}`);
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(feeRecipient)) {
    throw new Error(`Invalid fee recipient address format: ${feeRecipient}`);
  }

  // Normalize addresses (convert to proper checksum)
  const normalizedAggregatorAddress = ethers.getAddress(aggregatorAddressRaw.toLowerCase());
  const normalizedFeeRecipient = ethers.getAddress(feeRecipient.toLowerCase());

  // Parse fee (in wei, 18 decimals)
  // Example: "0" = free, "2000000000000000000" = 2 USD (2 * 10^18)
  const feeUsdWeiBigInt = BigInt(feeUsdWei);

  console.log("Deployment parameters:");
  console.log(`  Chainlink Aggregator: ${normalizedAggregatorAddress} (ETH/USD)`);
  console.log(`  Fee Recipient: ${normalizedFeeRecipient}`);
  console.log(`  Fee USD (wei): ${feeUsdWeiBigInt.toString()} (${ethers.formatEther(feeUsdWeiBigInt)} USD)`);

  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    throw new Error("Insufficient balance. Please fund your account with ETH on Base Mainnet.");
  }

  // Deploy TokenFactory
  console.log("Deploying TokenFactory...");
  const TokenFactory = await ethers.getContractFactory("TokenFactory");
  console.log("Contract factory created");

  // Get current gas price
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || (await provider.getFeeData()).gasPrice || undefined;
  console.log(`Current gas price: ${gasPrice ? ethersLib.formatUnits(gasPrice, "gwei") : "unknown"} gwei`);

  console.log("Sending deployment transaction...");
  const tokenFactory = await TokenFactory.deploy(
    normalizedAggregatorAddress,
    normalizedFeeRecipient,
    feeUsdWeiBigInt,
    {
      gasLimit: 5000000, // Explicit gas limit for Base mainnet
      gasPrice: gasPrice,
    }
  );
  console.log(`Transaction sent: ${tokenFactory.deploymentTransaction()?.hash}`);

  console.log("Waiting for deployment confirmation...");
  await tokenFactory.waitForDeployment();
  console.log("Deployment confirmed!");

  const tokenFactoryAddress = await tokenFactory.getAddress();

  console.log("\n✅ TokenFactory deployed successfully!");
  console.log(`   Address: ${tokenFactoryAddress}`);
  const deploymentTx = tokenFactory.deploymentTransaction();
  if (deploymentTx) {
    console.log(`   Transaction hash: ${deploymentTx.hash}`);
    const receipt = await deploymentTx.wait();
    console.log(`   Block number: ${receipt?.blockNumber}`);
    console.log(`   Gas used: ${receipt?.gasUsed?.toString()}`);
  }

  // Output information for copying to .env.local
  console.log("\n📋 Add this to your .env.local file:");
  console.log(`NEXT_PUBLIC_FACTORY_BASE="${tokenFactoryAddress}"`);

  // Verify contract is working
  console.log("\n🔍 Verifying contract...");
  const priceFeed = await tokenFactory.priceFeed();
  const feeRecipientAddress = await tokenFactory.feeRecipient();
  const feeUsdWeiValue = await tokenFactory.feeUsdWei();
  const owner = await tokenFactory.owner();

  console.log(`   Price Feed: ${priceFeed}`);
  console.log(`   Fee Recipient: ${feeRecipientAddress}`);
  console.log(`   Fee USD (wei): ${feeUsdWeiValue.toString()} (${ethers.formatEther(feeUsdWeiValue)} USD)`);
  console.log(`   Owner: ${owner}`);

  // Test currentFee() if fee is set
  if (feeUsdWeiBigInt > 0n) {
    try {
      const currentFee = await tokenFactory.currentFee();
      console.log(`   Current Fee (native): ${ethers.formatEther(currentFee)} ETH`);
    } catch (error) {
      console.log(`   ⚠️  Could not fetch current fee: ${error}`);
    }
  }

  console.log("\n✅ Deployment completed successfully!");
  console.log("\n💡 Next steps:");
  console.log("   1. Verify contract on Basescan:");
  console.log(`      npx hardhat verify --network base ${tokenFactoryAddress} "${normalizedAggregatorAddress}" "${normalizedFeeRecipient}" ${feeUsdWeiBigInt.toString()}`);
  console.log("   2. Update your frontend configuration with the factory address");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

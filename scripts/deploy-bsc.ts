import { ethers } from "hardhat";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function main() {
  console.log("Starting deployment of TokenFactory to BNB Smart Chain...\n");

  // Get Chainlink aggregator address from environment variable
  // Default value for BNB/USD on BNB Smart Chain
  const aggregatorAddressRaw = (process.env.CHAINLINK_AGGREGATOR_BSC || "0x0567F2323251f0aab15c8Df3f986C17B5b4CF09b").replace(/^["']|["']$/g, "");

  // Fee from environment variable, default 0 (free)
  const feeUsdWei = (process.env.FEE_USD_WEI || "0").replace(/^["']|["']$/g, "");

  // Get deployer account
  const [deployer] = await ethers.getSigners();

  // Use deployer address as feeRecipient if not specified
  const feeRecipientRaw = process.env.FEE_RECIPIENT || "";
  const feeRecipient = feeRecipientRaw ? feeRecipientRaw.replace(/^["']|["']$/g, "") : deployer.address;

  // Validate address formats
  if (!aggregatorAddressRaw) {
    throw new Error("CHAINLINK_AGGREGATOR_BSC is not set in .env");
  }

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
  const feeUsdWeiBigInt = BigInt(feeUsdWei);

  console.log("Deployment parameters:");
  console.log(`  Chainlink Aggregator: ${normalizedAggregatorAddress} (BNB/USD)`);
  console.log(`  Fee Recipient: ${normalizedFeeRecipient}`);
  console.log(`  Fee USD (wei): ${feeUsdWeiBigInt.toString()} (${ethers.formatEther(feeUsdWeiBigInt)} USD)`);
  const network = await ethers.provider.getNetwork();
  console.log(`  Network: ${network.name} (Chain ID: ${network.chainId})\n`);

  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "BNB\n");

  if (balance === 0n) {
    throw new Error("Insufficient balance. Please fund your account with BNB.");
  }

  // Deploy TokenFactory
  console.log("Deploying TokenFactory...");
  const TokenFactory = await ethers.getContractFactory("TokenFactory");

  // Explicit gas limit for deployment
  const tokenFactory = await TokenFactory.deploy(
    normalizedAggregatorAddress,
    normalizedFeeRecipient,
    feeUsdWeiBigInt,
    {
      gasLimit: 5000000, // Explicit gas limit
    }
  );

  await tokenFactory.waitForDeployment();
  const tokenFactoryAddress = await tokenFactory.getAddress();

  console.log("\n✅ TokenFactory deployed successfully!");
  console.log(`   Address: ${tokenFactoryAddress}`);
  const deploymentTx = tokenFactory.deploymentTransaction();
  if (deploymentTx) {
    console.log(`   Transaction hash: ${deploymentTx.hash}`);
    const receipt = await deploymentTx.wait();
    console.log(`   Block number: ${receipt?.blockNumber}`);
  }

  // Output information for copying to .env.local
  console.log("\n📋 Add this to your .env.local file:");
  console.log(`NEXT_PUBLIC_FACTORY_BSC="${tokenFactoryAddress}"`);

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

  console.log("\n✅ Deployment completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

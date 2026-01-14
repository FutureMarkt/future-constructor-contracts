import hre from "hardhat";
import * as dotenv from "dotenv";
import { ethers as ethersLib } from "ethers";

// Load environment variables
dotenv.config();

async function main() {
  console.log("Starting deployment of TokenFactory to Polygon...\n");

  // Connect to network (Hardhat v3 way)
  await hre.network.connect();
  
  // Get provider from network connection
  const provider = new ethersLib.JsonRpcProvider(
    process.env.POLYGON_RPC_URL || process.env.NEXT_PUBLIC_RPC_POLYGON || "https://polygon-rpc.com"
  );
  
  // Get deployer from private key
  const privateKey = process.env.POLYGON_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("POLYGON_PRIVATE_KEY is not set in .env");
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

  // Get deployment parameters from environment variables
  const aggregatorAddressRaw = (process.env.CHAINLINK_AGGREGATOR_POLYGON || "").replace(/^["']|["']$/g, "");
  const feeUsdWei = (process.env.FEE_USD_WEI || "0").replace(/^["']|["']$/g, "");

  if (!aggregatorAddressRaw) {
    throw new Error("CHAINLINK_AGGREGATOR_POLYGON is not set in .env");
  }

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
  console.log(`  Chainlink Aggregator: ${normalizedAggregatorAddress}`);
  console.log(`  Fee Recipient: ${normalizedFeeRecipient}`);
  console.log(`  Fee USD (wei): ${feeUsdWeiBigInt.toString()} (${ethers.formatEther(feeUsdWeiBigInt)} USD)`);
  const networkInfo = await provider.getNetwork();
  console.log(`  Network: ${networkInfo.name} (Chain ID: ${networkInfo.chainId})\n`);

  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "MATIC\n");

  if (balance === 0n) {
    throw new Error("Insufficient balance. Please fund your account.");
  }

  // Deploy TokenFactory
  console.log("Deploying TokenFactory...");
  const TokenFactory = await ethers.getContractFactory("TokenFactory");

  const tokenFactory = await TokenFactory.deploy(
    normalizedAggregatorAddress,
    normalizedFeeRecipient,
    feeUsdWeiBigInt
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
  console.log(`NEXT_PUBLIC_FACTORY_POLYGON="${tokenFactoryAddress}"`);

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

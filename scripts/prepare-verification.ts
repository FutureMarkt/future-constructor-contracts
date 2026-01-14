import { ethers } from "ethers";
import * as fs from "fs";

async function main() {
  const contractAddress = "0x5412032409F4e701fBBd2Cd7E1E2067ff1712b84";
  
  // Constructor arguments
  const aggregatorAddress = "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612";
  const feeRecipient = "0x3314b1D9Bb6246E04EA6A64cbfC0C8Cd458ebd6b";
  const feeUsdWei = "0";

  console.log("🔍 Preparing verification data for TokenFactory\n");
  console.log(`Contract Address: ${contractAddress}\n`);
  
  // Read the contract ABI to get constructor signature
  const artifactPath = "artifacts/contracts/TokenFactory.sol/TokenFactory.json";
  if (!fs.existsSync(artifactPath)) {
    console.error("❌ Artifact not found. Please run 'npx hardhat compile' first.");
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const iface = new ethers.Interface(artifact.abi);
  
  // Encode constructor arguments
  const constructorArgs = [aggregatorAddress, feeRecipient, feeUsdWei];
  const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint256"],
    constructorArgs
  );

  console.log("📋 Verification Information:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n1. Go to Arbiscan:");
  console.log(`   https://arbiscan.io/address/${contractAddress}#code\n`);
  
  console.log("2. Click 'Contract' tab, then 'Verify and Publish'\n");
  
  console.log("3. Select verification method:");
  console.log("   ✅ Via Standard JSON Input (Recommended)\n");
  
  console.log("4. Enter the following details:");
  console.log(`   Compiler Version: v0.8.20+commit.a1b79de6`);
  console.log(`   License: MIT`);
  console.log(`   Optimization: Yes`);
  console.log(`   Optimization Runs: 200\n`);
  
  console.log("5. Upload the flattened contract:");
  console.log(`   File: TokenFactory.flattened.sol\n`);
  
  console.log("6. Constructor Arguments (ABI-encoded):");
  console.log(`   ${encodedArgs.slice(2)}\n`);
  
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n💡 Alternative: Use Hardhat verify (if plugin is fixed):");
  console.log(`   npx hardhat verify --network arbitrum ${contractAddress} "${aggregatorAddress}" "${feeRecipient}" ${feeUsdWei}\n`);
  
  console.log("📝 Constructor Arguments (for manual entry):");
  console.log(`   - Aggregator: ${aggregatorAddress}`);
  console.log(`   - Fee Recipient: ${feeRecipient}`);
  console.log(`   - Fee USD (wei): ${feeUsdWei}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

import hre from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
dotenv.config();

async function main() {
  const contractAddress = "0x5412032409F4e701fBBd2Cd7E1E2067ff1712b84";
  const constructorArgs = [
    "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", // aggregator
    "0x3314b1D9Bb6246E04EA6A64cbfC0C8Cd458ebd6b", // feeRecipient
    "0" // feeUsdWei
  ];

  console.log("Verifying TokenFactory contract on Arbiscan...\n");
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Constructor Args: ${constructorArgs.join(", ")}\n`);

  // Read the contract artifact
  const artifact = await hre.artifacts.readArtifact("TokenFactory");
  
  // Get compiler version and settings
  const compilerInput = {
    language: "Solidity",
    sources: {
      "contracts/TokenFactory.sol": {
        content: fs.readFileSync(
          path.join(__dirname, "../contracts/TokenFactory.sol"),
          "utf8"
        ),
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "paris",
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"],
        },
      },
    },
  };

  console.log("Contract compiled successfully!");
  console.log("\n📋 To verify manually on Arbiscan:");
  console.log("1. Go to https://arbiscan.io/address/" + contractAddress);
  console.log("2. Click 'Contract' tab");
  console.log("3. Click 'Verify and Publish'");
  console.log("4. Select 'Via Standard JSON Input'");
  console.log("5. Enter the following information:");
  console.log(`   - Compiler Version: 0.8.20`);
  console.log(`   - License: MIT`);
  console.log(`   - Constructor Arguments (ABI-encoded):`);
  
  // Try to encode constructor arguments
  try {
    const { ethers } = await import("ethers");
    const iface = new ethers.Interface(artifact.abi);
    const encodedArgs = iface.encodeDeploy(constructorArgs);
    console.log(`     ${encodedArgs.slice(2)}`);
  } catch (error) {
    console.log(`     (Error encoding: ${error})`);
    console.log(`     Raw args: ${constructorArgs.join(", ")}`);
  }
  
  console.log("\n💡 Note: You'll need to provide the full source code and dependencies.");
  console.log("   The contract uses OpenZeppelin contracts, so you'll need to flatten the contract.");
  console.log("\n   Alternatively, use the Hardhat flatten command:");
  console.log(`   npx hardhat flatten contracts/TokenFactory.sol > TokenFactory.flattened.sol`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

/**
 * Verifies already-deployed testnet contracts on Sourcify.
 * Etherscan is not called. No API key. No mainnet chain id.
 *
 *   npx hardhat run scripts/verify-sourcify-testnets.ts --network sepoliaVerify
 *   npx hardhat run scripts/verify-sourcify-testnets.ts --network bscTestnet
 *   npx hardhat run scripts/verify-sourcify-testnets.ts --network arbitrumSepoliaVerify
 *   npx hardhat run scripts/verify-sourcify-testnets.ts --network baseSepolia
 *   npx hardhat run scripts/verify-sourcify-testnets.ts --network polygonAmoy
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import hre, { network } from "hardhat";

const MAINNET_CHAIN_IDS = new Set([1, 10, 56, 137, 324, 1101, 8453, 34443, 42161, 59144, 81457, 534352]);
const ZERO = "0x0000000000000000000000000000000000000000";

type Deployment = {
  chainId: number;
  deployer: string;
  feeRecipient: string;
  sequencerUptimeFeed: string;
  feesUsdWei: Record<string, string>;
  priceFeed: { address: string };
  mockAggregator?: { address: string; description: string; price: string };
  contracts: {
    tokenDeployer: string;
    permitDeployer: string;
    votesDeployer: string;
    vestingDeployer: string;
    factory: string;
    fixedPriceAggregator?: string;
    receipts: Record<string, { hash: string }>;
  };
  sourcify?: unknown;
};

type SourcifyRow = {
  contract: string;
  address: string;
  status: "full" | "partial" | "failed";
  match: string | null;
  repoUrl: string | null;
  apiUrl: string;
  message: string;
};

function repoUrl(chainId: number, address: string, status: "full" | "partial"): string {
  const folder = status === "full" ? "full_match" : "partial_match";
  return `https://repo.sourcify.dev/contracts/${folder}/${chainId}/${address}`;
}

async function lookup(chainId: number, address: string): Promise<{ match: string | null; creationMatch: string | null; runtimeMatch: string | null }> {
  const response = await fetch(`https://sourcify.dev/server/v2/contract/${chainId}/${address}`);
  if (response.status === 404) return { match: null, creationMatch: null, runtimeMatch: null };
  if (!response.ok) throw new Error(`Sourcify lookup ${chainId}/${address} returned ${response.status}`);
  const body = (await response.json()) as { match?: string | null; creationMatch?: string | null; runtimeMatch?: string | null };
  return {
    match: body.match ?? null,
    creationMatch: body.creationMatch ?? null,
    runtimeMatch: body.runtimeMatch ?? null,
  };
}

function statusOf(match: string | null): "full" | "partial" | "failed" {
  if (match === "exact_match") return "full";
  if (match === "match") return "partial";
  return "failed";
}

async function main() {
  const connection = await network.create();
  const chainId = Number((await connection.ethers.provider.getNetwork()).chainId);
  if (MAINNET_CHAIN_IDS.has(chainId)) {
    throw new Error(`refusing chain id ${chainId}: mainnet is out of scope`);
  }
  const names = (await readdir("deployments")).filter((name) => name.endsWith(".json"));
  let fileName = "";
  let deployment: Deployment | null = null;
  for (const name of names) {
    const parsed = JSON.parse(await readFile(path.join("deployments", name), "utf8")) as Deployment;
    if (parsed.chainId === chainId) {
      fileName = name;
      deployment = parsed;
      break;
    }
  }
  if (!deployment) throw new Error(`no deployments/*.json for chain id ${chainId}`);

  const fees = Object.fromEntries(Object.entries(deployment.feesUsdWei).map(([key, value]) => [key, BigInt(value)]));
  const receipts = deployment.contracts.receipts;
  const targets: Array<{ contract: string; fqn: string; address: string; args: unknown[]; tx?: string }> = [
    {
      contract: "TokenDeployer",
      fqn: "contracts/advanced/TokenDeployer.sol:TokenDeployer",
      address: deployment.contracts.tokenDeployer,
      args: [deployment.deployer],
      tx: receipts.tokenDeployer?.hash,
    },
    {
      contract: "PermitDeployer",
      fqn: "contracts/advanced/PermitDeployer.sol:PermitDeployer",
      address: deployment.contracts.permitDeployer,
      args: [deployment.deployer],
      tx: receipts.permitDeployer?.hash,
    },
    {
      contract: "VotesDeployer",
      fqn: "contracts/advanced/VotesDeployer.sol:VotesDeployer",
      address: deployment.contracts.votesDeployer,
      args: [deployment.deployer],
      tx: receipts.votesDeployer?.hash,
    },
    {
      contract: "VestingDeployer",
      fqn: "contracts/advanced/VestingDeployer.sol:VestingDeployer",
      address: deployment.contracts.vestingDeployer,
      args: [deployment.deployer],
      tx: receipts.vestingDeployer?.hash,
    },
    {
      contract: "AdvancedTokenFactory",
      fqn: "contracts/advanced/AdvancedTokenFactory.sol:AdvancedTokenFactory",
      address: deployment.contracts.factory,
      args: [
        deployment.priceFeed.address,
        deployment.sequencerUptimeFeed || ZERO,
        deployment.feeRecipient,
        fees,
        {
          token: deployment.contracts.tokenDeployer,
          permit: deployment.contracts.permitDeployer,
          votes: deployment.contracts.votesDeployer,
          vesting: deployment.contracts.vestingDeployer,
        },
      ],
      tx: receipts.factory?.hash,
    },
  ];
  if (deployment.mockAggregator) {
    targets.push({
      contract: "FixedPriceAggregator",
      fqn: "contracts/mocks/FixedPriceAggregator.sol:FixedPriceAggregator",
      address: deployment.mockAggregator.address,
      args: [deployment.mockAggregator.description, BigInt(deployment.mockAggregator.price)],
      tx: receipts.fixedPriceAggregator?.hash,
    });
  }

  const rows: SourcifyRow[] = [];
  for (const target of targets) {
    const apiUrl = `https://sourcify.dev/server/v2/contract/${chainId}/${target.address}`;
    let message = "verified on Sourcify";
    try {
      await verifyContract(
        {
          address: target.address,
          constructorArgs: target.args,
          contract: target.fqn,
          provider: "sourcify",
          creationTxHash: target.tx,
          force: true,
        },
        hre,
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      console.log(`${target.contract} submit error: ${message}`);
    }
    let lookedUp: { match: string | null; creationMatch: string | null; runtimeMatch: string | null };
    try {
      lookedUp = await lookup(chainId, target.address);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      rows.push({ contract: target.contract, address: target.address, status: "failed", match: null, repoUrl: null, apiUrl, message: text });
      continue;
    }
    const status = statusOf(lookedUp.runtimeMatch ?? lookedUp.match);
    rows.push({
      contract: target.contract,
      address: target.address,
      status,
      match: lookedUp.match,
      repoUrl: status === "failed" ? null : repoUrl(chainId, target.address, status),
      apiUrl,
      message: status === "failed" ? message : `verified on Sourcify (${status} match, runtime ${lookedUp.runtimeMatch}, creation ${lookedUp.creationMatch})`,
    });
    console.log(`${target.contract} ${status} ${rows[rows.length - 1].repoUrl ?? apiUrl}`);
  }

  const updated = {
    ...deployment,
    sourceVerification: {
      attempted: true,
      provider: "sourcify",
      etherscan: "not used",
    },
    sourcify: rows,
  };
  await writeFile(path.join("deployments", fileName), `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`updated deployments/${fileName}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});

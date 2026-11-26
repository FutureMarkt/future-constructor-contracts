/**
 * Testnet-only deployment of the advanced-token stack:
 * TokenDeployer, PermitDeployer, VotesDeployer, VestingDeployer,
 * AdvancedTokenFactory, then setFactory on each deployer.
 *
 * The signer is TESTNET_DEPLOYER_KEY. This file never prints that value.
 * Broadcast refuses every chain id except the five testnets below.
 *
 *   npx hardhat run scripts/deploy-advanced-testnets.ts --network hardhatMainnet
 *   ADVANCED_DEPLOY_BROADCAST=sepolia,bsc-testnet npx hardhat run scripts/deploy-advanced-testnets.ts --network hardhatMainnet
 */
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { artifacts as hardhatArtifacts, network } from "hardhat";
import {
  Contract,
  ContractFactory,
  Interface,
  JsonRpcProvider,
  Wallet,
  getAddress,
  formatEther,
  type InterfaceAbi,
  type Provider,
  type Signer,
  type TransactionReceipt,
  type TransactionResponse,
} from "ethers";

const EXPECTED_DEPLOYER = "0x8A8D159DdF5FcE044192Ddd720D2EF4a4459Eb05";
const ZERO = "0x0000000000000000000000000000000000000000";
const USD = 10n ** 18n;
const LOCAL_CHAIN_ID = 31337n;
const MAX_PRICE_AGE_SECONDS = 60 * 60;
const MAINNET_CHAIN_IDS = new Set([1, 10, 56, 137, 324, 1101, 8453, 34443, 42161, 59144, 81457, 534352]);

const SEQUENCER_DOCS = "https://docs.chain.link/data-feeds/l2-sequencer-feeds";
const SEQUENCER_NOTE =
  "Chainlink publishes no L2 sequencer uptime feed for this testnet. " +
  `${SEQUENCER_DOCS} lists mainnets only and says new networks are not being added. ` +
  "AdvancedTokenFactory treats address(0) as the disabled check.";

type ScheduleName = "ethereum" | "other";

type FeeSchedule = {
  baseFeeUsdWei: bigint;
  mintFeeUsdWei: bigint;
  burnFeeUsdWei: bigint;
  distributionFeeUsdWei: bigint;
  pauseFeeUsdWei: bigint;
  transferFeeUsdWei: bigint;
  permitFeeUsdWei: bigint;
  votesFeeUsdWei: bigint;
  vestingFeeUsdWei: bigint;
};

type TestnetName = "sepolia" | "bsc-testnet" | "polygon-amoy" | "arbitrum-sepolia" | "base-sepolia";

type Testnet = {
  key: TestnetName;
  chainId: number;
  title: string;
  nativeSymbol: string;
  rpcUrls: string[];
  rpcEnv: string;
  schedule: ScheduleName;
  priceFeed: string | null;
  priceFeedPair: string;
  priceFeedDocsUrl: string;
  priceFeedListUrl: string;
  heartbeatSeconds: number | null;
  sequencerUptimeFeed: string;
  sequencerNote: string;
  explorer: string;
  frontendEnv: string;
  blockedReason: string | null;
};

function usd(whole: bigint): bigint {
  return whole * USD;
}

function schedule(
  base: bigint,
  mint: bigint,
  burn: bigint,
  distribution: bigint,
  pause: bigint,
  transferFee: bigint,
  permit: bigint,
  votes: bigint,
  vesting: bigint,
): FeeSchedule {
  return {
    baseFeeUsdWei: usd(base),
    mintFeeUsdWei: usd(mint),
    burnFeeUsdWei: usd(burn),
    distributionFeeUsdWei: usd(distribution),
    pauseFeeUsdWei: usd(pause),
    transferFeeUsdWei: usd(transferFee),
    permitFeeUsdWei: usd(permit),
    votesFeeUsdWei: usd(votes),
    vestingFeeUsdWei: usd(vesting),
  };
}

// Same numbers as contracts/advanced/README.md and test/AdvancedTokenFactory.test.ts.
const ETHEREUM_FEES = schedule(6n, 2n, 2n, 2n, 2n, 20n, 2n, 2n, 2n);
const OTHER_FEES = schedule(3n, 1n, 1n, 1n, 1n, 10n, 1n, 1n, 1n);

const FEES: Record<ScheduleName, FeeSchedule> = {
  ethereum: ETHEREUM_FEES,
  other: OTHER_FEES,
};

const FLAG_NAMES = [
  "initialDistribution",
  "mint",
  "burn",
  "pause",
  "transferFee",
  "permit",
  "votes",
] as const;

type FlagName = (typeof FLAG_NAMES)[number];

type Flags = Record<FlagName, boolean>;

const NO_FLAGS: Flags = {
  initialDistribution: false,
  mint: false,
  burn: false,
  pause: false,
  transferFee: false,
  permit: false,
  votes: false,
};

function flagsWith(name?: FlagName, all = false): Flags {
  const flags = { ...NO_FLAGS };
  if (all) {
    for (const flag of FLAG_NAMES) flags[flag] = true;
    return flags;
  }
  if (name) flags[name] = true;
  return flags;
}

function usdFor(fees: FeeSchedule, flags: Flags): bigint {
  let total = fees.baseFeeUsdWei;
  if (flags.mint) total += fees.mintFeeUsdWei;
  if (flags.burn) total += fees.burnFeeUsdWei;
  if (flags.initialDistribution) total += fees.distributionFeeUsdWei;
  if (flags.pause) total += fees.pauseFeeUsdWei;
  if (flags.transferFee) total += fees.transferFeeUsdWei;
  if (flags.permit) total += fees.permitFeeUsdWei;
  if (flags.votes) total += fees.votesFeeUsdWei;
  return total;
}

function scalePrice(price: bigint, priceDecimals: number, targetDecimals: number): bigint {
  if (priceDecimals === targetDecimals) return price;
  if (priceDecimals < targetDecimals) return price * 10n ** BigInt(targetDecimals - priceDecimals);
  return price / 10n ** BigInt(priceDecimals - targetDecimals);
}

function quoteNative(feeUsd: bigint, answer: bigint, priceDecimals: number): bigint {
  if (feeUsd === 0n) return 0n;
  const normalized = scalePrice(answer, priceDecimals, 18);
  return (feeUsd * USD) / normalized;
}

const NETWORKS: Record<TestnetName, Testnet> = {
  sepolia: {
    key: "sepolia",
    chainId: 11155111,
    title: "Ethereum Sepolia",
    nativeSymbol: "ETH",
    rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com", "https://rpc.sepolia.org", "https://1rpc.io/sepolia"],
    rpcEnv: "TESTNET_RPC_SEPOLIA",
    schedule: "ethereum",
    priceFeed: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    priceFeedPair: "ETH / USD",
    priceFeedDocsUrl: "https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum-sepolia",
    priceFeedListUrl: "https://reference-data-directory.vercel.app/feeds-ethereum-testnet-sepolia.json",
    heartbeatSeconds: 3600,
    sequencerUptimeFeed: ZERO,
    sequencerNote: `${SEQUENCER_NOTE} Sepolia is an L1. A hidden "L2 Sequencer Uptime Status Feed" row in that price list (0x37Ae2933eE42D808b4D86458777a3EFc4E8e2976) has no code on Sepolia, so it is not used.`,
    explorer: "https://sepolia.etherscan.io",
    frontendEnv: "NEXT_PUBLIC_ADVANCED_FACTORY_SEPOLIA",
    blockedReason: null,
  },
  "bsc-testnet": {
    key: "bsc-testnet",
    chainId: 97,
    title: "BNB Smart Chain testnet",
    nativeSymbol: "tBNB",
    rpcUrls: [
      "https://bsc-testnet-rpc.publicnode.com",
      "https://data-seed-prebsc-1-s1.binance.org:8545",
      "https://bsc-testnet.public.blastapi.io",
    ],
    rpcEnv: "TESTNET_RPC_BSC",
    schedule: "other",
    priceFeed: "0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526",
    priceFeedPair: "BNB / USD",
    priceFeedDocsUrl: "https://docs.chain.link/data-feeds/price-feeds/addresses?network=bnb-testnet",
    priceFeedListUrl: "https://reference-data-directory.vercel.app/feeds-bsc-testnet.json",
    heartbeatSeconds: 3600,
    sequencerUptimeFeed: ZERO,
    sequencerNote: `${SEQUENCER_NOTE} BNB Smart Chain testnet is not in that list.`,
    explorer: "https://testnet.bscscan.com",
    frontendEnv: "NEXT_PUBLIC_ADVANCED_FACTORY_BSC_TESTNET",
    blockedReason: null,
  },
  "polygon-amoy": {
    key: "polygon-amoy",
    chainId: 80002,
    title: "Polygon Amoy",
    nativeSymbol: "POL",
    rpcUrls: ["https://polygon-amoy-bor-rpc.publicnode.com", "https://rpc-amoy.polygon.technology"],
    rpcEnv: "TESTNET_RPC_AMOY",
    schedule: "other",
    priceFeed: null,
    priceFeedPair: "POL / USD",
    priceFeedDocsUrl: "https://docs.chain.link/data-feeds/price-feeds/addresses?network=polygon-amoy",
    priceFeedListUrl: "https://reference-data-directory.vercel.app/feeds-polygon-testnet-amoy.json",
    heartbeatSeconds: null,
    sequencerUptimeFeed: ZERO,
    sequencerNote: `${SEQUENCER_NOTE} Polygon Amoy is a PoS testnet and is not in that list.`,
    explorer: "https://amoy.polygonscan.com",
    frontendEnv: "NEXT_PUBLIC_ADVANCED_FACTORY_AMOY",
    blockedReason:
      "Amoy is deployed only by scripts/deploy-amoy-mock-feed.ts, which exits unless the chain id is 80002 and deploys FixedPriceAggregator there. This shared script does not broadcast Amoy and does not deploy the mock.",
  },
  "arbitrum-sepolia": {
    key: "arbitrum-sepolia",
    chainId: 421614,
    title: "Arbitrum Sepolia",
    nativeSymbol: "ETH",
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc", "https://arbitrum-sepolia-rpc.publicnode.com"],
    rpcEnv: "TESTNET_RPC_ARBITRUM_SEPOLIA",
    schedule: "other",
    priceFeed: "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165",
    priceFeedPair: "ETH / USD",
    priceFeedDocsUrl: "https://docs.chain.link/data-feeds/price-feeds/addresses?network=arbitrum-sepolia",
    priceFeedListUrl: "https://reference-data-directory.vercel.app/feeds-ethereum-testnet-sepolia-arbitrum-1.json",
    heartbeatSeconds: 120,
    sequencerUptimeFeed: ZERO,
    sequencerNote: `${SEQUENCER_NOTE} The page lists Arbitrum Mainnet (0xFdB631F5EE196F0ed6FAa767959853A9F217697D) and does not list Arbitrum Sepolia. The sequencer check is off on this testnet.`,
    explorer: "https://sepolia.arbiscan.io",
    frontendEnv: "NEXT_PUBLIC_ADVANCED_FACTORY_ARBITRUM_SEPOLIA",
    blockedReason: null,
  },
  "base-sepolia": {
    key: "base-sepolia",
    chainId: 84532,
    title: "Base Sepolia",
    nativeSymbol: "ETH",
    rpcUrls: ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"],
    rpcEnv: "TESTNET_RPC_BASE_SEPOLIA",
    schedule: "other",
    priceFeed: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1",
    priceFeedPair: "ETH / USD",
    priceFeedDocsUrl: "https://docs.chain.link/data-feeds/price-feeds/addresses?network=base-sepolia",
    priceFeedListUrl: "https://reference-data-directory.vercel.app/feeds-ethereum-testnet-sepolia-base-1.json",
    heartbeatSeconds: 1200,
    sequencerUptimeFeed: ZERO,
    sequencerNote: `${SEQUENCER_NOTE} The page lists BASE Mainnet (0xBCF85224fc0756B9Fa45aA7892530B47e10b6433) and does not list Base Sepolia. The sequencer check is off on this testnet.`,
    explorer: "https://sepolia.basescan.org",
    frontendEnv: "NEXT_PUBLIC_ADVANCED_FACTORY_BASE_SEPOLIA",
    blockedReason: null,
  },
};

const FEED_ABI = [
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
];

// Bytecode source. The deploy script may be committed later; contract sources must still match this commit.
const CONTRACTS_COMMIT = "5fb7fed88e31618955b341ccf70639079759946d";

type Artifact = { abi: string[]; bytecode: string };

type GasUsage = {
  tokenDeployer: bigint;
  permitDeployer: bigint;
  votesDeployer: bigint;
  vestingDeployer: bigint;
  factory: bigint;
  setFactoryEach: bigint[];
};

type Deployed = {
  tokenDeployer: string;
  permitDeployer: string;
  votesDeployer: string;
  vestingDeployer: string;
  factory: string;
  receipts: Record<string, { hash: string; blockNumber: number; gasUsed: string }>;
};

function redact(text: string): string {
  return text.replace(/0x[0-9a-fA-F]{64}/g, "0x[redacted]");
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

function deployerWallet(provider?: Provider): Wallet {
  const raw = process.env.TESTNET_DEPLOYER_KEY;
  if (!raw) throw new Error("TESTNET_DEPLOYER_KEY is missing");
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("TESTNET_DEPLOYER_KEY has an unexpected format");
  let wallet: Wallet;
  try {
    wallet = new Wallet(key, provider);
  } catch {
    throw new Error("TESTNET_DEPLOYER_KEY could not be parsed as a private key");
  }
  if (getAddress(wallet.address) !== EXPECTED_DEPLOYER) {
    throw new Error(`TESTNET_DEPLOYER_KEY derives to ${wallet.address}, expected ${EXPECTED_DEPLOYER}`);
  }
  return wallet;
}

function assertAllowedChain(chainId: bigint, expected: number): void {
  const id = Number(chainId);
  if (MAINNET_CHAIN_IDS.has(id)) {
    throw new Error(`refusing chain id ${id}: mainnet is out of scope`);
  }
  if (chainId !== BigInt(expected)) {
    throw new Error(`refusing chain id ${chainId}: this run only allows ${expected}`);
  }
}

function contractsCommit(): string {
  const changed = execSync(`git diff --name-only ${CONTRACTS_COMMIT} -- contracts`, { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".sol"))
    .filter((line) => line !== "contracts/mocks/FixedPriceAggregator.sol");
  if (changed.length > 0) {
    throw new Error(`contract sources differ from bytecode commit ${CONTRACTS_COMMIT}: ${changed.join(", ")}`);
  }
  return CONTRACTS_COMMIT;
}

function broadcastList(): TestnetName[] {
  const fromEnv = process.env.ADVANCED_DEPLOY_BROADCAST ?? "";
  const arg = process.argv.find((item) => item.startsWith("--broadcast="));
  const raw = arg ? arg.slice("--broadcast=".length) : fromEnv;
  if (!raw.trim()) return [];
  const names = raw.split(",").map((item) => item.trim()).filter(Boolean);
  const allowed = new Set(Object.keys(NETWORKS));
  for (const name of names) {
    if (!allowed.has(name)) throw new Error(`unknown testnet "${name}"`);
  }
  return names as TestnetName[];
}

async function loadArtifacts(): Promise<Record<string, Artifact>> {
  const names = ["MockAggregator", "TokenDeployer", "PermitDeployer", "VotesDeployer", "VestingDeployer", "AdvancedTokenFactory"];
  const out: Record<string, Artifact> = {};
  for (const name of names) {
    const artifact = await hardhatArtifacts.readArtifact(name);
    out[name] = { abi: artifact.abi as unknown as string[], bytecode: artifact.bytecode };
  }
  return out;
}

function factoryFor(artifact: Artifact, signer: Signer): ContractFactory {
  return new ContractFactory(artifact.abi, artifact.bytecode, signer);
}

async function deployContract(
  signer: Signer,
  artifact: Artifact,
  args: unknown[],
  fee: TxFee,
): Promise<{ address: string; receipt: TransactionReceipt }> {
  const factory = factoryFor(artifact, signer);
  const unsigned = await factory.getDeployTransaction(...args);
  return sendDeploy(signer, unsigned, fee);
}

async function sendDeploy(
  signer: Signer,
  unsigned: { data?: string | null; to?: string | null },
  fee: TxFee,
): Promise<{ address: string; receipt: TransactionReceipt }> {
  const gasLimit = ((await signer.estimateGas(unsigned)) * 12n) / 10n;
  const response = await signer.sendTransaction({ ...unsigned, ...feeFields(fee), gasLimit });
  const receipt = await waitReceipt(response);
  if (!receipt.contractAddress) throw new Error("deployment receipt has no contract address");
  return { address: getAddress(receipt.contractAddress), receipt };
}

async function sendCall(
  contract: Contract,
  method: string,
  args: unknown[],
  fee: TxFee,
): Promise<TransactionReceipt> {
  const data = await contract.getFunction(method).populateTransaction(...args);
  const gasLimit = ((await contract.getFunction(method).estimateGas(...args)) * 15n) / 10n;
  const response = await contract.runner!.sendTransaction!({ ...data, ...feeFields(fee), gasLimit });
  return waitReceipt(response);
}

async function waitReceipt(response: TransactionResponse): Promise<TransactionReceipt> {
  const receipt = await response.wait(1, 180_000);
  if (!receipt || receipt.status !== 1) {
    throw new Error(`transaction ${response.hash} was not successful`);
  }
  return receipt;
}

type TxFee =
  | { kind: "eip1559"; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }
  | { kind: "legacy"; gasPrice: bigint };

function feeFields(fee: TxFee): Record<string, bigint> {
  if (fee.kind === "legacy") return { gasPrice: fee.gasPrice, type: 0n };
  return { maxFeePerGas: fee.maxFeePerGas, maxPriorityFeePerGas: fee.maxPriorityFeePerGas };
}

async function feeFor(provider: Provider, balance: bigint, gasBudget: bigint): Promise<TxFee> {
  const block = await provider.getBlock("latest");
  const fee = await provider.getFeeData();
  const base = block?.baseFeePerGas ?? 0n;
  if (fee.maxFeePerGas == null || base === 0n && fee.maxFeePerGas === 0n) {
    const suggested = fee.gasPrice ?? 1_000_000_000n;
    const cap = gasBudget === 0n ? suggested : (balance * 8n) / 10n / gasBudget;
    const gasPrice = min(max(suggested, 1_000_000_000n), cap === 0n ? suggested : cap);
    if (gasPrice < suggested / 2n) throw new Error("balance cannot cover the network gas price");
    return { kind: "legacy", gasPrice };
  }
  const priority = fee.maxPriorityFeePerGas ?? 1_000_000n;
  const floor = base * 2n + priority;
  const suggested = fee.maxFeePerGas > floor ? fee.maxFeePerGas : floor;
  const cap = gasBudget === 0n ? suggested : (balance * 8n) / 10n / gasBudget;
  const maxFeePerGas = min(suggested, cap === 0n ? suggested : cap);
  if (maxFeePerGas < base) {
    throw new Error(`balance cannot cover the base fee (${base} wei) for the measured gas`);
  }
  const maxPriorityFeePerGas = priority > maxFeePerGas ? maxFeePerGas : priority;
  return { kind: "eip1559", maxFeePerGas, maxPriorityFeePerGas };
}

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function max(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function worstCase(fee: TxFee, gas: bigint): bigint {
  if (fee.kind === "legacy") return fee.gasPrice * gas;
  return fee.maxFeePerGas * gas;
}

function receiptJson(receipt: TransactionReceipt) {
  return {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
  };
}

async function deployStack(
  signer: Signer,
  artifacts: Record<string, Artifact>,
  fees: FeeSchedule,
  priceFeed: string,
  sequencer: string,
  fee: TxFee,
): Promise<{ deployed: Deployed; gas: GasUsage }> {
  const owner = await signer.getAddress();
  console.log(`  deploy TokenDeployer`);
  const token = await deployContract(signer, artifacts.TokenDeployer, [owner], fee);
  console.log(`  deploy PermitDeployer`);
  const permit = await deployContract(signer, artifacts.PermitDeployer, [owner], fee);
  console.log(`  deploy VotesDeployer`);
  const votes = await deployContract(signer, artifacts.VotesDeployer, [owner], fee);
  console.log(`  deploy VestingDeployer`);
  const vesting = await deployContract(signer, artifacts.VestingDeployer, [owner], fee);
  console.log(`  deploy AdvancedTokenFactory`);
  const factoryTx = await deployContract(
    signer,
    artifacts.AdvancedTokenFactory,
    [priceFeed, sequencer, owner, fees, { token: token.address, permit: permit.address, votes: votes.address, vesting: vesting.address }],
    fee,
  );
  const bind = async (artifact: Artifact, address: string) => {
    const contract = new Contract(address, artifact.abi, signer);
    const receipt = await sendCall(contract, "setFactory", [factoryTx.address], fee);
    return receipt;
  };
  const tokenSet = await bind(artifacts.TokenDeployer, token.address);
  const permitSet = await bind(artifacts.PermitDeployer, permit.address);
  const votesSet = await bind(artifacts.VotesDeployer, votes.address);
  const vestingSet = await bind(artifacts.VestingDeployer, vesting.address);
  const gas: GasUsage = {
    tokenDeployer: token.receipt.gasUsed,
    permitDeployer: permit.receipt.gasUsed,
    votesDeployer: votes.receipt.gasUsed,
    vestingDeployer: vesting.receipt.gasUsed,
    factory: factoryTx.receipt.gasUsed,
    setFactoryEach: [tokenSet.gasUsed, permitSet.gasUsed, votesSet.gasUsed, vestingSet.gasUsed],
  };
  return {
    gas,
    deployed: {
      tokenDeployer: token.address,
      permitDeployer: permit.address,
      votesDeployer: votes.address,
      vestingDeployer: vesting.address,
      factory: factoryTx.address,
      receipts: {
        tokenDeployer: receiptJson(token.receipt),
        permitDeployer: receiptJson(permit.receipt),
        votesDeployer: receiptJson(votes.receipt),
        vestingDeployer: receiptJson(vesting.receipt),
        factory: receiptJson(factoryTx.receipt),
        setFactoryToken: receiptJson(tokenSet),
        setFactoryPermit: receiptJson(permitSet),
        setFactoryVotes: receiptJson(votesSet),
        setFactoryVesting: receiptJson(vestingSet),
      },
    },
  };
}

type EthCall = (to: string, data: string) => Promise<string>;

function viewAt(ethCall: EthCall, abi: InterfaceAbi, address: string) {
  const iface = new Interface(abi);
  return async (method: string, args: unknown[] = []) => {
    const data = iface.encodeFunctionData(method, args);
    const raw = await ethCall(address, data);
    const decoded = iface.decodeFunctionResult(method, raw);
    return decoded.length <= 1 ? decoded[0] : decoded;
  };
}

async function readBack(
  provider: Provider,
  ethCall: EthCall,
  artifacts: Record<string, Artifact>,
  factoryAddress: string,
  deployers: Pick<Deployed, "tokenDeployer" | "permitDeployer" | "votesDeployer" | "vestingDeployer">,
  fees: FeeSchedule,
  signerAddress: string,
) {
  const view = viewAt(ethCall, artifacts.AdvancedTokenFactory.abi, factoryAddress);
  const feed = viewAt(ethCall, FEED_ABI, String(await view("priceFeed")));
  const block = await provider.getBlock("latest");
  if (!block) throw new Error("missing block");
  const decimals = Number(await feed("decimals"));
  const description = String(await feed("description"));
  const round = await feed("latestRoundData");
  const answer = BigInt(round.answer);
  const updatedAt = BigInt(round.updatedAt);
  const age = BigInt(block.timestamp) - updatedAt;
  if (answer <= 0n) throw new Error(`price feed answer is ${answer}`);
  if (round.answeredInRound < round.roundId) throw new Error("price feed answeredInRound is behind roundId");

  const storageNames = [
    "baseFeeUsdWei",
    "mintFeeUsdWei",
    "burnFeeUsdWei",
    "distributionFeeUsdWei",
    "pauseFeeUsdWei",
    "transferFeeUsdWei",
    "permitFeeUsdWei",
    "votesFeeUsdWei",
    "vestingFeeUsdWei",
  ] as const;
  const storage: Record<string, { actual: string; expected: string; match: boolean }> = {};
  for (const name of storageNames) {
    const actual = BigInt(await view(name));
    const expected = fees[name];
    storage[name] = { actual: actual.toString(), expected: expected.toString(), match: actual === expected };
    if (actual !== expected) throw new Error(`${name} is ${actual}, schedule is ${expected}`);
  }

  const quoteOne = async (label: string, flags: Flags, usdAmount: bigint) => {
    const native = BigInt(await view("currentFee", [flags]));
    const expected = quoteNative(usdAmount, answer, decimals);
    if (native !== expected) {
      throw new Error(`${label} currentFee ${native} != schedule quote ${expected}`);
    }
    return {
      usdWei: usdAmount.toString(),
      nativeWei: native.toString(),
      expectedNativeWei: expected.toString(),
      match: true,
    };
  };

  const quotes: Record<string, { usdWei: string; nativeWei: string; expectedNativeWei: string; match: boolean }> = {};
  let quoteError: string | null = null;
  let vestingNative = 0n;
  const vestingExpected = quoteNative(fees.vestingFeeUsdWei, answer, decimals);
  if (age > BigInt(MAX_PRICE_AGE_SECONDS)) {
    quoteError =
      `price feed is ${age} seconds old, above the factory maximum of ${MAX_PRICE_AGE_SECONDS}; ` +
      "currentFee reverts until Chainlink publishes a newer round";
  } else {
    try {
      quotes.base = await quoteOne("base", NO_FLAGS, fees.baseFeeUsdWei);
      for (const name of FLAG_NAMES) {
        const flags = flagsWith(name);
        quotes[name] = await quoteOne(name, flags, usdFor(fees, flags));
      }
      quotes.allSevenFlags = await quoteOne(
        "allSevenFlags",
        flagsWith(undefined, true),
        usdFor(fees, flagsWith(undefined, true)),
      );
      vestingNative = BigInt(await view("currentVestingFee"));
      if (vestingNative !== vestingExpected) {
        throw new Error(`currentVestingFee ${vestingNative} != schedule quote ${vestingExpected}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("!=")) throw error;
      quoteError = message;
    }
  }

  const sequencer = getAddress(String(await view("sequencerUptimeFeed")));
  const recipient = getAddress(String(await view("feeRecipient")));
  const owner = getAddress(String(await view("owner")));
  if (recipient !== getAddress(signerAddress) || owner !== getAddress(signerAddress)) {
    throw new Error("factory owner or fee recipient is not the deployer");
  }
  if (sequencer !== ZERO) throw new Error(`sequencer feed is ${sequencer}, expected address(0)`);

  const deployerBindings: Array<[string, string, string]> = [
    ["tokenDeployer", "TokenDeployer", deployers.tokenDeployer],
    ["permitDeployer", "PermitDeployer", deployers.permitDeployer],
    ["votesDeployer", "VotesDeployer", deployers.votesDeployer],
    ["vestingDeployer", "VestingDeployer", deployers.vestingDeployer],
  ];
  for (const [label, deployerName, address] of deployerBindings) {
    const bound = getAddress(String(await viewAt(ethCall, artifacts[deployerName].abi, address)("factory")));
    if (bound !== getAddress(factoryAddress)) throw new Error(`${label} factory is ${bound}`);
  }

  return {
    description,
    decimals,
    answer: answer.toString(),
    updatedAt: updatedAt.toString(),
    ageSeconds: age.toString(),
    quoteError,
    storage,
    quotes,
    vesting: {
      usdWei: fees.vestingFeeUsdWei.toString(),
      nativeWei: vestingNative.toString(),
      expectedNativeWei: vestingExpected.toString(),
      match: quoteError === null,
    },
  };
}

async function dryRun(artifacts: Record<string, Artifact>, gasOut: { gas?: GasUsage }): Promise<void> {
  const connection = await network.create("hardhatMainnet");
  try {
    const { ethers } = connection;
    const chain = await ethers.provider.getNetwork();
    if (chain.chainId !== LOCAL_CHAIN_ID) {
      throw new Error(`local dry-run connected to chain ${chain.chainId}`);
    }
    const [signer] = await ethers.getSigners();
    const localBlock = await ethers.provider.getBlock("latest");
    const localBase = localBlock?.baseFeePerGas ?? 0n;
    const localFee: TxFee =
      localBase > 0n
        ? { kind: "eip1559", maxFeePerGas: localBase * 2n + 1_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n }
        : { kind: "legacy", gasPrice: 1_000_000_000n };
    const mock = await deployContract(signer, artifacts.MockAggregator, [8, 2000n * 10n ** 8n], localFee);
    for (const name of ["ethereum", "other"] as const) {
      const result = await deployStack(signer, artifacts, FEES[name], mock.address, ZERO, localFee);
      const ethCall: EthCall = async (to, data) =>
        String(await connection.provider.request({ method: "eth_call", params: [{ to, data }, "latest"] }));
      const readback = await readBack(
        ethers.provider,
        ethCall,
        artifacts,
        result.deployed.factory,
        result.deployed,
        FEES[name],
        await signer.getAddress(),
      );
      if (readback.quoteError) throw new Error(`local ${name} quote failed: ${readback.quoteError}`);
      if (name === "ethereum") gasOut.gas = result.gas;
      const price = 2000n * USD;
      const base = quoteNative(FEES[name].baseFeeUsdWei, price, 18);
      const all = quoteNative(usdFor(FEES[name], flagsWith(undefined, true)), price, 18);
      const vesting = quoteNative(FEES[name].vestingFeeUsdWei, price, 18);
      const expectedBase = name === "ethereum" ? 3n * 10n ** 15n : 15n * 10n ** 14n;
      const expectedAll = name === "ethereum" ? 19n * 10n ** 15n : 95n * 10n ** 14n;
      const expectedVesting = name === "ethereum" ? 10n ** 15n : 5n * 10n ** 14n;
      if (base !== expectedBase || all !== expectedAll || vesting !== expectedVesting) {
        throw new Error(`${name} schedule at $2000 did not match the documented native amounts`);
      }
      console.log(
        `dry-run ${name} factory=${result.deployed.factory} base=${formatEther(base)} all7=${formatEther(all)} vesting=${formatEther(vesting)}`,
      );
    }
    if (!gasOut.gas) throw new Error("dry-run did not record gas");
    const gas = gasOut.gas;
    const total =
      gas.tokenDeployer +
      gas.permitDeployer +
      gas.votesDeployer +
      gas.vestingDeployer +
      gas.factory +
      gas.setFactoryEach.reduce((sum, item) => sum + item, 0n);
    console.log(
      `dry-run gas token=${gas.tokenDeployer} permit=${gas.permitDeployer} votes=${gas.votesDeployer} vesting=${gas.vestingDeployer} factory=${gas.factory} setFactory=${gas.setFactoryEach.join("+")} total=${total}`,
    );
  } finally {
    await connection.close();
  }
}

function totalGas(gas: GasUsage): bigint {
  return (
    gas.tokenDeployer +
    gas.permitDeployer +
    gas.votesDeployer +
    gas.vestingDeployer +
    gas.factory +
    gas.setFactoryEach.reduce((sum, item) => sum + item, 0n)
  );
}

function paddedGas(gas: GasUsage): bigint {
  // Live inclusion uses a 20% gas-limit buffer on each of the nine transactions.
  return (totalGas(gas) * 12n) / 10n;
}

async function connectTestnet(spec: Testnet): Promise<{ provider: JsonRpcProvider; urlHost: string }> {
  const override = process.env[spec.rpcEnv];
  const urls = override ? [override, ...spec.rpcUrls] : spec.rpcUrls;
  let last = "no rpc attempted";
  for (const url of urls) {
    const provider = new JsonRpcProvider(url, spec.chainId, { staticNetwork: true });
    try {
      const net = await provider.getNetwork();
      assertAllowedChain(net.chainId, spec.chainId);
      const codeProbe = await provider.getBlockNumber();
      if (codeProbe < 0) throw new Error("negative block");
      return { provider, urlHost: hostOf(url) };
    } catch (error) {
      last = redact(error instanceof Error ? error.message : String(error));
      provider.destroy();
    }
  }
  throw new Error(`${spec.key} RPC failed: ${last}`);
}

async function surveyOne(spec: Testnet, gas: GasUsage) {
  const { provider, urlHost } = await connectTestnet(spec);
  try {
    const wallet = deployerWallet(provider);
    const balance = await provider.getBalance(wallet.address);
    const block = await provider.getBlock("latest");
    const budget = paddedGas(gas);
    let fee: TxFee | null = null;
    let feeError: string | null = null;
    try {
      fee = await feeFor(provider, balance, budget);
    } catch (error) {
      feeError = error instanceof Error ? error.message : String(error);
    }
    const cost = fee ? worstCase(fee, budget) : null;
    const baseFee = block?.baseFeePerGas ?? 0n;
    const costAtBaseFee = baseFee > 0n ? baseFee * budget : null;
    const shortfall = cost !== null && cost > balance ? cost - balance : 0n;
    let feed: Record<string, string> | null = null;
    let feedError: string | null = spec.blockedReason;
    if (spec.priceFeed && !spec.blockedReason) {
      try {
        feed = await inspectFeed(provider, spec);
      } catch (error) {
        feedError = error instanceof Error ? error.message : String(error);
      }
    }
    const enough = cost !== null && balance >= cost && !feedError && !spec.blockedReason;
    console.log(
      `${spec.key} balance=${formatEther(balance)} ${spec.nativeSymbol} block=${block?.number} rpc=${urlHost} costAtMost=${cost === null ? "n/a" : formatEther(cost)} costAtBaseFee=${costAtBaseFee === null ? "n/a" : formatEther(costAtBaseFee)} enough=${enough} feed=${feedError ? "blocked" : "ok"}`,
    );
    if (feedError) console.log(`  ${spec.key} note: ${feedError}`);
    return {
      spec,
      provider,
      balance,
      blockNumber: block?.number ?? null,
      fee,
      feeError,
      cost,
      costAtBaseFee,
      shortfall,
      feed,
      feedError,
      enough,
    };
  } catch (error) {
    provider.destroy();
    throw error;
  }
}

async function inspectFeed(provider: Provider, spec: Testnet): Promise<Record<string, string>> {
  if (!spec.priceFeed) throw new Error("no price feed configured");
  const code = await provider.getCode(spec.priceFeed);
  if (code === "0x") throw new Error(`price feed ${spec.priceFeed} has no code`);
  const feed = new Contract(spec.priceFeed, FEED_ABI, provider);
  const description = String(await feed.description());
  if (description.trim() !== spec.priceFeedPair) {
    throw new Error(`price feed description ${JSON.stringify(description)} is not ${spec.priceFeedPair}`);
  }
  const decimals = Number(await feed.decimals());
  const round = await feed.latestRoundData();
  const block = await provider.getBlock("latest");
  if (!block) throw new Error("missing block");
  const answer = BigInt(round.answer);
  const age = BigInt(block.timestamp) - BigInt(round.updatedAt);
  if (answer <= 0n) throw new Error("price feed answer is not positive");
  if (round.answeredInRound < round.roundId) throw new Error("price feed round is incomplete");
  return {
    address: getAddress(spec.priceFeed),
    description,
    decimals: String(decimals),
    answer: answer.toString(),
    updatedAt: BigInt(round.updatedAt).toString(),
    ageSeconds: age.toString(),
    stale: age > BigInt(MAX_PRICE_AGE_SECONDS) ? "yes" : "no",
  };
}

async function broadcast(spec: Testnet, artifacts: Record<string, Artifact>, survey: Awaited<ReturnType<typeof surveyOne>>) {
  if (spec.blockedReason || survey.feedError || !survey.fee || !spec.priceFeed) {
    throw new Error(`${spec.key} is not broadcast: ${spec.blockedReason ?? survey.feedError ?? survey.feeError}`);
  }
  if (!survey.enough || survey.cost === null) {
    throw new Error(`${spec.key} balance ${formatEther(survey.balance)} is below the buffered cost`);
  }
  const existing = path.join("deployments", `${spec.key}.json`);
  try {
    await readFile(existing, "utf8");
    throw new Error(`${existing} already exists; refusing a second broadcast`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const wallet = deployerWallet(survey.provider);
  assertAllowedChain((await survey.provider.getNetwork()).chainId, spec.chainId);
  console.log(`broadcast ${spec.key} from ${wallet.address}`);
  const result = await deployStack(wallet, artifacts, FEES[spec.schedule], spec.priceFeed, ZERO, survey.fee);
  const record: Record<string, unknown> = {
    network: spec.key,
    title: spec.title,
    chainId: spec.chainId,
    nativeSymbol: spec.nativeSymbol,
    contractsCommit: contractsCommit(),
    deployer: wallet.address,
    feeRecipient: wallet.address,
    feeSchedule: spec.schedule,
    feesUsdWei: Object.fromEntries(Object.entries(FEES[spec.schedule]).map(([key, value]) => [key, value.toString()])),
    priceFeed: {
      address: getAddress(spec.priceFeed),
      pair: spec.priceFeedPair,
      docsUrl: spec.priceFeedDocsUrl,
      listUrl: spec.priceFeedListUrl,
      heartbeatSeconds: spec.heartbeatSeconds,
      survey: survey.feed,
    },
    sequencerUptimeFeed: ZERO,
    sequencerNote: spec.sequencerNote,
    contracts: result.deployed,
    gas: {
      tokenDeployer: result.gas.tokenDeployer.toString(),
      permitDeployer: result.gas.permitDeployer.toString(),
      votesDeployer: result.gas.votesDeployer.toString(),
      vestingDeployer: result.gas.vestingDeployer.toString(),
      factory: result.gas.factory.toString(),
      setFactoryEach: result.gas.setFactoryEach.map((item) => item.toString()),
    },
    feeReadback: null,
    feeReadbackError: null,
    frontendEnv: spec.frontendEnv,
    explorer: {
      factory: `${spec.explorer}/address/${result.deployed.factory}`,
      tokenDeployer: `${spec.explorer}/address/${result.deployed.tokenDeployer}`,
      permitDeployer: `${spec.explorer}/address/${result.deployed.permitDeployer}`,
      votesDeployer: `${spec.explorer}/address/${result.deployed.votesDeployer}`,
      vestingDeployer: `${spec.explorer}/address/${result.deployed.vestingDeployer}`,
    },
    sourceVerification: {
      attempted: false,
      reason: "No explorer API key is configured (ETHERSCAN_API_KEY, ETHERSCAN_V2_API_KEY, BSCSCAN_API_KEY, POLYGONSCAN_API_KEY, ARBISCAN_API_KEY, BASESCAN_API_KEY are unset).",
    },
    deployedAt: new Date().toISOString(),
  };
  await mkdir("deployments", { recursive: true });
  await writeFile(existing, `${JSON.stringify(record, null, 2)}\n`);
  const ethCall: EthCall = (to, data) => survey.provider.send("eth_call", [{ to, data }, "latest"]);
  try {
    record.feeReadback = await readBack(
      survey.provider,
      ethCall,
      artifacts,
      result.deployed.factory,
      result.deployed,
      FEES[spec.schedule],
      wallet.address,
    );
  } catch (error) {
    record.feeReadbackError = redact(error instanceof Error ? error.message : String(error));
    await writeFile(existing, `${JSON.stringify(record, null, 2)}\n`);
    throw error;
  }
  await writeFile(existing, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`wrote ${existing} factory=${result.deployed.factory}`);
  return record;
}

async function main() {
  const wallet = deployerWallet();
  console.log(`deployer ${wallet.address}`);
  const targets = broadcastList();
  const artifacts = await loadArtifacts();
  const gasOut: { gas?: GasUsage } = {};
  await dryRun(artifacts, gasOut);
  const gas = gasOut.gas;
  if (!gas) throw new Error("missing gas measurement");
  console.log(`measured gas with 20% buffer ${paddedGas(gas)}`);

  const surveys = [];
  for (const spec of Object.values(NETWORKS)) {
    surveys.push(await surveyOne(spec, gas));
  }
  for (const name of targets) {
    const spec = NETWORKS[name];
    const found = surveys.find((item) => item.spec.key === name);
    if (!found) throw new Error(`missing survey for ${name}`);
    if (spec.blockedReason) {
      console.log(`skip broadcast ${name}: ${spec.blockedReason}`);
      continue;
    }
    if (!found.enough) {
      const need = found.cost === null ? "unknown" : formatEther(found.shortfall);
      console.log(`skip broadcast ${name}: shortfall ${need} ${spec.nativeSymbol}`);
      continue;
    }
    try {
      await broadcast(spec, artifacts, found);
    } catch (error) {
      console.error(redact(error instanceof Error ? (error.stack ?? error.message) : String(error)));
    }
  }
  for (const item of surveys) item.provider.destroy();
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? (error.stack ?? error.message) : String(error)));
  process.exit(1);
});

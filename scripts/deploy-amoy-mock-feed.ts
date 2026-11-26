/**
 * Polygon Amoy only. Deploys FixedPriceAggregator, the four advanced deployers,
 * and AdvancedTokenFactory, then setFactory.
 *
 * Refuses every chain id except 80002 before it sends anything. A short balance
 * aborts before the first transaction. The signer is TESTNET_DEPLOYER_KEY and
 * this file never prints that value.
 *
 *   npx hardhat run scripts/deploy-amoy-mock-feed.ts --network hardhatMainnet
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
  formatEther,
  getAddress,
  type InterfaceAbi,
  type Provider,
  type Signer,
  type TransactionReceipt,
  type TransactionResponse,
} from "ethers";

const AMOY_CHAIN_ID = 80002n;
const EXPECTED_DEPLOYER = "0x8A8D159DdF5FcE044192Ddd720D2EF4a4459Eb05";
const ZERO = "0x0000000000000000000000000000000000000000";
const USD = 10n ** 18n;
const REQUESTED_MAX_FEE = 30n * 1_000_000_000n;
const MIN_TIP = 25n * 1_000_000_000n;
const FACTORY_COMMIT = "5fb7fed88e31618955b341ccf70639079759946d";
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=polygon-ecosystem-token&vs_currencies=usd&include_last_updated_at=true";
const KRAKEN_URL = "https://api.kraken.com/0/public/Ticker?pair=POLUSD";
const RPCS = ["https://polygon-amoy-bor-rpc.publicnode.com", "https://rpc-amoy.polygon.technology"];
const MAINNET_CHAIN_IDS = new Set<bigint>([1n, 10n, 56n, 137n, 324n, 1101n, 8453n, 34443n, 42161n, 59144n, 81457n, 534352n]);

const OTHER_FEES = {
  baseFeeUsdWei: 3n * USD,
  mintFeeUsdWei: 1n * USD,
  burnFeeUsdWei: 1n * USD,
  distributionFeeUsdWei: 1n * USD,
  pauseFeeUsdWei: 1n * USD,
  transferFeeUsdWei: 10n * USD,
  permitFeeUsdWei: 1n * USD,
  votesFeeUsdWei: 1n * USD,
  vestingFeeUsdWei: 1n * USD,
};

const ALL_SEVEN_USD = 19n * USD;
const NO_FLAGS = {
  initialDistribution: false,
  mint: false,
  burn: false,
  pause: false,
  transferFee: false,
  permit: false,
  votes: false,
};
const ALL_FLAGS = {
  initialDistribution: true,
  mint: true,
  burn: true,
  pause: true,
  transferFee: true,
  permit: true,
  votes: true,
};
const FLAG_NAMES = ["initialDistribution", "mint", "burn", "pause", "transferFee", "permit", "votes"] as const;

type Artifact = { abi: InterfaceAbi; bytecode: string };
type NamedGas = Record<string, bigint>;

function redact(text: string): string {
  return text.replace(/0x[0-9a-fA-F]{64}/g, "0x[redacted]");
}

function assertAmoy(chainId: bigint): void {
  if (MAINNET_CHAIN_IDS.has(chainId)) {
    throw new Error(`refusing chain id ${chainId}: mainnet is out of scope`);
  }
  if (chainId !== AMOY_CHAIN_ID) {
    throw new Error(`refusing chain id ${chainId}: deploy-amoy-mock-feed.ts only runs on Polygon Amoy (80002)`);
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

function decimalTo8(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`price ${value} is not a positive decimal`);
  const [whole, frac = ""] = trimmed.split(".");
  const digits = (frac + "000000000").slice(0, 9);
  let scaled = BigInt(whole) * 100_000_000n + BigInt(digits.slice(0, 8));
  if (digits[8] >= "5") scaled += 1n;
  return scaled;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "future-constructor-contracts" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

async function polUsdPrice(): Promise<{
  priceUsd: string;
  answer: bigint;
  source: string;
  sourceTime: string;
  fetchedAt: string;
  crossCheck: string | null;
}> {
  const fetchedAt = new Date().toISOString();
  let primary: { priceUsd: string; answer: bigint; source: string; sourceTime: string } | null = null;
  let crossCheck: string | null = null;
  try {
    const raw = await fetchText(COINGECKO_URL);
    const usd = raw.match(/"usd"\s*:\s*([0-9]+(?:\.[0-9]+)?)/);
    const updated = raw.match(/"last_updated_at"\s*:\s*([0-9]+)/);
    if (!usd || !updated) throw new Error("CoinGecko response has no POL price");
    primary = {
      priceUsd: usd[1],
      answer: decimalTo8(usd[1]),
      source: COINGECKO_URL,
      sourceTime: new Date(Number(updated[1]) * 1000).toISOString(),
    };
  } catch (error) {
    console.log(`CoinGecko unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const raw = await fetchText(KRAKEN_URL);
    const last = raw.match(/"c"\s*:\s*\[\s*"([0-9]+(?:\.[0-9]+)?)"/);
    if (last) crossCheck = `Kraken POLUSD last ${last[1]} at ${fetchedAt} (${KRAKEN_URL})`;
    if (!primary && last) {
      primary = {
        priceUsd: last[1],
        answer: decimalTo8(last[1]),
        source: KRAKEN_URL,
        sourceTime: fetchedAt,
      };
    }
  } catch (error) {
    console.log(`Kraken unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!primary || primary.answer <= 0n) throw new Error("no public POL/USD price");
  return { ...primary, fetchedAt, crossCheck };
}

async function loadArtifacts(): Promise<Record<string, Artifact>> {
  const names = ["FixedPriceAggregator", "TokenDeployer", "PermitDeployer", "VotesDeployer", "VestingDeployer", "AdvancedTokenFactory"];
  const out: Record<string, Artifact> = {};
  for (const name of names) {
    const artifact = await hardhatArtifacts.readArtifact(name);
    out[name] = { abi: artifact.abi, bytecode: artifact.bytecode };
  }
  return out;
}

function assertFactorySources(): void {
  const changed = execSync(`git diff --name-only ${FACTORY_COMMIT} -- contracts/advanced contracts/vendor`, { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".sol"));
  if (changed.length > 0) {
    throw new Error(`advanced contract sources differ from ${FACTORY_COMMIT}: ${changed.join(", ")}`);
  }
}

async function connectAmoy(): Promise<JsonRpcProvider> {
  const override = process.env.TESTNET_RPC_AMOY;
  const urls = override ? [override, ...RPCS] : RPCS;
  let last = "no rpc";
  for (const url of urls) {
    const provider = new JsonRpcProvider(url, 80002, { staticNetwork: true });
    try {
      const chainId = (await provider.getNetwork()).chainId;
      assertAmoy(chainId);
      return provider;
    } catch (error) {
      last = redact(error instanceof Error ? error.message : String(error));
      provider.destroy();
    }
  }
  throw new Error(`Amoy RPC failed: ${last}`);
}

async function waitReceipt(response: TransactionResponse): Promise<TransactionReceipt> {
  const receipt = await response.wait(1, 240_000);
  if (!receipt || receipt.status !== 1) throw new Error(`transaction ${response.hash} was not successful`);
  return receipt;
}

function inclusionFee(base: bigint): { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } {
  // Amoy rejects a tip under 25 gwei. A 30 gwei max fee cannot pay that tip while the base fee is 30 gwei.
  const maxPriorityFeePerGas = MIN_TIP;
  const maxFeePerGas = base + maxPriorityFeePerGas;
  return {
    maxFeePerGas: maxFeePerGas > REQUESTED_MAX_FEE ? maxFeePerGas : REQUESTED_MAX_FEE,
    maxPriorityFeePerGas,
  };
}

async function send(
  provider: JsonRpcProvider,
  signer: Wallet,
  tx: { to?: string | null; data?: string | null },
  gasLimit: bigint,
): Promise<TransactionReceipt> {
  const chainId = (await provider.getNetwork()).chainId;
  assertAmoy(chainId);
  const base = (await provider.getBlock("latest"))?.baseFeePerGas ?? 0n;
  const fee = inclusionFee(base);
  const balance = await provider.getBalance(await signer.getAddress());
  if (fee.maxFeePerGas * gasLimit > balance) {
    throw new Error(
      `not sending: this transaction needs ${formatEther(fee.maxFeePerGas * gasLimit)} POL and the balance is ${formatEther(balance)} POL`,
    );
  }
  let response: TransactionResponse;
  try {
    response = await signer.sendTransaction({
      ...tx,
      chainId: AMOY_CHAIN_ID,
      type: 2,
      maxFeePerGas: fee.maxFeePerGas,
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
      gasLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = message.match(/"message":\s*"([^"]+)"/)?.[1] ?? message.split("payload=")[0];
    throw new Error(redact(reason).slice(0, 300));
  }
  return waitReceipt(response);
}

async function measureLocal(artifacts: Record<string, Artifact>, price: bigint): Promise<NamedGas> {
  const connection = await network.create("hardhatMainnet");
  try {
    const { ethers } = connection;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    if (chainId !== 31337n) throw new Error(`local measurement connected to ${chainId}`);
    const [signer] = await ethers.getSigners();
    const owner = await signer.getAddress();
    const fee = { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n };
    const gas: NamedGas = {};
    const deploy = async (name: string, args: unknown[]) => {
      const factory = new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, signer);
      const unsigned = await factory.getDeployTransaction(...args);
      const gasLimit = ((await signer.estimateGas(unsigned)) * 12n) / 10n;
      const response = await signer.sendTransaction({ ...unsigned, ...fee, gasLimit });
      const receipt = await waitReceipt(response);
      if (!receipt.contractAddress) throw new Error(`${name} dry-run has no address`);
      gas[name] = receipt.gasUsed;
      return getAddress(receipt.contractAddress);
    };
    const mock = await deploy("FixedPriceAggregator", ["POL / USD", price]);
    const token = await deploy("TokenDeployer", [owner]);
    const permit = await deploy("PermitDeployer", [owner]);
    const votes = await deploy("VotesDeployer", [owner]);
    const vesting = await deploy("VestingDeployer", [owner]);
    const factoryAddress = await deploy("AdvancedTokenFactory", [
      mock,
      ZERO,
      owner,
      OTHER_FEES,
      { token, permit, votes, vesting },
    ]);
    for (const [label, artifactName, address] of [
      ["setFactoryToken", "TokenDeployer", token],
      ["setFactoryPermit", "PermitDeployer", permit],
      ["setFactoryVotes", "VotesDeployer", votes],
      ["setFactoryVesting", "VestingDeployer", vesting],
    ] as const) {
      const contract = new Contract(address, artifacts[artifactName].abi, signer);
      const populated = await contract.getFunction("setFactory").populateTransaction(factoryAddress);
      const gasLimit = ((await signer.estimateGas(populated)) * 15n) / 10n;
      const response = await signer.sendTransaction({ ...populated, ...fee, gasLimit });
      gas[label] = (await waitReceipt(response)).gasUsed;
    }
    return gas;
  } finally {
    await connection.close();
  }
}

async function estimateLive(
  provider: JsonRpcProvider,
  from: string,
  artifacts: Record<string, Artifact>,
  price: bigint,
  local: NamedGas,
): Promise<NamedGas> {
  const factoryFor = (name: string) => new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, provider);
  const live: NamedGas = {};
  const mockTx = await factoryFor("FixedPriceAggregator").getDeployTransaction("POL / USD", price);
  live.FixedPriceAggregator = await provider.estimateGas({ ...mockTx, from });
  for (const name of ["TokenDeployer", "PermitDeployer", "VotesDeployer", "VestingDeployer"] as const) {
    const tx = await factoryFor(name).getDeployTransaction(from);
    live[name] = await provider.estimateGas({ ...tx, from });
  }
  const scaleNumerator = live.TokenDeployer > local.TokenDeployer ? live.TokenDeployer : local.TokenDeployer;
  const scale = scaleNumerator;
  const base = local.TokenDeployer === 0n ? 1n : local.TokenDeployer;
  const project = (measured: bigint) => (measured * scale + base - 1n) / base;
  live.AdvancedTokenFactory = project(local.AdvancedTokenFactory);
  for (const name of ["setFactoryToken", "setFactoryPermit", "setFactoryVotes", "setFactoryVesting"]) {
    const projected = project(local[name]);
    live[name] = projected < 100_000n ? 100_000n : projected;
  }
  return live;
}

function sumGas(gas: NamedGas): bigint {
  return Object.values(gas).reduce((total, value) => total + value, 0n);
}

function quote(feeUsd: bigint, answer: bigint): bigint {
  const normalized = answer * 10n ** 10n;
  return (feeUsd * USD) / normalized;
}

async function readBack(provider: Provider, artifacts: Record<string, Artifact>, factoryAddress: string, answer: bigint) {
  const iface = new Interface(artifacts.AdvancedTokenFactory.abi);
  const call = async (method: string, args: unknown[] = []) => {
    const data = iface.encodeFunctionData(method, args);
    const raw = await provider.call({ to: factoryAddress, data });
    const decoded = iface.decodeFunctionResult(method, raw);
    return decoded.length <= 1 ? decoded[0] : decoded;
  };
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
  const storage: Record<string, string> = {};
  for (const name of storageNames) {
    const actual = BigInt(await call(name));
    if (actual !== OTHER_FEES[name]) throw new Error(`${name} is ${actual}, schedule is ${OTHER_FEES[name]}`);
    storage[name] = actual.toString();
  }
  const flags: Record<string, { usdWei: string; nativeWei: string; expectedNativeWei: string; match: boolean }> = {};
  const check = async (label: string, flag: typeof NO_FLAGS, usdAmount: bigint) => {
    const native = BigInt(await call("currentFee", [flag]));
    const expected = quote(usdAmount, answer);
    if (native !== expected) throw new Error(`${label} currentFee ${native} != ${expected}`);
    flags[label] = {
      usdWei: usdAmount.toString(),
      nativeWei: native.toString(),
      expectedNativeWei: expected.toString(),
      match: true,
    };
  };
  await check("base", NO_FLAGS, OTHER_FEES.baseFeeUsdWei);
  for (const name of FLAG_NAMES) {
    const flag = { ...NO_FLAGS, [name]: true };
    const usdAmount =
      OTHER_FEES.baseFeeUsdWei +
      (name === "mint"
        ? OTHER_FEES.mintFeeUsdWei
        : name === "burn"
          ? OTHER_FEES.burnFeeUsdWei
          : name === "initialDistribution"
            ? OTHER_FEES.distributionFeeUsdWei
            : name === "pause"
              ? OTHER_FEES.pauseFeeUsdWei
              : name === "transferFee"
                ? OTHER_FEES.transferFeeUsdWei
                : name === "permit"
                  ? OTHER_FEES.permitFeeUsdWei
                  : OTHER_FEES.votesFeeUsdWei);
    await check(name, flag, usdAmount);
  }
  await check("allSevenFlags", ALL_FLAGS, ALL_SEVEN_USD);
  const vestingNative = BigInt(await call("currentVestingFee"));
  const vestingExpected = quote(OTHER_FEES.vestingFeeUsdWei, answer);
  if (vestingNative !== vestingExpected) throw new Error(`currentVestingFee ${vestingNative} != ${vestingExpected}`);
  if (flags.base.usdWei !== (3n * USD).toString()) throw new Error("base USD is not $3");
  if (flags.allSevenFlags.usdWei !== ALL_SEVEN_USD.toString()) throw new Error("all-flags USD is not $19");
  return {
    storage,
    flags,
    vesting: {
      usdWei: OTHER_FEES.vestingFeeUsdWei.toString(),
      nativeWei: vestingNative.toString(),
      expectedNativeWei: vestingExpected.toString(),
      match: true,
    },
  };
}

const PARTIAL = {
  mock: { address: "0x2370A5fd4afa4f2424bb1C1c90393a167D488d35", hash: "0x0831990e58899d3d05b414ed277e6a4d96ceb38d2dbbe8e99e8f64e971a2e9d2", blockNumber: 53891153, gasUsed: "244454" },
  token: { address: "0xB5DF6da2f4BFdd9b7141659807f742B50a132264", hash: "0x9f310885466cf43c5f3e2ebb101012909715bba2adfe0d5036a7b65c92445fde", blockNumber: 53891159, gasUsed: "2769179" },
  permit: { address: "0x644cf7f123287d6EE260dc459178596cd2dD2621", hash: "0xcaf723912222a01ad311f266f880c2b64121ea7d41641adcafc2832569fe685e", blockNumber: 53891163, gasUsed: "3249211" },
  votes: { address: "0x372cD839b943bb72e314B10744f138b526df9044", hash: "0x88526601ee07cd90f376350bda2fe0438f9a202f96a605ec75cf3f35e2e49f9e", blockNumber: 53891168, gasUsed: "4294482" },
  vesting: { address: "0x58b77312FA3Df4c84776a1943CfD4ec752D4d508", hash: "0x913a0163c33e7283815c91632bbdf2b5a2462513184a40655acf0c16b26735b3", blockNumber: 53891172, gasUsed: "1086421" },
  factory: { address: "0xa75332F2e91755AeBFBE0d955563fCF3a352b384", hash: "0x02bf00fbfd9ef64028f95a7aeef0e351317f8386c55fde1a58934d4c2be8c5f3", blockNumber: 53891177, gasUsed: "2603554" },
};

const DEPLOYED_PRICE = {
  priceUsd: "0.07677",
  answer: 7_677_000n,
  source: COINGECKO_URL,
  sourceTime: "2026-11-26T17:23:44.000Z",
  fetchedAt: "2026-11-26T17:24:48.072Z",
  crossCheck: `Kraken POLUSD last 0.076850000 at 2026-11-26T17:24:48.072Z (${KRAKEN_URL})`,
};

async function isPartialDeployment(provider: Provider, deployer: string): Promise<boolean> {
  const code = await provider.getCode(PARTIAL.factory.address);
  if (code === "0x") return false;
  const ownerCall = new Interface(["function owner() view returns (address)"]);
  const feedCall = new Interface(["function priceFeed() view returns (address)"]);
  const ownerRaw = await provider.call({ to: PARTIAL.token.address, data: ownerCall.encodeFunctionData("owner") });
  const feedRaw = await provider.call({ to: PARTIAL.factory.address, data: feedCall.encodeFunctionData("priceFeed") });
  const owner = getAddress(ownerCall.decodeFunctionResult("owner", ownerRaw)[0]);
  const feed = getAddress(feedCall.decodeFunctionResult("priceFeed", feedRaw)[0]);
  return owner === getAddress(deployer) && feed === getAddress(PARTIAL.mock.address);
}

async function finishPartial(provider: JsonRpcProvider, signer: Wallet, artifacts: Record<string, Artifact>) {
  console.log("resuming Amoy: contracts are already deployed, wiring setFactory");
  const bound = new Interface(["function factory() view returns (address)"]);
  const deployers: Array<[string, string, string]> = [
    ["setFactoryToken", "TokenDeployer", PARTIAL.token.address],
    ["setFactoryPermit", "PermitDeployer", PARTIAL.permit.address],
    ["setFactoryVotes", "VotesDeployer", PARTIAL.votes.address],
    ["setFactoryVesting", "VestingDeployer", PARTIAL.vesting.address],
  ];
  for (const [, , address] of deployers) {
    const raw = await provider.call({ to: address, data: bound.encodeFunctionData("factory") });
    const current = getAddress(bound.decodeFunctionResult("factory", raw)[0]);
    if (current !== ZERO && current !== getAddress(PARTIAL.factory.address)) {
      throw new Error(`${address} is bound to ${current}`);
    }
  }
  const answerRaw = await provider.call({
    to: PARTIAL.mock.address,
    data: new Interface(["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"]).encodeFunctionData("latestRoundData"),
  });
  const answer = BigInt(
    new Interface(["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"]).decodeFunctionResult(
      "latestRoundData",
      answerRaw,
    )[1],
  );
  if (answer !== DEPLOYED_PRICE.answer) throw new Error(`on-chain price ${answer} is not the deployed answer`);

  const block = await provider.getBlock("latest");
  const fee = inclusionFee(block?.baseFeePerGas ?? 0n);
  const balanceNow = await provider.getBalance(signer.address);
  let worst = 0n;
  const estimates: Record<string, bigint> = {};
  for (const [label, artifactName, address] of deployers) {
    const contract = new Contract(address, artifacts[artifactName].abi, signer);
    const populated = await contract.getFunction("setFactory").populateTransaction(PARTIAL.factory.address);
    const current = getAddress(
      bound.decodeFunctionResult("factory", await provider.call({ to: address, data: bound.encodeFunctionData("factory") }))[0],
    );
    estimates[label] = current === getAddress(PARTIAL.factory.address) ? 0n : await provider.estimateGas({ ...populated, from: signer.address });
    worst += ((estimates[label] * 12n) / 10n) * fee.maxFeePerGas;
  }
  if (worst > balanceNow) {
    console.log(`NOT DEPLOYED further. setFactory shortfall ${formatEther(worst - balanceNow)} POL. Creations already exist; no additional transaction sent.`);
    return;
  }
  const receipts: Record<string, { hash: string; blockNumber: number; gasUsed: string }> = {};
  const factorySet = new Interface(["event FactorySet(address indexed factory)"]);
  for (const [label, artifactName, address] of deployers) {
    if (estimates[label] === 0n) {
      const logs = await provider.getLogs({
        address,
        topics: [factorySet.getEvent("FactorySet")!.topicHash],
        fromBlock: 53891100,
        toBlock: "latest",
      });
      const log = logs[logs.length - 1];
      if (!log) throw new Error(`${label} is already bound but its FactorySet log was not found`);
      const receipt = await provider.getTransactionReceipt(log.transactionHash);
      if (!receipt) throw new Error(`${label} receipt is missing`);
      receipts[label] = { hash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() };
      continue;
    }
    const contract = new Contract(address, artifacts[artifactName].abi, signer);
    const populated = await contract.getFunction("setFactory").populateTransaction(PARTIAL.factory.address);
    if (!populated.data || populated.data === "0x") throw new Error(`${label} calldata is empty`);
    const gasLimit = (estimates[label] * 12n) / 10n;
    const receipt = await send(provider, signer, populated, gasLimit);
    receipts[label] = { hash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() };
    console.log(`  ${label} ${receipt.hash}`);
  }
  const readback = await readBack(provider, artifacts, PARTIAL.factory.address, answer);
  const balanceAfter = await provider.getBalance(signer.address);
  const stored = (item: { hash: string; blockNumber: number; gasUsed: string }) => ({
    hash: item.hash,
    blockNumber: item.blockNumber,
    gasUsed: item.gasUsed,
  });
  const sent = (label: string) => {
    const receipt = receipts[label];
    if (!receipt) throw new Error(`${label} was not sent`);
    return receipt;
  };
  const record = {
    network: "polygon-amoy",
    title: "Polygon Amoy",
    chainId: 80002,
    nativeSymbol: "POL",
    contractsCommit: FACTORY_COMMIT,
    note: "AdvancedTokenFactory bytecode matches 5fb7fed. The price feed is FixedPriceAggregator, deployed only on chain id 80002. Chainlink publishes no POL/USD feed on Amoy. The first setFactory attempt used a gas limit below the Amoy estimate and reverted out of gas; the successful setFactory transactions are the ones recorded here.",
    deployer: signer.address,
    feeRecipient: signer.address,
    feeSchedule: "other",
    feesUsdWei: Object.fromEntries(Object.entries(OTHER_FEES).map(([key, value]) => [key, value.toString()])),
    priceFeed: {
      kind: "FixedPriceAggregator",
      address: PARTIAL.mock.address,
      pair: "POL / USD",
      decimals: 8,
      answer: answer.toString(),
      priceUsd: DEPLOYED_PRICE.priceUsd,
      source: DEPLOYED_PRICE.source,
      sourceTime: DEPLOYED_PRICE.sourceTime,
      fetchedAt: DEPLOYED_PRICE.fetchedAt,
      crossCheck: DEPLOYED_PRICE.crossCheck,
      description: "POL / USD",
    },
    sequencerUptimeFeed: ZERO,
    sequencerNote: "Chainlink publishes no L2 sequencer uptime feed for Polygon Amoy. The factory treats address(0) as the disabled check.",
    mockAggregator: {
      contract: "contracts/mocks/FixedPriceAggregator.sol:FixedPriceAggregator",
      address: PARTIAL.mock.address,
      description: "POL / USD",
      price: answer.toString(),
    },
    contracts: {
      tokenDeployer: PARTIAL.token.address,
      permitDeployer: PARTIAL.permit.address,
      votesDeployer: PARTIAL.votes.address,
      vestingDeployer: PARTIAL.vesting.address,
      factory: PARTIAL.factory.address,
      fixedPriceAggregator: PARTIAL.mock.address,
      receipts: {
        fixedPriceAggregator: stored(PARTIAL.mock),
        tokenDeployer: stored(PARTIAL.token),
        permitDeployer: stored(PARTIAL.permit),
        votesDeployer: stored(PARTIAL.votes),
        vestingDeployer: stored(PARTIAL.vesting),
        factory: stored(PARTIAL.factory),
        setFactoryToken: sent("setFactoryToken"),
        setFactoryPermit: sent("setFactoryPermit"),
        setFactoryVotes: sent("setFactoryVotes"),
        setFactoryVesting: sent("setFactoryVesting"),
      },
    },
    feeReadback: readback,
    balanceBeforeWei: (10n ** 18n).toString(),
    balanceAfterWei: balanceAfter.toString(),
    maxFeePerGas: fee.maxFeePerGas.toString(),
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas.toString(),
    feeNote:
      "The Amoy RPC minimum tip is 25 gwei. With a 30 gwei base fee, a 30 gwei max fee leaves a zero tip and is rejected before it enters the mempool. maxFeePerGas is base fee plus that 25 gwei minimum.",
    frontendEnv: "NEXT_PUBLIC_ADVANCED_FACTORY_AMOY",
    explorer: {
      factory: `https://amoy.polygonscan.com/address/${PARTIAL.factory.address}`,
      tokenDeployer: `https://amoy.polygonscan.com/address/${PARTIAL.token.address}`,
      permitDeployer: `https://amoy.polygonscan.com/address/${PARTIAL.permit.address}`,
      votesDeployer: `https://amoy.polygonscan.com/address/${PARTIAL.votes.address}`,
      vestingDeployer: `https://amoy.polygonscan.com/address/${PARTIAL.vesting.address}`,
      fixedPriceAggregator: `https://amoy.polygonscan.com/address/${PARTIAL.mock.address}`,
    },
    sourceVerification: {
      attempted: false,
      reason: "Sourcify verification runs from scripts/verify-sourcify-testnets.ts after this file is written.",
    },
    deployedAt: new Date().toISOString(),
  };
  await mkdir("deployments", { recursive: true });
  await writeFile(path.join("deployments", "polygon-amoy.json"), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`wrote deployments/polygon-amoy.json`);
  console.log(
    `fees base=${formatEther(BigInt(readback.flags.base.nativeWei))} all7=${formatEther(BigInt(readback.flags.allSevenFlags.nativeWei))} vesting=${formatEther(BigInt(readback.vesting.nativeWei))} POL`,
  );
  console.log(`balance after ${formatEther(balanceAfter)} POL`);
}

async function main() {
  assertFactorySources();
  const wallet = deployerWallet();
  console.log(`deployer ${wallet.address}`);
  const existing = path.join("deployments", "polygon-amoy.json");
  try {
    await readFile(existing, "utf8");
    throw new Error(`${existing} already exists; refusing a second broadcast`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const price = await polUsdPrice();
  console.log(
    `POL/USD ${price.priceUsd} answer=${price.answer} sourceTime=${price.sourceTime} fetchedAt=${price.fetchedAt}`,
  );
  if (price.crossCheck) console.log(price.crossCheck);

  const artifacts = await loadArtifacts();
  const local = await measureLocal(artifacts, price.answer);
  const provider = await connectAmoy();
  try {
    const signer = deployerWallet(provider);
    if (await isPartialDeployment(provider, signer.address)) {
      await finishPartial(provider, signer, artifacts);
      return;
    }
    const balanceBefore = await provider.getBalance(signer.address);
    const live = await estimateLive(provider, signer.address, artifacts, price.answer, local);
    const block = await provider.getBlock("latest");
    const base = block?.baseFeePerGas ?? 0n;
    const fee = inclusionFee(base);
    const gasNeeded = sumGas(live);
    const costAt30 = gasNeeded * REQUESTED_MAX_FEE;
    const cost = gasNeeded * fee.maxFeePerGas;
    console.log(`balance ${formatEther(balanceBefore)} POL base=${base}`);
    for (const [name, gas] of Object.entries(live)) {
      console.log(`  estimate ${name} gas=${gas} costAtInclusion=${formatEther(gas * fee.maxFeePerGas)} POL`);
    }
    console.log(
      `estimated total gas=${gasNeeded} costAt30Gwei=${formatEther(costAt30)} POL costAtInclusion=${formatEther(cost)} POL maxFee=${fee.maxFeePerGas} priority=${fee.maxPriorityFeePerGas}`,
    );
    if (cost > balanceBefore) {
      console.log(
        `NOT DEPLOYED. Shortfall ${formatEther(cost - balanceBefore)} POL at maxFee ${formatEther(fee.maxFeePerGas)} POL for the estimated gas. A 30 gwei max fee is ${formatEther(costAt30)} POL, and the Amoy RPC still rejects it because the minimum tip is 25 gwei.`,
      );
      return;
    }

    const limits: NamedGas = {};
    for (const [name, gas] of Object.entries(live)) limits[name] = (gas * 11n) / 10n;
    const buffered = sumGas(limits) * fee.maxFeePerGas;
    const gasLimitFor = (name: string) => (buffered <= balanceBefore ? limits[name] : live[name]);
    const limitCost = sumGas(Object.fromEntries(Object.keys(live).map((name) => [name, gasLimitFor(name)]))) * fee.maxFeePerGas;
    if (limitCost > balanceBefore) {
      console.log(`NOT DEPLOYED. Shortfall ${formatEther(cost - balanceBefore)} POL.`);
      return;
    }

    console.log(
      `broadcast polygon-amoy maxFee=${formatEther(fee.maxFeePerGas)} POL priority=${formatEther(fee.maxPriorityFeePerGas)} POL worstCase=${formatEther(limitCost)} POL`,
    );
    const deploy = async (name: string, args: unknown[]) => {
      const factory = new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, signer);
      const unsigned = await factory.getDeployTransaction(...args);
      const receipt = await send(provider, signer, unsigned, gasLimitFor(name));
      if (!receipt.contractAddress) throw new Error(`${name} receipt has no address`);
      console.log(`  ${name} ${receipt.contractAddress}`);
      return { address: getAddress(receipt.contractAddress), receipt };
    };

    const mock = await deploy("FixedPriceAggregator", ["POL / USD", price.answer]);
    const token = await deploy("TokenDeployer", [signer.address]);
    const permit = await deploy("PermitDeployer", [signer.address]);
    const votes = await deploy("VotesDeployer", [signer.address]);
    const vesting = await deploy("VestingDeployer", [signer.address]);
    const factoryTx = await deploy("AdvancedTokenFactory", [
      mock.address,
      ZERO,
      signer.address,
      OTHER_FEES,
      { token: token.address, permit: permit.address, votes: votes.address, vesting: vesting.address },
    ]);
    const bind = async (label: string, artifactName: string, address: string) => {
      const contract = new Contract(address, artifacts[artifactName].abi, signer);
      const populated = await contract.getFunction("setFactory").populateTransaction(factoryTx.address);
      const receipt = await send(provider, signer, populated, gasLimitFor(label));
      console.log(`  ${label} ${receipt.hash}`);
      return receipt;
    };
    const setToken = await bind("setFactoryToken", "TokenDeployer", token.address);
    const setPermit = await bind("setFactoryPermit", "PermitDeployer", permit.address);
    const setVotes = await bind("setFactoryVotes", "VotesDeployer", votes.address);
    const setVesting = await bind("setFactoryVesting", "VestingDeployer", vesting.address);

    const readback = await readBack(provider, artifacts, factoryTx.address, price.answer);
    const balanceAfter = await provider.getBalance(signer.address);
    const receiptOf = (receipt: TransactionReceipt) => ({
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });
    const record = {
      network: "polygon-amoy",
      title: "Polygon Amoy",
      chainId: 80002,
      nativeSymbol: "POL",
      contractsCommit: FACTORY_COMMIT,
      note: "AdvancedTokenFactory bytecode matches 5fb7fed. The price feed is FixedPriceAggregator, deployed only on chain id 80002. Chainlink publishes no POL/USD feed on Amoy.",
      deployer: signer.address,
      feeRecipient: signer.address,
      feeSchedule: "other",
      feesUsdWei: Object.fromEntries(Object.entries(OTHER_FEES).map(([key, value]) => [key, value.toString()])),
      priceFeed: {
        kind: "FixedPriceAggregator",
        address: mock.address,
        pair: "POL / USD",
        decimals: 8,
        answer: price.answer.toString(),
        priceUsd: price.priceUsd,
        source: price.source,
        sourceTime: price.sourceTime,
        fetchedAt: price.fetchedAt,
        crossCheck: price.crossCheck,
        description: "POL / USD",
      },
      sequencerUptimeFeed: ZERO,
      sequencerNote:
        "Chainlink publishes no L2 sequencer uptime feed for Polygon Amoy. The factory treats address(0) as the disabled check.",
      mockAggregator: {
        contract: "contracts/mocks/FixedPriceAggregator.sol:FixedPriceAggregator",
        address: mock.address,
        description: "POL / USD",
        price: price.answer.toString(),
      },
      contracts: {
        tokenDeployer: token.address,
        permitDeployer: permit.address,
        votesDeployer: votes.address,
        vestingDeployer: vesting.address,
        factory: factoryTx.address,
        fixedPriceAggregator: mock.address,
        receipts: {
          fixedPriceAggregator: receiptOf(mock.receipt),
          tokenDeployer: receiptOf(token.receipt),
          permitDeployer: receiptOf(permit.receipt),
          votesDeployer: receiptOf(votes.receipt),
          vestingDeployer: receiptOf(vesting.receipt),
          factory: receiptOf(factoryTx.receipt),
          setFactoryToken: receiptOf(setToken),
          setFactoryPermit: receiptOf(setPermit),
          setFactoryVotes: receiptOf(setVotes),
          setFactoryVesting: receiptOf(setVesting),
        },
      },
      feeReadback: readback,
      balanceBeforeWei: balanceBefore.toString(),
      balanceAfterWei: balanceAfter.toString(),
      maxFeePerGas: fee.maxFeePerGas.toString(),
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas.toString(),
      feeNote:
        "The Amoy RPC minimum tip is 25 gwei. With a 30 gwei base fee, a 30 gwei max fee leaves a zero tip and is rejected before it enters the mempool. maxFeePerGas is base fee plus that 25 gwei minimum.",
      gasEstimate: Object.fromEntries(Object.entries(live).map(([key, value]) => [key, value.toString()])),
      frontendEnv: "NEXT_PUBLIC_ADVANCED_FACTORY_AMOY",
      explorer: {
        factory: `https://amoy.polygonscan.com/address/${factoryTx.address}`,
        tokenDeployer: `https://amoy.polygonscan.com/address/${token.address}`,
        permitDeployer: `https://amoy.polygonscan.com/address/${permit.address}`,
        votesDeployer: `https://amoy.polygonscan.com/address/${votes.address}`,
        vestingDeployer: `https://amoy.polygonscan.com/address/${vesting.address}`,
        fixedPriceAggregator: `https://amoy.polygonscan.com/address/${mock.address}`,
      },
      sourceVerification: {
        attempted: false,
        reason: "Sourcify verification runs from scripts/verify-sourcify-testnets.ts after this file is written.",
      },
      deployedAt: new Date().toISOString(),
    };
    await mkdir("deployments", { recursive: true });
    await writeFile(existing, `${JSON.stringify(record, null, 2)}\n`);
    console.log(`wrote ${existing}`);
    console.log(
      `fees base=${formatEther(BigInt(readback.flags.base.nativeWei))} all7=${formatEther(BigInt(readback.flags.allSevenFlags.nativeWei))} vesting=${formatEther(BigInt(readback.vesting.nativeWei))} POL`,
    );
    console.log(`balance after ${formatEther(balanceAfter)} POL`);
  } finally {
    provider.destroy();
  }
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? (error.stack ?? error.message) : String(error)));
  process.exit(1);
});

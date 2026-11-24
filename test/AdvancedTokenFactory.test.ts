import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const USD = 10n ** 18n;
const EIP170 = 24_576;

const ethFees = {
  baseFeeUsdWei: 6n * USD,
  mintFeeUsdWei: 2n * USD,
  burnFeeUsdWei: 2n * USD,
  distributionFeeUsdWei: 2n * USD,
  pauseFeeUsdWei: 2n * USD,
  transferFeeUsdWei: 20n * USD,
  permitFeeUsdWei: 0n,
  votesFeeUsdWei: 0n,
  vestingFeeUsdWei: 0n,
};

const otherFees = {
  baseFeeUsdWei: 3n * USD,
  mintFeeUsdWei: 1n * USD,
  burnFeeUsdWei: 1n * USD,
  distributionFeeUsdWei: 1n * USD,
  pauseFeeUsdWei: 1n * USD,
  transferFeeUsdWei: 10n * USD,
  permitFeeUsdWei: 0n,
  votesFeeUsdWei: 0n,
  vestingFeeUsdWei: 0n,
};

const zeroFees = {
  baseFeeUsdWei: 0n,
  mintFeeUsdWei: 0n,
  burnFeeUsdWei: 0n,
  distributionFeeUsdWei: 0n,
  pauseFeeUsdWei: 0n,
  transferFeeUsdWei: 0n,
  permitFeeUsdWei: 0n,
  votesFeeUsdWei: 0n,
  vestingFeeUsdWei: 0n,
};

const noFlags = {
  initialDistribution: false,
  mint: false,
  burn: false,
  pause: false,
  transferFee: false,
  permit: false,
  votes: false,
};

function flagsFrom(bits: number) {
  return {
    initialDistribution: (bits & 1) !== 0,
    mint: (bits & 2) !== 0,
    burn: (bits & 4) !== 0,
    pause: (bits & 8) !== 0,
    transferFee: (bits & 16) !== 0,
    permit: (bits & 32) !== 0,
    votes: (bits & 64) !== 0,
  };
}

function config(extra: Record<string, unknown> = {}) {
  return {
    name: "Adv",
    symbol: "ADV",
    decimals: 18,
    initialSupply: 1000n,
    initialOwner: ethers.ZeroAddress,
    ...extra,
  };
}

function advanced(extra: Record<string, unknown> = {}) {
  return {
    distributionRecipients: [] as string[],
    distributionAmounts: [] as bigint[],
    tax: { feeRecipient: ethers.ZeroAddress, buyFeeBps: 0, sellFeeBps: 0 },
    cap: 0n,
    ...extra,
  };
}

async function deploySystem(
  fees: typeof ethFees,
  decimals = 8,
  price = 2000n * 10n ** BigInt(decimals),
) {
  const [owner, feeRecipient, alice, bob] = await ethers.getSigners();
  const feed = await ethers.deployContract("MockAggregator", [decimals, price]);
  const tokenDeployer = await ethers.deployContract("TokenDeployer", [owner.address]);
  const permitDeployer = await ethers.deployContract("PermitDeployer", [owner.address]);
  const votesDeployer = await ethers.deployContract("VotesDeployer", [owner.address]);
  const vestingDeployer = await ethers.deployContract("VestingDeployer", [owner.address]);
  const factory = await ethers.deployContract("AdvancedTokenFactory", [
    await feed.getAddress(),
    feeRecipient.address,
    fees,
    {
      token: await tokenDeployer.getAddress(),
      permit: await permitDeployer.getAddress(),
      votes: await votesDeployer.getAddress(),
      vesting: await vestingDeployer.getAddress(),
    },
  ]);
  const factoryAddress = await factory.getAddress();
  await tokenDeployer.setFactory(factoryAddress);
  await permitDeployer.setFactory(factoryAddress);
  await votesDeployer.setFactory(factoryAddress);
  await vestingDeployer.setFactory(factoryAddress);
  return { owner, feeRecipient, alice, bob, feed, factory, tokenDeployer, permitDeployer, votesDeployer, vestingDeployer };
}

function createdToken(factory: { interface: { parseLog: (log: { topics: string[]; data: string }) => { name: string; args: { token: string } } | null } }, receipt: { logs: Array<{ topics: string[]; data: string }> }) {
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed?.name === "AdvancedTokenCreated") return parsed.args.token as string;
    } catch {
      // not this contract
    }
  }
  throw new Error("AdvancedTokenCreated was not emitted");
}

async function deployedSize(address: string) {
  const code = await ethers.provider.getCode(address);
  return (code.length - 2) / 2;
}

describe("AdvancedTokenFactory", function () {
  it("scales whole tokens once and keeps every runtime under the EIP-170 limit", async function () {
    const { factory, owner, tokenDeployer, permitDeployer, votesDeployer, vestingDeployer } = await deploySystem(zeroFees);
    const tx = await factory.deployAdvancedToken(config({ decimals: 6, initialSupply: 5n }), noFlags, advanced());
    const receipt = await tx.wait();
    const token = await ethers.getContractAt("AdvancedToken", createdToken(factory, receipt!));
    expect(await token.totalSupply()).to.equal(5n * 10n ** 6n);
    expect(await token.balanceOf(owner.address)).to.equal(5n * 10n ** 6n);
    expect(await token.factory()).to.equal(await factory.getAddress());

    if (process.env.COVERAGE !== "1") {
      for (const address of [
        await factory.getAddress(),
        await token.getAddress(),
        await tokenDeployer.getAddress(),
        await permitDeployer.getAddress(),
        await votesDeployer.getAddress(),
        await vestingDeployer.getAddress(),
      ]) {
        expect(await deployedSize(address)).to.be.lte(EIP170);
      }
    }
    const directWallet = await ethers.deployContract("AdvancedVestingWallet", [owner.address, 1, 2, 1]);
    expect(await directWallet.cliff()).to.equal(2n);
    if (process.env.COVERAGE !== "1") {
      const votes = await ethers.deployContract("VotesDeployer", [owner.address]);
      const permit = await ethers.deployContract("PermitDeployer", [owner.address]);
      expect(await deployedSize(await votes.getAddress())).to.be.lte(EIP170);
      expect(await deployedSize(await permit.getAddress())).to.be.lte(EIP170);
      expect(await deployedSize(await directWallet.getAddress())).to.be.lte(EIP170);
    }
  });

  it("deploys every flag combination", async function () {
    this.timeout(180_000);
    const { factory, owner, feeRecipient } = await deploySystem(zeroFees);
    for (let bits = 0; bits < 128; bits++) {
      const flags = flagsFrom(bits);
      const supply = flags.initialDistribution ? 4n : 1n;
      await factory.deployAdvancedToken(
        config({ name: `N${bits}`, symbol: "S", initialSupply: supply, initialOwner: owner.address }),
        flags,
        advanced({
          distributionRecipients: flags.initialDistribution ? [owner.address, feeRecipient.address] : [],
          distributionAmounts: flags.initialDistribution ? [1n, 3n] : [],
          tax: {
            feeRecipient: flags.transferFee ? feeRecipient.address : ethers.ZeroAddress,
            buyFeeBps: flags.transferFee ? 100 : 0,
            sellFeeBps: flags.transferFee ? 200 : 0,
          },
          cap: flags.mint ? supply + 10n : 0n,
        }),
      );
    }
    await factory.deployAdvancedToken(config({ name: "Zero", initialSupply: 0n }), noFlags, advanced());
    expect(await factory.getNonce(owner.address)).to.equal(129n);
  });

  it("charges the Ethereum schedule, refunds the excess, and rejects a short payment", async function () {
    const { factory, owner, feeRecipient, feed } = await deploySystem(ethFees);
    const all = {
      initialDistribution: true,
      mint: true,
      burn: true,
      pause: true,
      transferFee: true,
      permit: true,
      votes: true,
    };
    const quote = await factory.currentFee(all);
    expect(quote).to.equal(ethers.parseEther("0.017"));
    await expect(factory.deployAdvancedToken(config({ name: "All" }), all, advanced(), { value: quote - 1n }))
      .to.be.revertedWithCustomError(factory, "InsufficientFee");

    const ownerBefore = await ethers.provider.getBalance(owner.address);
    const recipientBefore = await ethers.provider.getBalance(feeRecipient.address);
    const tx = await factory.deployAdvancedToken(
      config({ name: "All", initialSupply: 10n }),
      all,
      advanced({
        distributionRecipients: [owner.address],
        distributionAmounts: [10n],
        tax: { feeRecipient: feeRecipient.address, buyFeeBps: 0, sellFeeBps: 1000 },
        cap: 20n,
      }),
      { value: quote + 1234n },
    );
    const receipt = await tx.wait();
    const gas = receipt!.gasUsed * receipt!.gasPrice;
    expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(recipientBefore + quote);
    expect(await ethers.provider.getBalance(owner.address)).to.equal(ownerBefore - quote - gas);

    const other = (await deploySystem(otherFees)).factory;
    expect(await other.currentFee(all)).to.equal(ethers.parseEther("0.0085"));

    await feed.setPrice(2000n * 10n ** 18n);
    const eighteen = await deploySystem(ethFees, 18, 2000n * 10n ** 18n);
    expect(await eighteen.factory.currentFee(noFlags)).to.equal(ethers.parseEther("0.003"));
    const twenty = await deploySystem(ethFees, 20, 2000n * 10n ** 20n);
    expect(await twenty.factory.currentFee(noFlags)).to.equal(ethers.parseEther("0.003"));
  });

  it("sends a failed refund to the fee recipient and reverts when both reject it", async function () {
    const { factory, feeRecipient } = await deploySystem(zeroFees);
    const caller = await ethers.deployContract("RejectingCaller");
    const data = factory.interface.encodeFunctionData("deployAdvancedToken", [config(), noFlags, advanced()]);
    const before = await ethers.provider.getBalance(feeRecipient.address);
    await caller.callFactory(await factory.getAddress(), data, { value: 1000n });
    expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(before + 1000n);

    const rejectingRecipient = await ethers.deployContract("RejectingDeployer");
    const both = await deploySystem(zeroFees);
    await both.factory.setFeeRecipient(await rejectingRecipient.getAddress());
    const caller2 = await ethers.deployContract("RejectingCaller");
    await expect(
      caller2.callFactory(await both.factory.getAddress(), data, { value: 1n }),
    ).to.be.revertedWithCustomError(both.factory, "RefundFailedBoth");
  });

  it("reverts a positive USD fee that would round to zero native wei", async function () {
    const fees = { ...zeroFees, baseFeeUsdWei: 1n };
    const { factory } = await deploySystem(fees, 18, 10n ** 25n);
    await expect(factory.currentFee(noFlags)).to.be.revertedWithCustomError(factory, "FeeRoundsToZero");
    await expect(factory.deployAdvancedToken(config(), noFlags, advanced())).to.be.revertedWithCustomError(factory, "FeeRoundsToZero");
  });

  it("rejects a bad price, a stale round, and a paused factory", async function () {
    const { factory, feed, owner, alice } = await deploySystem(ethFees);
    await feed.setPrice(-1);
    await expect(factory.currentFee(noFlags)).to.be.revertedWithCustomError(factory, "InvalidPrice");
    await feed.setPrice(1);
    await expect(factory.currentFee(noFlags)).to.be.revertedWithCustomError(factory, "PriceOutOfBounds");
    await feed.setPrice(10n ** 18n);
    await expect(factory.currentFee(noFlags)).to.be.revertedWithCustomError(factory, "PriceOutOfBounds");
    await feed.setPrice(2000n * 10n ** 8n);
    await feed.setAnsweredInRound(0);
    await expect(factory.currentFee(noFlags)).to.be.revertedWithCustomError(factory, "StaleRound");
    const now = BigInt(await networkHelpers.time.latest());
    await feed.setAnsweredInRound(100);
    await feed.setUpdatedAt(now + 3600n);
    await expect(factory.currentFee(noFlags)).to.be.revertedWithCustomError(factory, "InvalidTimestamp");
    await feed.setUpdatedAt(now - 3601n);
    await expect(factory.currentFee(noFlags)).to.be.revertedWithCustomError(factory, "PriceTooOld");

    await factory.pause();
    await expect(factory.deployAdvancedToken(config(), noFlags, advanced(), { value: ethers.parseEther("1") }))
      .to.be.revertedWithCustomError(factory, "EnforcedPause");
    await expect(factory.connect(alice).unpause()).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    await factory.unpause();
    await factory.transferOwnership(alice.address);
    await factory.connect(alice).acceptOwnership();
    expect(await factory.owner()).to.equal(alice.address);
    await expect(factory.connect(owner).pause()).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
  });

  it("lets the owner change the fee schedule", async function () {
    const { factory, alice } = await deploySystem(ethFees);
    await expect(factory.setBaseFee(4n * USD)).to.emit(factory, "BaseFeeUpdated").withArgs(6n * USD, 4n * USD);
    await expect(factory.setOptionFee(await factory.OPTION_TRANSFER_FEE(), 5n * USD))
      .to.emit(factory, "OptionFeeUpdated")
      .withArgs(await factory.OPTION_TRANSFER_FEE(), 20n * USD, 5n * USD);
    await factory.setOptionFee(await factory.OPTION_MINT(), 1n * USD);
    await factory.setOptionFee(await factory.OPTION_BURN(), 1n * USD);
    await factory.setOptionFee(await factory.OPTION_DISTRIBUTION(), 1n * USD);
    await factory.setOptionFee(await factory.OPTION_PAUSE(), 1n * USD);
    await factory.setOptionFee(await factory.OPTION_PERMIT(), 1n * USD);
    await factory.setOptionFee(await factory.OPTION_VOTES(), 1n * USD);
    await factory.setOptionFee(await factory.OPTION_VESTING(), 1n * USD);
    expect(await factory.mintFeeUsdWei()).to.equal(1n * USD);
    expect(await factory.burnFeeUsdWei()).to.equal(1n * USD);
    expect(await factory.distributionFeeUsdWei()).to.equal(1n * USD);
    expect(await factory.pauseFeeUsdWei()).to.equal(1n * USD);
    expect(await factory.permitFeeUsdWei()).to.equal(1n * USD);
    expect(await factory.votesFeeUsdWei()).to.equal(1n * USD);
    expect(await factory.vestingFeeUsdWei()).to.equal(1n * USD);
    expect(await factory.currentVestingFee()).to.equal(ethers.parseEther("0.0005"));
    await expect(factory.setOptionFee(ethers.id("nope"), 1n)).to.be.revertedWithCustomError(factory, "UnknownOption");
    await expect(factory.connect(alice).setBaseFee(1n)).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    await expect(factory.setFeeRecipient(ethers.ZeroAddress)).to.be.revertedWithCustomError(factory, "ZeroAddress");
    await factory.setFeeRecipient(alice.address);
    expect(await factory.feeRecipient()).to.equal(alice.address);
  });

  it("rejects invalid config and a missing deployer", async function () {
    const { factory, alice } = await deploySystem(zeroFees);
    const core = factory;
    await expect(factory.deployAdvancedToken(config({ name: "" }), noFlags, advanced())).to.be.revertedWithCustomError(core, "InvalidName");
    await expect(factory.deployAdvancedToken(config({ name: "a".repeat(101) }), noFlags, advanced())).to.be.revertedWithCustomError(core, "InvalidName");
    await expect(factory.deployAdvancedToken(config({ symbol: "" }), noFlags, advanced())).to.be.revertedWithCustomError(core, "InvalidSymbol");
    await expect(factory.deployAdvancedToken(config({ symbol: "S".repeat(21) }), noFlags, advanced())).to.be.revertedWithCustomError(core, "InvalidSymbol");
    await expect(factory.deployAdvancedToken(config({ decimals: 31 }), noFlags, advanced())).to.be.revertedWithCustomError(core, "DecimalsOutOfRange");
    await expect(
      factory.deployAdvancedToken(config({ name: "a".repeat(32) }), { ...noFlags, permit: true }, advanced()),
    ).to.be.revertedWithCustomError(core, "PermitNameTooLong");
    await expect(
      factory.deployAdvancedToken(config(), { ...noFlags, initialDistribution: true }, advanced()),
    ).to.be.revertedWithCustomError(core, "BadDistribution");
    await expect(
      factory.deployAdvancedToken(config(), noFlags, advanced({ distributionRecipients: [alice.address], distributionAmounts: [1n] })),
    ).to.be.revertedWithCustomError(core, "BadDistribution");
    await expect(
      factory.deployAdvancedToken(config(), noFlags, advanced({ tax: { feeRecipient: alice.address, buyFeeBps: 1, sellFeeBps: 0 } })),
    ).to.be.revertedWithCustomError(core, "TaxConfigMismatch");
    await expect(
      factory.deployAdvancedToken(config({ initialSupply: 2n ** 256n - 1n, decimals: 30 }), noFlags, advanced()),
    ).to.be.revertedWithCustomError(core, "SupplyOverflow");

    await expect(
      ethers.deployContract("AdvancedTokenFactory", [
        ethers.ZeroAddress,
        alice.address,
        zeroFees,
        { token: alice.address, permit: alice.address, votes: alice.address, vesting: alice.address },
      ]),
    ).to.be.revertedWithCustomError(core, "ZeroAddress");
    const feed = await ethers.deployContract("MockAggregator", [8, 2000n * 10n ** 8n]);
    await expect(
      ethers.deployContract("AdvancedTokenFactory", [
        await feed.getAddress(),
        alice.address,
        zeroFees,
        { token: alice.address, permit: alice.address, votes: alice.address, vesting: alice.address },
      ]),
    ).to.be.revertedWithCustomError(core, "NotAContract");
  });

  it("taxes a buy and a sell through a factory token and a Uniswap V2 mock", async function () {
    const { factory, owner, feeRecipient, alice } = await deploySystem(zeroFees);
    const flags = { ...noFlags, transferFee: true };
    const tx = await factory.deployAdvancedToken(
      config({ name: "Tax", initialSupply: 1_000_000n }),
      flags,
      advanced({ tax: { feeRecipient: feeRecipient.address, buyFeeBps: 200, sellFeeBps: 300 } }),
    );
    const receipt = await tx.wait();
    const token = await ethers.getContractAt("AdvancedToken", createdToken(factory, receipt!));
    const quote = await ethers.deployContract("MockERC20");
    const uniFactory = await ethers.deployContract("MockUniswapV2Factory");
    const router = await ethers.deployContract("MockUniswapV2Router", [await uniFactory.getAddress()]);
    await uniFactory.createPair(await token.getAddress(), await quote.getAddress());
    const pair = await uniFactory.getPair(await token.getAddress(), await quote.getAddress());
    const tokenLiquidity = ethers.parseEther("100000");
    const quoteLiquidity = ethers.parseEther("1000");
    await quote.mint(owner.address, quoteLiquidity);
    await token.approve(await router.getAddress(), ethers.MaxUint256);
    await quote.approve(await router.getAddress(), ethers.MaxUint256);
    await token.setPool(pair, true);
    await router.addLiquidity(await token.getAddress(), await quote.getAddress(), tokenLiquidity, quoteLiquidity, owner.address);
    expect(await token.balanceOf(pair)).to.equal(tokenLiquidity);

    const spent = ethers.parseEther("10");
    await quote.mint(alice.address, spent);
    await quote.connect(alice).approve(await router.getAddress(), spent);
    const pairBefore = await token.balanceOf(pair);
    await router.connect(alice).swapExactTokensForTokens(spent, [await quote.getAddress(), await token.getAddress()], alice.address);
    const gross = pairBefore - (await token.balanceOf(pair));
    const buyTax = (gross / 10_000n) * 200n + ((gross % 10_000n) * 200n) / 10_000n;
    expect(buyTax).to.be.gt(0n);
    expect(await token.balanceOf(alice.address)).to.equal(gross - buyTax);

    const gift = (await token.balanceOf(alice.address)) / 2n;
    const feesBefore = await token.balanceOf(feeRecipient.address);
    await token.connect(alice).transfer(owner.address, gift);
    expect(await token.balanceOf(feeRecipient.address)).to.equal(feesBefore);

    const sold = await token.balanceOf(alice.address);
    await token.connect(alice).approve(await router.getAddress(), sold);
    const quoteBefore = await quote.balanceOf(alice.address);
    await router.connect(alice).swapExactTokensForTokens(sold, [await token.getAddress(), await quote.getAddress()], alice.address);
    expect(await token.balanceOf(alice.address)).to.equal(0n);
    expect(await quote.balanceOf(alice.address)).to.be.gt(quoteBefore);
  });

  it("creates a cliff plus linear vesting wallet and releases on schedule", async function () {
    const { factory, owner, alice } = await deploySystem(zeroFees);
    const now = BigInt(await networkHelpers.time.latest());
    const start = now + 100n;
    const duration = 1_000n;
    const cliff = 250n;
    await factory.setOptionFee(await factory.OPTION_VESTING(), 2n * USD);
    await expect(factory.createVestingWallet(alice.address, start, duration, cliff)).to.be.revertedWithCustomError(factory, "InsufficientFee");
    await factory.setOptionFee(await factory.OPTION_VESTING(), 0n);
    await expect(factory.createVestingWallet(ethers.ZeroAddress, start, duration, cliff)).to.be.revertedWithCustomError(factory, "ZeroAddress");
    await expect(factory.createVestingWallet(alice.address, start, duration, duration + 1n)).to.be.revertedWithCustomError(
      await ethers.getContractFactory("AdvancedVestingWallet"),
      "InvalidCliffDuration",
    );

    const vestTx = await factory.createVestingWallet(alice.address, start, duration, cliff);
    const vestReceipt = await vestTx.wait();
    let walletAddress = "";
    for (const log of vestReceipt!.logs) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed?.name === "VestingWalletCreated") walletAddress = parsed.args.wallet;
      } catch {
        // not this event
      }
    }
    const wallet = await ethers.getContractAt("AdvancedVestingWallet", walletAddress);
    expect(await wallet.owner()).to.equal(alice.address);
    expect(await wallet.cliff()).to.equal(start + cliff);

    const token = await ethers.deployContract("AdvancedToken", [
      {
        name: "Vest",
        symbol: "VEST",
        decimals: 18,
        initialSupply: 1_000n,
        initialOwner: owner.address,
        factory: await factory.getAddress(),
        feeRecipient: ethers.ZeroAddress,
        buyFeeBps: 0,
        sellFeeBps: 0,
        hasMint: false,
        hasBurn: false,
        hasPause: false,
        hasTax: false,
        cap: 0,
        recipients: [],
        amounts: [],
      },
    ]);
    await token.transfer(walletAddress, 1_000n);
    await owner.sendTransaction({ to: walletAddress, value: 1_000n });

    const tokenAddress = await token.getAddress();
    expect(await wallet["releasable(address)"](tokenAddress)).to.equal(0n);
    expect(await wallet["releasable()"]()).to.equal(0n);
    await networkHelpers.time.increaseTo(start + cliff - 1n);
    expect(await wallet["releasable(address)"](tokenAddress)).to.equal(0n);
    expect(await wallet["vestedAmount(address,uint64)"](tokenAddress, start + cliff)).to.equal(250n);
    await networkHelpers.time.setNextBlockTimestamp(start + cliff);
    await wallet.connect(alice)["release(address)"](tokenAddress);
    const ethTime = start + cliff + 1n;
    await networkHelpers.time.setNextBlockTimestamp(ethTime);
    await wallet.connect(alice)["release()"]();
    const ethReleased = (1_000n * (ethTime - start)) / duration;
    expect(await token.balanceOf(alice.address)).to.equal(250n);
    expect(await ethers.provider.getBalance(walletAddress)).to.equal(1_000n - ethReleased);

    await networkHelpers.time.setNextBlockTimestamp(start + duration);
    await wallet.connect(alice)["release(address)"](tokenAddress);
    await networkHelpers.time.setNextBlockTimestamp(start + duration + 1n);
    await wallet.connect(alice)["release()"]();
    expect(await token.balanceOf(alice.address)).to.equal(1_000n);
    expect(await ethers.provider.getBalance(walletAddress)).to.equal(0n);
    expect(await wallet["released(address)"](tokenAddress)).to.equal(1_000n);
    expect(await wallet["released()"]()).to.equal(1_000n);
  });

  it("accepts a permit signature and a vote delegation on factory tokens", async function () {
    const { factory, owner, alice } = await deploySystem(zeroFees);
    const permitTx = await factory.deployAdvancedToken(
      config({ name: "Permit", initialSupply: 10n }),
      { ...noFlags, permit: true },
      advanced(),
    );
    const permitReceipt = await permitTx.wait();
    const permit = await ethers.getContractAt("AdvancedTokenPermit", createdToken(factory, permitReceipt!));
    const deadline = BigInt(await networkHelpers.time.latest()) + 3600n;
    const signature = await owner.signTypedData(
      { name: "Permit", version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await permit.getAddress() },
      {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { owner: owner.address, spender: alice.address, value: 4n * 10n ** 18n, nonce: await permit.nonces(owner.address), deadline },
    );
    const { v, r, s } = ethers.Signature.from(signature);
    await permit.permit(owner.address, alice.address, 4n * 10n ** 18n, deadline, v, r, s);
    expect(await permit.allowance(owner.address, alice.address)).to.equal(4n * 10n ** 18n);

    const votesTx = await factory.deployAdvancedToken(
      config({ name: "Votes", initialSupply: 8n }),
      { ...noFlags, votes: true, permit: true },
      advanced(),
    );
    const votesReceipt = await votesTx.wait();
    const votes = await ethers.getContractAt("AdvancedTokenVotes", createdToken(factory, votesReceipt!));
    expect(await votes.CLOCK_MODE()).to.equal("mode=blocknumber&from=default");
    await votes.delegate(alice.address);
    expect(await votes.getVotes(alice.address)).to.equal(8n * 10n ** 18n);
    expect(await votes.delegates(owner.address)).to.equal(alice.address);
  });

  it("locks a deployer to one factory", async function () {
    const { owner, alice, tokenDeployer, factory } = await deploySystem(zeroFees);
    await expect(tokenDeployer.connect(alice).setFactory(alice.address)).to.be.revertedWithCustomError(tokenDeployer, "OwnableUnauthorizedAccount");
    await expect(tokenDeployer.setFactory(await factory.getAddress())).to.be.revertedWithCustomError(tokenDeployer, "FactoryAlreadySet");
    await expect(tokenDeployer.setFactory(ethers.ZeroAddress)).to.be.revertedWithCustomError(tokenDeployer, "FactoryAlreadySet");
    const fresh = await ethers.deployContract("TokenDeployer", [owner.address]);
    await expect(fresh.setFactory(ethers.ZeroAddress)).to.be.revertedWithCustomError(fresh, "ZeroAddress");
    await expect(
      fresh.deploy(
        {
          name: "X",
          symbol: "X",
          decimals: 18,
          initialSupply: 0,
          initialOwner: owner.address,
          factory: owner.address,
          feeRecipient: ethers.ZeroAddress,
          buyFeeBps: 0,
          sellFeeBps: 0,
          hasMint: false,
          hasBurn: false,
          hasPause: false,
          hasTax: false,
          cap: 0,
          recipients: [],
          amounts: [],
        },
        ethers.id("salt"),
      ),
    ).to.be.revertedWithCustomError(fresh, "OnlyFactory");
    expect(await tokenDeployer.factory()).to.equal(await factory.getAddress());
  });

  it("reverts when the fee recipient rejects the fee", async function () {
    const rejecting = await ethers.deployContract("RejectingDeployer");
    const [owner] = await ethers.getSigners();
    const feed = await ethers.deployContract("MockAggregator", [8, 2000n * 10n ** 8n]);
    const tokenDeployer = await ethers.deployContract("TokenDeployer", [owner.address]);
    const permitDeployer = await ethers.deployContract("PermitDeployer", [owner.address]);
    const votesDeployer = await ethers.deployContract("VotesDeployer", [owner.address]);
    const vestingDeployer = await ethers.deployContract("VestingDeployer", [owner.address]);
    const factory = await ethers.deployContract("AdvancedTokenFactory", [
      await feed.getAddress(),
      await rejecting.getAddress(),
      ethFees,
      {
        token: await tokenDeployer.getAddress(),
        permit: await permitDeployer.getAddress(),
        votes: await votesDeployer.getAddress(),
        vesting: await vestingDeployer.getAddress(),
      },
    ]);
    await tokenDeployer.setFactory(await factory.getAddress());
    const quote = await factory.currentFee(noFlags);
    await expect(factory.deployAdvancedToken(config(), noFlags, advanced(), { value: quote })).to.be.revertedWithCustomError(
      factory,
      "FeeTransferFailed",
    );
  });
});

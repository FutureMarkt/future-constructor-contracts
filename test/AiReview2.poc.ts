import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const maxFee = ethers.MaxUint256;
const BPS = 10_000n;
const USD = 10n ** 18n;

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

const ethFees = {
  ...zeroFees,
  baseFeeUsdWei: 6n * USD,
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

function feeOn(value: bigint, bps: number): bigint {
  const rate = BigInt(bps);
  if (rate === 0n || value === 0n) return 0n;
  return (value / BPS) * rate + ((value % BPS) * rate) / BPS;
}

function tokenConfig(extra: Record<string, unknown> = {}) {
  return {
    name: "Adv",
    symbol: "ADV",
    decimals: 18,
    initialSupply: 1_000_000n,
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

function rawInit(owner: string, factory: string, extra: Record<string, unknown> = {}) {
  return {
    name: "Adv",
    symbol: "ADV",
    decimals: 18,
    initialSupply: 1_000n * 10n ** 18n,
    initialOwner: owner,
    factory,
    feeRecipient: ethers.ZeroAddress,
    buyFeeBps: 0,
    sellFeeBps: 0,
    hasMint: false,
    hasBurn: false,
    hasPause: false,
    hasTax: false,
    cap: 0,
    recipients: [] as string[],
    amounts: [] as bigint[],
    ...extra,
  };
}

async function deploySystem(
  fees: typeof zeroFees = zeroFees,
  sequencer: string = ethers.ZeroAddress,
) {
  const [owner, feeRecipient, alice, bob] = await ethers.getSigners();
  const feed = await ethers.deployContract("MockAggregator", [8, 2000n * 10n ** 8n]);
  const tokenDeployer = await ethers.deployContract("TokenDeployer", [owner.address]);
  const permitDeployer = await ethers.deployContract("PermitDeployer", [owner.address]);
  const votesDeployer = await ethers.deployContract("VotesDeployer", [owner.address]);
  const vestingDeployer = await ethers.deployContract("VestingDeployer", [owner.address]);
  const factory = await ethers.deployContract("AdvancedTokenFactory", [
    await feed.getAddress(),
    sequencer,
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
  return {
    owner,
    feeRecipient,
    alice,
    bob,
    feed,
    factory,
    tokenDeployer,
    permitDeployer,
    votesDeployer,
    vestingDeployer,
  };
}

function createdToken(
  factory: { interface: { parseLog: (log: { topics: string[]; data: string }) => { name: string; args: { token: string } } | null } },
  receipt: { logs: Array<{ topics: string[]; data: string }> },
) {
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

function createdWallet(
  factory: { interface: { parseLog: (log: { topics: string[]; data: string }) => { name: string; args: { wallet: string } } | null } },
  receipt: { logs: Array<{ topics: string[]; data: string }> },
) {
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed?.name === "VestingWalletCreated") return parsed.args.wallet as string;
    } catch {
      // not this contract
    }
  }
  throw new Error("VestingWalletCreated was not emitted");
}

async function deployTaxToken() {
  const [owner, factorySigner, feeRecipient, alice, bob] = await ethers.getSigners();
  const token = await ethers.deployContract("AdvancedToken", [
    rawInit(owner.address, factorySigner.address, {
      hasTax: true,
      feeRecipient: feeRecipient.address,
      buyFeeBps: 200,
      sellFeeBps: 300,
      initialSupply: ethers.parseEther("1000000"),
    }),
  ]);
  return { token, owner, factorySigner, feeRecipient, alice, bob };
}

describe("AI review 2 findings", function () {
  it("AR2-01 renounceOwnership on a vesting wallet permanently locks ERC-20", async function () {
    const { factory, owner, alice } = await deploySystem();
    const now = BigInt(await networkHelpers.time.latest());
    const start = now + 10n;
    const duration = 1_000n;
    const tx = await factory.createVestingWallet(alice.address, start, duration, 0, maxFee);
    const walletAddress = createdWallet(factory, (await tx.wait())!);
    const wallet = await ethers.getContractAt("AdvancedVestingWallet", walletAddress);

    const token = await ethers.deployContract("AdvancedToken", [
      rawInit(owner.address, await factory.getAddress(), { initialSupply: 1_000n }),
    ]);
    await token.transfer(walletAddress, 1_000n);
    await networkHelpers.time.increaseTo(start + duration);

    expect(await wallet["releasable(address)"](await token.getAddress())).to.equal(1_000n);
    await wallet.connect(alice).renounceOwnership();
    expect(await wallet.owner()).to.equal(ethers.ZeroAddress);

    await expect(wallet["release(address)"](await token.getAddress())).to.be.revertedWithCustomError(
      token,
      "ERC20InvalidReceiver",
    );
    expect(await token.balanceOf(walletAddress)).to.equal(1_000n);
    expect(await token.balanceOf(alice.address)).to.equal(0n);
  });

  it("AR2-02 startTimestamp 0 passes VestingAlreadyFinished and is almost fully releasable", async function () {
    const { factory, owner, alice } = await deploySystem();
    const now = BigInt(await networkHelpers.time.latest());
    // start=0 is not finished as long as duration is still in the future.
    const duration = now + 365n * 24n * 3600n;
    const tx = await factory.createVestingWallet(alice.address, 0, duration, 0, maxFee);
    const walletAddress = createdWallet(factory, (await tx.wait())!);
    const wallet = await ethers.getContractAt("AdvancedVestingWallet", walletAddress);

    const token = await ethers.deployContract("AdvancedToken", [
      rawInit(owner.address, await factory.getAddress(), { initialSupply: 1_000n }),
    ]);
    await token.transfer(walletAddress, 1_000n);

    const releasable = await wallet["releasable(address)"](await token.getAddress());
    expect(releasable).to.be.greaterThan(900n);
    await wallet.connect(alice)["release(address)"](await token.getAddress());
    expect(await token.balanceOf(alice.address)).to.equal(releasable);
  });

  it("AR2-03 a non-owner add-liquidity transfer is taxed as a sell", async function () {
    const { token, owner, feeRecipient, alice } = await deployTaxToken();
    const quote = await ethers.deployContract("MockERC20");
    const uniFactory = await ethers.deployContract("MockUniswapV2Factory");
    const router = await ethers.deployContract("MockUniswapV2Router", [await uniFactory.getAddress()]);
    await uniFactory.createPair(await token.getAddress(), await quote.getAddress());
    const pair = await uniFactory.getPair(await token.getAddress(), await quote.getAddress());
    await token.setPool(pair, true);

    const ownerLiq = ethers.parseEther("100000");
    const quoteLiq = ethers.parseEther("1000");
    await quote.mint(owner.address, quoteLiq);
    await token.approve(await router.getAddress(), ethers.MaxUint256);
    await quote.approve(await router.getAddress(), ethers.MaxUint256);
    await router.addLiquidity(
      await token.getAddress(),
      await quote.getAddress(),
      ownerLiq,
      quoteLiq,
      owner.address,
    );
    expect(await token.balanceOf(pair)).to.equal(ownerLiq);

    const lpTokens = ethers.parseEther("1000");
    const lpQuote = ethers.parseEther("10");
    await token.transfer(alice.address, lpTokens);
    await quote.mint(alice.address, lpQuote);
    await token.connect(alice).approve(await router.getAddress(), lpTokens);
    await quote.connect(alice).approve(await router.getAddress(), lpQuote);
    const feesBefore = await token.balanceOf(feeRecipient.address);
    const pairBefore = await token.balanceOf(pair);
    await router
      .connect(alice)
      .addLiquidity(await token.getAddress(), await quote.getAddress(), lpTokens, lpQuote, alice.address);
    const tax = feeOn(lpTokens, 300);
    expect(tax).to.be.greaterThan(0n);
    expect(await token.balanceOf(feeRecipient.address)).to.equal(feesBefore + tax);
    expect(await token.balanceOf(pair)).to.equal(pairBefore + lpTokens - tax);
  });

  it("AR2-03b a transfer out of a marked pool (LP-style removal) is taxed as a buy", async function () {
    const { token, feeRecipient, alice, bob } = await deployTaxToken();
    await token.setPool(bob.address, true);
    const amount = ethers.parseEther("100");
    await token.transfer(bob.address, amount);
    expect(await token.balanceOf(bob.address)).to.equal(amount);
    const feesBefore = await token.balanceOf(feeRecipient.address);
    await token.connect(bob).transfer(alice.address, amount);
    const tax = feeOn(amount, 200);
    expect(tax).to.be.greaterThan(0n);
    expect(await token.balanceOf(alice.address)).to.equal(amount - tax);
    expect(await token.balanceOf(feeRecipient.address)).to.equal(feesBefore + tax);
  });

  it("AR2-04 an unmarked second pair is a tax-free market", async function () {
    const { token, owner, feeRecipient, alice } = await deployTaxToken();
    const quoteA = await ethers.deployContract("MockERC20");
    const quoteB = await ethers.deployContract("MockERC20");
    const uniFactory = await ethers.deployContract("MockUniswapV2Factory");
    await uniFactory.createPair(await token.getAddress(), await quoteA.getAddress());
    await uniFactory.createPair(await token.getAddress(), await quoteB.getAddress());
    const pairA = await uniFactory.getPair(await token.getAddress(), await quoteA.getAddress());
    const pairB = await uniFactory.getPair(await token.getAddress(), await quoteB.getAddress());
    await token.setPool(pairA, true);

    const sold = ethers.parseEther("50");
    await token.transfer(alice.address, sold * 2n);
    const feesBefore = await token.balanceOf(feeRecipient.address);

    await token.connect(alice).transfer(pairA, sold);
    const taxed = feeOn(sold, 300);
    expect(await token.balanceOf(pairA)).to.equal(sold - taxed);
    expect(await token.balanceOf(feeRecipient.address)).to.equal(feesBefore + taxed);

    await token.connect(alice).transfer(pairB, sold);
    expect(await token.balanceOf(pairB)).to.equal(sold);
    expect(await token.balanceOf(feeRecipient.address)).to.equal(feesBefore + taxed);
  });

  it("AR2-05 a stale sequencer round still quotes a fee", async function () {
    const sequencer = await ethers.deployContract("MockAggregator", [0, 0]);
    const now = BigInt(await networkHelpers.time.latest());
    await sequencer.setStartedAt(now - 7200n);
    await sequencer.setUpdatedAt(1n);
    await sequencer.setAnsweredInRound(0);
    expect((await sequencer.latestRoundData())[0]).to.equal(1n);
    expect((await sequencer.latestRoundData())[4]).to.equal(0n);

    const { factory } = await deploySystem(ethFees, await sequencer.getAddress());
    const quote = await factory.currentFee(noFlags);
    expect(quote).to.equal(ethers.parseEther("0.003"));
  });

  it("AR2-06 a Uniswap V2 K-check that uses the quoted amountIn reverts on a taxed sell", async function () {
    const { token, owner, alice } = await deployTaxToken();
    const quote = await ethers.deployContract("MockERC20");
    const uniFactory = await ethers.deployContract("MockUniswapV2Factory");
    const router = await ethers.deployContract("MockUniswapV2Router", [await uniFactory.getAddress()]);
    await uniFactory.createPair(await token.getAddress(), await quote.getAddress());
    const pair = await uniFactory.getPair(await token.getAddress(), await quote.getAddress());
    const pool = await ethers.getContractAt("MockUniswapV2Pair", pair);
    await token.setPool(pair, true);

    const tokenLiq = ethers.parseEther("100000");
    const quoteLiq = ethers.parseEther("1000");
    await quote.mint(owner.address, quoteLiq);
    await token.approve(await router.getAddress(), ethers.MaxUint256);
    await quote.approve(await router.getAddress(), ethers.MaxUint256);
    await router.addLiquidity(
      await token.getAddress(),
      await quote.getAddress(),
      tokenLiq,
      quoteLiq,
      owner.address,
    );

    const sold = ethers.parseEther("100");
    await token.transfer(alice.address, sold);
    await token.connect(alice).transfer(pair, sold);

    const [reserve0, reserve1] = await pool.getReserves();
    const tokenIs0 = (await pool.token0()) === (await token.getAddress());
    const reserveIn = tokenIs0 ? reserve0 : reserve1;
    const reserveOut = tokenIs0 ? reserve1 : reserve0;
    const amountInWithFee = sold * 997n;
    const naiveOut = (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);
    expect(naiveOut).to.be.greaterThan(0n);

    if (tokenIs0) {
      await expect(pool.swap(0, naiveOut, alice.address)).to.be.revertedWith("K");
    } else {
      await expect(pool.swap(naiveOut, 0, alice.address)).to.be.revertedWith("K");
    }
  });

  it("AR2-07 ERC-20 sent to the factory cannot be recovered", async function () {
    const { factory, owner } = await deploySystem();
    const token = await ethers.deployContract("AdvancedToken", [
      rawInit(owner.address, await factory.getAddress(), { initialSupply: 500n }),
    ]);
    await token.transfer(await factory.getAddress(), 500n);
    expect(await token.balanceOf(await factory.getAddress())).to.equal(500n);
    const names = factory.interface.fragments
      .filter((fragment) => fragment.type === "function")
      .map((fragment) => ("name" in fragment ? fragment.name : ""));
    expect(names.some((name) => /withdraw|rescue|sweep/i.test(name))).to.equal(false);
  });

  it("AR2-08 renouncing a deployer before setFactory bricks it", async function () {
    const [owner, alice] = await ethers.getSigners();
    const deployer = await ethers.deployContract("TokenDeployer", [owner.address]);
    await deployer.renounceOwnership();
    await expect(deployer.setFactory(alice.address)).to.be.revertedWithCustomError(
      deployer,
      "OwnableUnauthorizedAccount",
    );
    expect(await deployer.factory()).to.equal(ethers.ZeroAddress);
    await expect(
      deployer.deploy(rawInit(owner.address, owner.address, { initialSupply: 1n }), ethers.id("salt")),
    ).to.be.revertedWithCustomError(deployer, "OnlyFactory");
  });

  describe("invariants", function () {
    it("taxed transfers keep totalSupply and split value into recipient plus fee", async function () {
      const { token, feeRecipient, alice, bob } = await deployTaxToken();
      await token.setPool(bob.address, true);
      const samples = [1n, 7n, 999n, 10_000n, 12_345n, ethers.parseEther("1"), ethers.parseEther("77")];
      for (const value of samples) {
        const supplyBefore = await token.totalSupply();
        await token.transfer(alice.address, value);
        const feesBefore = await token.balanceOf(feeRecipient.address);
        const bobBefore = await token.balanceOf(bob.address);
        const aliceBefore = await token.balanceOf(alice.address);
        await token.connect(alice).transfer(bob.address, value);
        const tax = feeOn(value, 300);
        expect(await token.totalSupply()).to.equal(supplyBefore);
        expect(await token.balanceOf(alice.address)).to.equal(aliceBefore - value);
        expect(await token.balanceOf(bob.address)).to.equal(bobBefore + value - tax);
        expect(await token.balanceOf(feeRecipient.address)).to.equal(feesBefore + tax);
        expect(value).to.equal(value - tax + tax);
      }
      expect((await token.buyFeeBps()) + (await token.sellFeeBps())).to.be.lte(await token.MAX_TOTAL_FEE_BPS());
    });

    it("mint and burn skip tax even when the other side is a marked pool", async function () {
      const [owner, factorySigner, feeRecipient, pool] = await ethers.getSigners();
      const token = await ethers.deployContract("AdvancedToken", [
        rawInit(owner.address, factorySigner.address, {
          hasTax: true,
          hasMint: true,
          hasBurn: true,
          feeRecipient: feeRecipient.address,
          buyFeeBps: 200,
          sellFeeBps: 300,
          initialSupply: 0,
        }),
      ]);
      await token.setPool(pool.address, true);
      const minted = 10_000n;
      await token.mint(pool.address, minted);
      expect(await token.balanceOf(pool.address)).to.equal(minted);
      expect(await token.balanceOf(feeRecipient.address)).to.equal(0n);
      expect(await token.totalSupply()).to.equal(minted);

      await token.connect(pool).burn(1_000n);
      expect(await token.balanceOf(pool.address)).to.equal(9_000n);
      expect(await token.totalSupply()).to.equal(9_000n);
      expect(await token.balanceOf(feeRecipient.address)).to.equal(0n);
    });

    it("setFees cannot raise a rate and cannot exceed 1000 bps combined", async function () {
      const { token } = await deployTaxToken();
      await expect(token.setFees(201, 300)).to.be.revertedWithCustomError(token, "FeeIncreaseForbidden");
      await expect(token.setFees(200, 301)).to.be.revertedWithCustomError(token, "FeeIncreaseForbidden");
      await token.setFees(100, 200);
      expect(await token.buyFeeBps()).to.equal(100);
      expect(await token.sellFeeBps()).to.equal(200);
      const high = await ethers.deployContract("AdvancedToken", [
        rawInit((await ethers.getSigners())[0].address, (await ethers.getSigners())[1].address, {
          hasTax: true,
          feeRecipient: (await ethers.getSigners())[2].address,
          buyFeeBps: 400,
          sellFeeBps: 600,
          initialSupply: 0,
        }),
      ]);
      await expect(high.setFees(400, 601)).to.be.revertedWithCustomError(high, "FeeTooHigh");
    });
  });
});

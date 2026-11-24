import { expect } from "chai";
import { network } from "hardhat";

/**
 * PoCs for AI review #1. These tests pin current behavior. They are not fixes.
 */
const { ethers, networkHelpers } = await network.create();

const USD = 10n ** 18n;
const BPS = 10_000n;

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

function feeOn(value: bigint, bps: number): bigint {
  const rate = BigInt(bps);
  return (value / BPS) * rate + ((value % BPS) * rate) / BPS;
}

function rawInit(owner: string, factory: string, extra: Record<string, unknown> = {}) {
  return {
    name: "Adv",
    symbol: "ADV",
    decimals: 18,
    initialSupply: 0n,
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

async function deployFactory(fees: typeof zeroFees) {
  const [owner, feeRecipient, alice, bob] = await ethers.getSigners();
  const feed = await ethers.deployContract("MockAggregator", [8, 2000n * 10n ** 8n]);
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
  return { owner, feeRecipient, alice, bob, feed, factory, factoryAddress, tokenDeployer, permitDeployer, votesDeployer, vestingDeployer };
}

describe("AI review 1 proof of concept", function () {
  it("AR1-01 renounce while paused freezes the token with no recovery", async function () {
    const [owner, factory, alice] = await ethers.getSigners();
    const token = await ethers.deployContract("AdvancedToken", [
      rawInit(owner.address, factory.address, { hasPause: true, initialSupply: 100n }),
    ]);

    await token.pause();
    await token.renounceOwnership();

    expect(await token.owner()).to.equal(ethers.ZeroAddress);
    expect(await token.paused()).to.equal(true);
    await expect(token.unpause()).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    await expect(token.transfer(alice.address, 1n)).to.be.revertedWithCustomError(token, "EnforcedPause");
    await expect(token.connect(alice).transfer(owner.address, 1n)).to.be.revertedWithCustomError(token, "EnforcedPause");

    const service = await deployFactory({ ...zeroFees, baseFeeUsdWei: 6n * USD });
    await service.factory.pause();
    await service.factory.renounceOwnership();
    await expect(service.factory.unpause()).to.be.revertedWithCustomError(service.factory, "OwnableUnauthorizedAccount");
    await expect(
      service.factory.deployAdvancedToken(
        { name: "Stuck", symbol: "STK", decimals: 18, initialSupply: 1n, initialOwner: ethers.ZeroAddress },
        {
          initialDistribution: false,
          mint: false,
          burn: false,
          pause: false,
          transferFee: false,
          permit: false,
          votes: false,
        },
        { distributionRecipients: [], distributionAmounts: [], tax: { feeRecipient: ethers.ZeroAddress, buyFeeBps: 0, sellFeeBps: 0 }, cap: 0n },
        { value: ethers.parseEther("1") },
      ),
    ).to.be.revertedWithCustomError(service.factory, "EnforcedPause");
  });

  it("AR1-02 quotes a fee from a price that a sequencer-aware consumer must reject", async function () {
    const { factory, feed } = await deployFactory({ ...zeroFees, baseFeeUsdWei: 6n * USD });
    const now = BigInt(await networkHelpers.time.latest());
    await feed.setUpdatedAt(now - 30n * 60n);

    const flags = {
      initialDistribution: false,
      mint: false,
      burn: false,
      pause: false,
      transferFee: false,
      permit: false,
      votes: false,
    };
    // $6 at $2000/ETH. The round is 30 minutes old, so MAX_PRICE_AGE still accepts it.
    expect(await factory.currentFee(flags)).to.equal(ethers.parseEther("0.003"));
    await factory.deployAdvancedToken(
      { name: "Stale", symbol: "STL", decimals: 18, initialSupply: 1n, initialOwner: ethers.ZeroAddress },
      flags,
      { distributionRecipients: [], distributionAmounts: [], tax: { feeRecipient: ethers.ZeroAddress, buyFeeBps: 0, sellFeeBps: 0 }, cap: 0n },
      { value: ethers.parseEther("0.003") },
    );

    const quotedNames = factory.interface.fragments.map((fragment) => ("name" in fragment ? fragment.name : ""));
    expect(quotedNames).to.not.include("sequencerUptimeFeed");
  });

  it("AR1-03 mint to a marked pool and burn from it are taxed", async function () {
    const [owner, factory, feeRecipient, alice] = await ethers.getSigners();
    const buyFeeBps = 500;
    const sellFeeBps = 500;
    const token = await ethers.deployContract("AdvancedToken", [
      rawInit(owner.address, factory.address, {
        hasMint: true,
        hasBurn: true,
        hasTax: true,
        feeRecipient: feeRecipient.address,
        buyFeeBps,
        sellFeeBps,
        cap: 1_000_000n,
      }),
    ]);
    await token.setPool(alice.address, true);

    const minted = 10_000n;
    await token.mint(alice.address, minted);
    const sellTax = feeOn(minted, sellFeeBps);
    expect(sellTax).to.be.greaterThan(0n);
    expect(await token.balanceOf(alice.address)).to.equal(minted - sellTax);
    expect(await token.balanceOf(feeRecipient.address)).to.equal(sellTax);
    expect(await token.totalSupply()).to.equal(minted);
    expect(await token.totalSupply()).to.be.lessThanOrEqual(await token.cap());

    const burnAmount = 1_000n;
    const supplyBefore = await token.totalSupply();
    const aliceBefore = await token.balanceOf(alice.address);
    const feesBefore = await token.balanceOf(feeRecipient.address);
    await token.connect(alice).burn(burnAmount);
    const buyTax = feeOn(burnAmount, buyFeeBps);
    expect(buyTax).to.be.greaterThan(0n);
    expect(await token.balanceOf(alice.address)).to.equal(aliceBefore - burnAmount);
    expect(await token.balanceOf(feeRecipient.address)).to.equal(feesBefore + buyTax);
    expect(await token.totalSupply()).to.equal(supplyBefore - (burnAmount - buyTax));

    const plain = await ethers.deployContract("AdvancedToken", [
      rawInit(owner.address, factory.address, {
        hasBurn: true,
        hasTax: true,
        feeRecipient: feeRecipient.address,
        buyFeeBps,
        sellFeeBps,
        initialSupply: 100n,
      }),
    ]);
    await plain.burn(40n);
    expect(await plain.totalSupply()).to.equal(60n);
    expect(await plain.balanceOf(feeRecipient.address)).to.equal(0n);
  });

  it("AR1-04 one transferOwnership redirects the vesting stream", async function () {
    const { factory, owner, alice, bob } = await deployFactory(zeroFees);
    const now = BigInt(await networkHelpers.time.latest());
    const start = now + 10n;
    const duration = 100n;
    const tx = await factory.createVestingWallet(alice.address, start, duration, 0);
    const receipt = await tx.wait();
    let walletAddress = "";
    for (const log of receipt!.logs) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed?.name === "VestingWalletCreated") walletAddress = parsed.args.wallet;
      } catch {
        // not this event
      }
    }
    const wallet = await ethers.getContractAt("AdvancedVestingWallet", walletAddress);
    const token = await ethers.deployContract("AdvancedToken", [
      rawInit(owner.address, await factory.getAddress(), { initialSupply: 1_000n }),
    ]);
    await token.transfer(walletAddress, 1_000n);

    await wallet.connect(alice).transferOwnership(bob.address);
    expect(await wallet.owner()).to.equal(bob.address);

    await networkHelpers.time.increaseTo(start + duration);
    await wallet["release(address)"](await token.getAddress());
    expect(await token.balanceOf(bob.address)).to.equal(1_000n);
    expect(await token.balanceOf(alice.address)).to.equal(0n);
  });

  it("AR1-05 a one-step ownership transfer captures setFactory before the real factory", async function () {
    const [owner, alice] = await ethers.getSigners();
    const feed = await ethers.deployContract("MockAggregator", [8, 2000n * 10n ** 8n]);
    const paidFees = { ...zeroFees, baseFeeUsdWei: 6n * USD };
    const tokenDeployer = await ethers.deployContract("TokenDeployer", [owner.address]);
    const permitDeployer = await ethers.deployContract("PermitDeployer", [owner.address]);
    const votesDeployer = await ethers.deployContract("VotesDeployer", [owner.address]);
    const vestingDeployer = await ethers.deployContract("VestingDeployer", [owner.address]);

    await expect(tokenDeployer.connect(alice).setFactory(alice.address)).to.be.revertedWithCustomError(
      tokenDeployer,
      "OwnableUnauthorizedAccount",
    );

    const factory = await ethers.deployContract("AdvancedTokenFactory", [
      await feed.getAddress(),
      owner.address,
      paidFees,
      {
        token: await tokenDeployer.getAddress(),
        permit: await permitDeployer.getAddress(),
        votes: await votesDeployer.getAddress(),
        vesting: await vestingDeployer.getAddress(),
      },
    ]);

    await tokenDeployer.transferOwnership(alice.address);
    expect(await tokenDeployer.owner()).to.equal(alice.address);
    await tokenDeployer.connect(alice).setFactory(alice.address);
    expect(await tokenDeployer.factory()).to.equal(alice.address);

    const flags = {
      initialDistribution: false,
      mint: false,
      burn: false,
      pause: false,
      transferFee: false,
      permit: false,
      votes: false,
    };
    const quote = await factory.currentFee(flags);
    expect(quote).to.equal(ethers.parseEther("0.003"));

    const init = rawInit(alice.address, alice.address, { initialSupply: 777n, hasMint: true });
    const tokenAddress = await tokenDeployer.connect(alice).deploy.staticCall(init, ethers.id("captured"));
    await tokenDeployer.connect(alice).deploy(init, ethers.id("captured"));
    const token = await ethers.getContractAt("AdvancedToken", tokenAddress);
    expect(await token.balanceOf(alice.address)).to.equal(777n);
    expect(await token.hasMint()).to.equal(true);

    await expect(
      factory.deployAdvancedToken(
        { name: "Blocked", symbol: "BLK", decimals: 18, initialSupply: 1n, initialOwner: ethers.ZeroAddress },
        flags,
        { distributionRecipients: [], distributionAmounts: [], tax: { feeRecipient: ethers.ZeroAddress, buyFeeBps: 0, sellFeeBps: 0 }, cap: 0n },
        { value: quote },
      ),
    ).to.be.revertedWithCustomError(tokenDeployer, "OnlyFactory");
  });

  it("AR1-06 the owner can raise the fee before a buffered deploy lands", async function () {
    const { factory, feeRecipient } = await deployFactory({ ...zeroFees, baseFeeUsdWei: 6n * USD });
    const flags = {
      initialDistribution: false,
      mint: false,
      burn: false,
      pause: false,
      transferFee: false,
      permit: false,
      votes: false,
    };
    const quoted = await factory.currentFee(flags);
    expect(quoted).to.equal(ethers.parseEther("0.003"));

    await factory.setBaseFee(12n * USD);
    const charged = await factory.currentFee(flags);
    expect(charged).to.equal(quoted * 2n);

    const before = await ethers.provider.getBalance(feeRecipient.address);
    await factory.deployAdvancedToken(
      { name: "Buffered", symbol: "BUF", decimals: 18, initialSupply: 1n, initialOwner: ethers.ZeroAddress },
      flags,
      { distributionRecipients: [], distributionAmounts: [], tax: { feeRecipient: ethers.ZeroAddress, buyFeeBps: 0, sellFeeBps: 0 }, cap: 0n },
      { value: quoted * 10n },
    );
    expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(before + charged);
  });

  it("AR1-07 AdvancedTaxToken accepts decimals above the factory maximum", async function () {
    const [owner, factory, feeRecipient] = await ethers.getSigners();
    const token = await ethers.deployContract("AdvancedTaxToken", [
      "Wide",
      "WIDE",
      255,
      1n,
      owner.address,
      factory.address,
      feeRecipient.address,
      0,
      0,
    ]);
    expect(await token.decimals()).to.equal(255);
    expect(await token.totalSupply()).to.equal(1n);

    const tokenArtifact = await ethers.getContractFactory("AdvancedToken");
    await expect(
      ethers.deployContract("AdvancedToken", [rawInit(owner.address, factory.address, { decimals: 31 })]),
    ).to.be.revertedWithCustomError(tokenArtifact, "DecimalsOutOfRange");
  });

  it("AR1-08 a start of zero makes the whole vesting balance releasable now", async function () {
    const { factory, owner, alice } = await deployFactory(zeroFees);
    const tx = await factory.createVestingWallet(alice.address, 0, 1_000, 0);
    const receipt = await tx.wait();
    let walletAddress = "";
    for (const log of receipt!.logs) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed?.name === "VestingWalletCreated") walletAddress = parsed.args.wallet;
      } catch {
        // not this event
      }
    }
    const wallet = await ethers.getContractAt("AdvancedVestingWallet", walletAddress);
    const token = await ethers.deployContract("AdvancedToken", [
      rawInit(owner.address, await factory.getAddress(), { initialSupply: 500n }),
    ]);
    await token.transfer(walletAddress, 500n);
    expect(await wallet.end()).to.equal(1_000n);
    expect(await wallet["releasable(address)"](await token.getAddress())).to.equal(500n);
    await wallet.connect(alice)["release(address)"](await token.getAddress());
    expect(await token.balanceOf(alice.address)).to.equal(500n);
  });
});

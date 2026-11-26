import { expect } from "chai";
import { network } from "hardhat";

/**
 * Regression tests for AI review #1. Each case shows the reported attack no longer succeeds.
 */
const { ethers, networkHelpers } = await network.create();

const USD = 10n ** 18n;
const HOUR = 3600n;
const maxFee = ethers.MaxUint256;

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

const emptyAdvanced = {
  distributionRecipients: [] as string[],
  distributionAmounts: [] as bigint[],
  tax: { feeRecipient: ethers.ZeroAddress, buyFeeBps: 0, sellFeeBps: 0 },
  cap: 0n,
};

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

async function deployFactory(fees: typeof zeroFees, sequencer: string = ethers.ZeroAddress) {
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
  return { owner, feeRecipient, alice, bob, feed, factory, factoryAddress, tokenDeployer, permitDeployer, votesDeployer, vestingDeployer };
}

describe("AI review 1 regressions", function () {
  it("AR1-01 renounce while paused reverts and unpause still recovers transfers", async function () {
    const [owner, factory, alice] = await ethers.getSigners();
    const token = await ethers.deployContract("AdvancedToken", [
      rawInit(owner.address, factory.address, { hasPause: true, initialSupply: 100n }),
    ]);

    await token.pause();
    await expect(token.renounceOwnership()).to.be.revertedWithCustomError(token, "RenounceWhilePaused");
    expect(await token.owner()).to.equal(owner.address);
    expect(await token.paused()).to.equal(true);
    await expect(token.transfer(alice.address, 1n)).to.be.revertedWithCustomError(token, "EnforcedPause");

    await token.unpause();
    await token.transfer(alice.address, 1n);
    expect(await token.balanceOf(alice.address)).to.equal(1n);
    await token.renounceOwnership();
    expect(await token.owner()).to.equal(ethers.ZeroAddress);

    const service = await deployFactory({ ...zeroFees, baseFeeUsdWei: 6n * USD });
    const quote = await service.factory.currentFee(noFlags);
    await service.factory.pause();
    await expect(service.factory.renounceOwnership()).to.be.revertedWithCustomError(service.factory, "RenounceWhilePaused");
    expect(await service.factory.owner()).to.equal(service.owner.address);
    await service.factory.unpause();
    await service.factory.deployAdvancedToken(
      { name: "Open", symbol: "OPN", decimals: 18, initialSupply: 1n, initialOwner: ethers.ZeroAddress },
      noFlags,
      emptyAdvanced,
      quote,
      { value: quote },
    );
    await service.factory.renounceOwnership();
    expect(await service.factory.owner()).to.equal(ethers.ZeroAddress);
  });

  it("AR1-02 rejects a down sequencer and the grace period, and skips the check on L1", async function () {
    const flags = noFlags;
    const l1 = await deployFactory({ ...zeroFees, baseFeeUsdWei: 6n * USD });
    const now = BigInt(await networkHelpers.time.latest());
    await l1.feed.setUpdatedAt(now - 30n * 60n);
    expect(await l1.factory.sequencerUptimeFeed()).to.equal(ethers.ZeroAddress);
    expect(await l1.factory.currentFee(flags)).to.equal(ethers.parseEther("0.003"));

    const [owner] = await ethers.getSigners();
    const sequencer = await ethers.deployContract("MockAggregator", [0, 0]);
    await expect(
      ethers.deployContract("AdvancedTokenFactory", [
        await l1.feed.getAddress(),
        owner.address,
        owner.address,
        { ...zeroFees, baseFeeUsdWei: 6n * USD },
        {
          token: await l1.tokenDeployer.getAddress(),
          permit: await l1.permitDeployer.getAddress(),
          votes: await l1.votesDeployer.getAddress(),
          vesting: await l1.vestingDeployer.getAddress(),
        },
      ]),
    ).to.be.revertedWithCustomError(l1.factory, "NotAContract");

    const l2 = await deployFactory({ ...zeroFees, baseFeeUsdWei: 6n * USD }, await sequencer.getAddress());
    expect(await l2.factory.sequencerUptimeFeed()).to.equal(await sequencer.getAddress());

    const quoteAt = now + 20n;
    await sequencer.setPrice(1);
    await sequencer.setStartedAt(quoteAt - 2n * HOUR);
    await networkHelpers.time.setNextBlockTimestamp(quoteAt);
    await expect(l2.factory.currentFee(flags)).to.be.revertedWithCustomError(l2.factory, "SequencerDown");

    await sequencer.setPrice(0);
    await sequencer.setStartedAt(0);
    await expect(l2.factory.currentFee(flags)).to.be.revertedWithCustomError(l2.factory, "InvalidSequencerRound");
    await sequencer.setStartedAt(quoteAt + HOUR);
    await expect(l2.factory.currentFee(flags)).to.be.revertedWithCustomError(l2.factory, "InvalidSequencerRound");

    const graceAt = quoteAt + 30n;
    await sequencer.setStartedAt(graceAt - HOUR);
    await networkHelpers.time.increaseTo(graceAt);
    await expect(l2.factory.currentFee(flags)).to.be.revertedWithCustomError(l2.factory, "SequencerGracePeriod");

    const liveAt = graceAt + 10n;
    await l2.feed.setUpdatedAt(liveAt);
    await sequencer.setStartedAt(liveAt - HOUR - 1n);
    await networkHelpers.time.increaseTo(liveAt);
    const quote = await l2.factory.currentFee(flags);
    expect(quote).to.equal(ethers.parseEther("0.003"));
    await l2.factory.deployAdvancedToken(
      { name: "Live", symbol: "LIV", decimals: 18, initialSupply: 1n, initialOwner: ethers.ZeroAddress },
      flags,
      emptyAdvanced,
      quote,
      { value: quote },
    );
  });

  it("AR1-03 mint to a marked pool and burn from it move the full amount", async function () {
    const [owner, factory, feeRecipient, alice] = await ethers.getSigners();
    const token = await ethers.deployContract("AdvancedToken", [
      rawInit(owner.address, factory.address, {
        hasMint: true,
        hasBurn: true,
        hasTax: true,
        feeRecipient: feeRecipient.address,
        buyFeeBps: 500,
        sellFeeBps: 500,
        cap: 1_000_000n,
      }),
    ]);
    await token.setPool(alice.address, true);

    const minted = 10_000n;
    await token.mint(alice.address, minted);
    expect(await token.balanceOf(alice.address)).to.equal(minted);
    expect(await token.balanceOf(feeRecipient.address)).to.equal(0n);
    expect(await token.totalSupply()).to.equal(minted);

    const burnAmount = 1_000n;
    await token.connect(alice).burn(burnAmount);
    expect(await token.balanceOf(alice.address)).to.equal(minted - burnAmount);
    expect(await token.balanceOf(feeRecipient.address)).to.equal(0n);
    expect(await token.totalSupply()).to.equal(minted - burnAmount);

    const plain = await ethers.deployContract("AdvancedToken", [
      rawInit(owner.address, factory.address, {
        hasBurn: true,
        hasTax: true,
        feeRecipient: feeRecipient.address,
        buyFeeBps: 500,
        sellFeeBps: 500,
        initialSupply: 100n,
      }),
    ]);
    await plain.burn(40n);
    expect(await plain.totalSupply()).to.equal(60n);
    expect(await plain.balanceOf(feeRecipient.address)).to.equal(0n);

    const bob = (await ethers.getSigners())[4];
    await plain.transfer(alice.address, 20n);
    await plain.connect(alice).transfer(bob.address, 5n);
    expect(await plain.balanceOf(bob.address)).to.equal(5n);
    expect(await plain.balanceOf(feeRecipient.address)).to.equal(0n);
  });

  it("AR1-04 one transferOwnership does not redirect the vesting stream", async function () {
    const { factory, owner, alice, bob } = await deployFactory(zeroFees);
    const now = BigInt(await networkHelpers.time.latest());
    const start = now + 10n;
    const duration = 100n;
    const tx = await factory.createVestingWallet(alice.address, start, duration, 0, maxFee);
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
    expect(await wallet.owner()).to.equal(alice.address);
    expect(await wallet.pendingOwner()).to.equal(bob.address);

    await networkHelpers.time.increaseTo(start + duration);
    await wallet.connect(alice)["release(address)"](await token.getAddress());
    expect(await token.balanceOf(alice.address)).to.equal(1_000n);
    expect(await token.balanceOf(bob.address)).to.equal(0n);

    await wallet.connect(bob).acceptOwnership();
    expect(await wallet.owner()).to.equal(bob.address);
  });

  it("AR1-05 a one-step ownership transfer cannot capture setFactory", async function () {
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
      ethers.ZeroAddress,
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
    expect(await tokenDeployer.owner()).to.equal(owner.address);
    expect(await tokenDeployer.pendingOwner()).to.equal(alice.address);
    await expect(tokenDeployer.connect(alice).setFactory(alice.address)).to.be.revertedWithCustomError(
      tokenDeployer,
      "OwnableUnauthorizedAccount",
    );
    await expect(
      tokenDeployer.connect(alice).deploy(rawInit(alice.address, alice.address, { initialSupply: 777n }), ethers.id("captured")),
    ).to.be.revertedWithCustomError(tokenDeployer, "OnlyFactory");

    await tokenDeployer.setFactory(await factory.getAddress());
    await permitDeployer.setFactory(await factory.getAddress());
    await votesDeployer.setFactory(await factory.getAddress());
    await vestingDeployer.setFactory(await factory.getAddress());

    const quote = await factory.currentFee(noFlags);
    const before = await ethers.provider.getBalance(owner.address);
    await factory.deployAdvancedToken(
      { name: "Paid", symbol: "PAD", decimals: 18, initialSupply: 1n, initialOwner: ethers.ZeroAddress },
      noFlags,
      emptyAdvanced,
      quote,
      { value: quote },
    );
    expect(await ethers.provider.getBalance(owner.address)).to.be.lessThan(before);

    await tokenDeployer.connect(alice).acceptOwnership();
    expect(await tokenDeployer.owner()).to.equal(alice.address);
    await expect(tokenDeployer.connect(alice).setFactory(alice.address)).to.be.revertedWithCustomError(
      tokenDeployer,
      "FactoryAlreadySet",
    );
  });

  it("AR1-06 a buffered deploy reverts when the fee rises above maxFee", async function () {
    const { factory, feeRecipient, alice } = await deployFactory({ ...zeroFees, baseFeeUsdWei: 6n * USD });
    const quoted = await factory.currentFee(noFlags);
    expect(quoted).to.equal(ethers.parseEther("0.003"));

    await factory.setBaseFee(12n * USD);
    const charged = await factory.currentFee(noFlags);
    expect(charged).to.equal(quoted * 2n);

    const before = await ethers.provider.getBalance(feeRecipient.address);
    await expect(
      factory.deployAdvancedToken(
        { name: "Buffered", symbol: "BUF", decimals: 18, initialSupply: 1n, initialOwner: ethers.ZeroAddress },
        noFlags,
        emptyAdvanced,
        quoted,
        { value: quoted * 10n },
      ),
    )
      .to.be.revertedWithCustomError(factory, "FeeAboveMax")
      .withArgs(charged, quoted);
    expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(before);

    await factory.deployAdvancedToken(
      { name: "Buffered", symbol: "BUF", decimals: 18, initialSupply: 1n, initialOwner: ethers.ZeroAddress },
      noFlags,
      emptyAdvanced,
      charged,
      { value: quoted * 10n },
    );
    expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(before + charged);

    await factory.setOptionFee(await factory.OPTION_VESTING(), 2n * USD);
    const vestFee = await factory.currentVestingFee();
    const start = BigInt(await networkHelpers.time.latest()) + 100n;
    await expect(factory.createVestingWallet(alice.address, start, 1_000, 0, vestFee - 1n)).to.be.revertedWithCustomError(
      factory,
      "FeeAboveMax",
    );
  });

  it("AR1-07 AdvancedTaxToken rejects decimals above 30", async function () {
    const [owner, factory, feeRecipient] = await ethers.getSigners();
    const taxToken = await ethers.getContractFactory("AdvancedTaxToken");
    await expect(
      ethers.deployContract("AdvancedTaxToken", [
        "Wide",
        "WIDE",
        255,
        1n,
        owner.address,
        factory.address,
        feeRecipient.address,
        0,
        0,
      ]),
    ).to.be.revertedWithCustomError(taxToken, "DecimalsOutOfRange");

    const token = await ethers.deployContract("AdvancedTaxToken", [
      "Wide",
      "WIDE",
      30,
      1n,
      owner.address,
      factory.address,
      feeRecipient.address,
      0,
      0,
    ]);
    expect(await token.decimals()).to.equal(30);
    expect(await token.totalSupply()).to.equal(1n);

    const core = await ethers.getContractFactory("AdvancedToken");
    await expect(
      ethers.deployContract("AdvancedToken", [rawInit(owner.address, factory.address, { decimals: 31 })]),
    ).to.be.revertedWithCustomError(core, "DecimalsOutOfRange");
  });

  it("AR1-08 an already finished vesting schedule cannot be created", async function () {
    const { factory, owner, alice } = await deployFactory(zeroFees);
    await expect(factory.createVestingWallet(alice.address, 0, 0, 0, maxFee)).to.be.revertedWithCustomError(
      factory,
      "VestingAlreadyFinished",
    );

    const now = BigInt(await networkHelpers.time.latest());
    const start = now + 50n;
    const tx = await factory.createVestingWallet(alice.address, start, 1_000, 0, maxFee);
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
    expect(await wallet["releasable(address)"](await token.getAddress())).to.equal(0n);

    const timelockTx = await factory.createVestingWallet(alice.address, start, 0, 0, maxFee);
    const timelockReceipt = await timelockTx.wait();
    let timelock = "";
    for (const log of timelockReceipt!.logs) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed?.name === "VestingWalletCreated") timelock = parsed.args.wallet;
      } catch {
        // not this event
      }
    }
    expect(timelock).to.not.equal("");
    expect(await (await ethers.getContractAt("AdvancedVestingWallet", timelock)).end()).to.equal(start);
  });
});

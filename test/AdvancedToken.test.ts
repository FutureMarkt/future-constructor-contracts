import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const BPS = 10_000n;

function feeOn(value: bigint, bps: number): bigint {
  const rate = BigInt(bps);
  return (value / BPS) * rate + ((value % BPS) * rate) / BPS;
}

describe("Advanced token modules", function () {
  async function signers() {
    const [owner, factory, feeRecipient, alice, bob] = await ethers.getSigners();
    return { owner, factory, feeRecipient, alice, bob };
  }

  function init(owner: string, factory: string, extra: Record<string, unknown> = {}) {
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

  it("keeps the raw supply and does not scale it again", async function () {
    const { owner, factory } = await signers();
    const token = await ethers.deployContract("AdvancedToken", [init(owner.address, factory.address, { initialSupply: 1000n })]);
    expect(await token.totalSupply()).to.equal(1000n);
    expect(await token.balanceOf(owner.address)).to.equal(1000n);
    expect(await token.decimals()).to.equal(18);
    expect(await token.factory()).to.equal(factory.address);
    expect(await token.hasMint()).to.equal(false);
    expect(await token.cap()).to.equal(0n);
  });

  it("distributes raw amounts and rejects a bad distribution", async function () {
    const { owner, factory, alice, bob } = await signers();
    const token = await ethers.deployContract("AdvancedToken", [
      init(owner.address, factory.address, {
        initialSupply: 100n,
        recipients: [alice.address, bob.address],
        amounts: [40n, 60n],
      }),
    ]);
    expect(await token.balanceOf(alice.address)).to.equal(40n);
    expect(await token.balanceOf(bob.address)).to.equal(60n);
    expect(await token.balanceOf(owner.address)).to.equal(0n);

    const core = await ethers.getContractFactory("AdvancedToken");
    await expect(
      ethers.deployContract("AdvancedToken", [
        init(owner.address, factory.address, { initialSupply: 100n, recipients: [alice.address], amounts: [40n] }),
      ]),
    ).to.be.revertedWithCustomError(core, "BadDistribution");
    await expect(
      ethers.deployContract("AdvancedToken", [
        init(owner.address, factory.address, { initialSupply: 0n, recipients: [], amounts: [1n] }),
      ]),
    ).to.be.revertedWithCustomError(core, "BadDistribution");
    await expect(
      ethers.deployContract("AdvancedToken", [
        init(owner.address, factory.address, {
          initialSupply: 11n,
          recipients: Array(11).fill(alice.address),
          amounts: Array(11).fill(1n),
        }),
      ]),
    ).to.be.revertedWithCustomError(core, "BadDistribution");
    await expect(
      ethers.deployContract("AdvancedToken", [
        init(owner.address, factory.address, {
          initialSupply: 1n,
          recipients: [ethers.ZeroAddress],
          amounts: [1n],
        }),
      ]),
    ).to.be.revertedWithCustomError(core, "ZeroAddress");
  });

  it("mints only when enabled and enforces an optional cap", async function () {
    const { owner, factory, alice } = await signers();
    const capped = await ethers.deployContract("AdvancedToken", [
      init(owner.address, factory.address, { hasMint: true, cap: 1_500n, initialSupply: 1_000n }),
    ]);
    await capped.mint(alice.address, 500n);
    expect(await capped.balanceOf(alice.address)).to.equal(500n);
    await expect(capped.mint(alice.address, 1n)).to.be.revertedWithCustomError(capped, "CapExceeded");
    await expect(
      ethers.deployContract("AdvancedToken", [init(owner.address, factory.address, { cap: 10n, initialSupply: 11n })]),
    ).to.be.revertedWithCustomError(capped, "CapExceeded");

    const plain = await ethers.deployContract("AdvancedToken", [init(owner.address, factory.address)]);
    await expect(plain.mint(alice.address, 1n)).to.be.revertedWithCustomError(plain, "MintDisabled");
    await expect(plain.connect(alice).mint(alice.address, 1n)).to.be.revertedWithCustomError(plain, "OwnableUnauthorizedAccount");
  });

  it("burns the caller's tokens or an allowance, and can disable burn", async function () {
    const { owner, factory, alice } = await signers();
    const token = await ethers.deployContract("AdvancedToken", [
      init(owner.address, factory.address, { hasBurn: true, initialSupply: 100n }),
    ]);
    await token.burn(40n);
    expect(await token.balanceOf(owner.address)).to.equal(60n);
    await token.approve(alice.address, 15n);
    await token.connect(alice).burnFrom(owner.address, 15n);
    expect(await token.balanceOf(owner.address)).to.equal(45n);
    await expect(token.connect(alice).burnFrom(owner.address, 1n)).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");

    const locked = await ethers.deployContract("AdvancedToken", [init(owner.address, factory.address, { initialSupply: 10n })]);
    await expect(locked.burn(1n)).to.be.revertedWithCustomError(locked, "BurnDisabled");
    await expect(locked.burnFrom(owner.address, 1n)).to.be.revertedWithCustomError(locked, "BurnDisabled");
  });

  it("pauses transfers only when pause is enabled", async function () {
    const { owner, factory, alice } = await signers();
    const token = await ethers.deployContract("AdvancedToken", [
      init(owner.address, factory.address, { hasPause: true, hasMint: true, hasBurn: true, initialSupply: 50n }),
    ]);
    await token.pause();
    await expect(token.transfer(alice.address, 1n)).to.be.revertedWithCustomError(token, "EnforcedPause");
    await expect(token.mint(alice.address, 1n)).to.be.revertedWithCustomError(token, "EnforcedPause");
    await expect(token.burn(1n)).to.be.revertedWithCustomError(token, "EnforcedPause");
    await expect(token.connect(alice).unpause()).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    await token.unpause();
    await token.transfer(alice.address, 1n);
    expect(await token.balanceOf(alice.address)).to.equal(1n);

    const plain = await ethers.deployContract("AdvancedToken", [init(owner.address, factory.address)]);
    await expect(plain.pause()).to.be.revertedWithCustomError(plain, "PauseDisabled");
    await expect(plain.unpause()).to.be.revertedWithCustomError(plain, "PauseDisabled");
  });

  it("taxes marked pools, skips wallet transfers, and only lowers fees", async function () {
    const { owner, factory, feeRecipient, alice, bob } = await signers();
    const token = await ethers.deployContract("AdvancedToken", [
      init(owner.address, factory.address, {
        hasTax: true,
        feeRecipient: feeRecipient.address,
        buyFeeBps: 200,
        sellFeeBps: 300,
        initialSupply: 1_000_000n,
      }),
    ]);
    await token.setPool(bob.address, true);
    expect(await token.isPool(bob.address)).to.equal(true);
    await token.transfer(alice.address, 10_000n);
    expect(await token.balanceOf(alice.address)).to.equal(10_000n);

    await token.connect(alice).transfer(bob.address, 10_000n);
    expect(await token.balanceOf(bob.address)).to.equal(10_000n - feeOn(10_000n, 300));
    expect(await token.balanceOf(feeRecipient.address)).to.equal(feeOn(10_000n, 300));

    const bought = 10_000n - feeOn(10_000n, 300);
    await token.connect(bob).transfer(alice.address, bought);
    const buyTax = feeOn(bought, 200);
    expect(await token.balanceOf(alice.address)).to.equal(bought - buyTax);

    await token.transfer(bob.address, 5n);
    expect(await token.balanceOf(feeRecipient.address)).to.equal(feeOn(10_000n, 300) + buyTax);

    await expect(token.setFees(201, 300)).to.be.revertedWithCustomError(token, "FeeIncreaseForbidden");
    await expect(token.setFees(200, 900)).to.be.revertedWithCustomError(token, "FeeTooHigh");
    await token.setFees(100, 0);
    expect(await token.sellFeeBps()).to.equal(0);
    const beforeZero = await token.balanceOf(feeRecipient.address);
    await token.connect(alice).transfer(bob.address, 50n);
    expect(await token.balanceOf(feeRecipient.address)).to.equal(beforeZero);

    await token.setExcluded(alice.address, true);
    const before = await token.balanceOf(feeRecipient.address);
    await token.connect(alice).transfer(bob.address, 100n);
    expect(await token.balanceOf(feeRecipient.address)).to.equal(before);

    await expect(token.setPool(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(token, "ZeroAddress");
    await expect(token.setExcluded(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(token, "ZeroAddress");
    await expect(token.setFeeRecipient(ethers.ZeroAddress)).to.be.revertedWithCustomError(token, "InvalidFeeRecipient");
    await expect(token.setFeeRecipient(await token.getAddress())).to.be.revertedWithCustomError(token, "InvalidFeeRecipient");
    await token.setFeeRecipient(alice.address);
    expect(await token.feeRecipient()).to.equal(alice.address);
    await expect(token.connect(alice).setFees(0, 0)).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
  });

  it("rejects a zero factory, bad decimals, tax without the flag, and a zero-fee tax call", async function () {
    const { owner, factory } = await signers();
    const core = await ethers.getContractFactory("AdvancedToken");
    await expect(ethers.deployContract("AdvancedToken", [init(owner.address, ethers.ZeroAddress)])).to.be.revertedWithCustomError(
      core,
      "ZeroAddress",
    );
    await expect(
      ethers.deployContract("AdvancedToken", [init(owner.address, factory.address, { decimals: 31 })]),
    ).to.be.revertedWithCustomError(core, "DecimalsOutOfRange");
    await expect(
      ethers.deployContract("AdvancedToken", [init(owner.address, factory.address, { buyFeeBps: 1 })]),
    ).to.be.revertedWithCustomError(core, "TaxDisabled");
    await expect(
      ethers.deployContract("AdvancedToken", [
        init(owner.address, factory.address, { hasTax: true, feeRecipient: ethers.ZeroAddress, buyFeeBps: 1 }),
      ]),
    ).to.be.revertedWithCustomError(core, "InvalidFeeRecipient");

    const plain = await ethers.deployContract("AdvancedToken", [init(owner.address, factory.address)]);
    await expect(plain.setFees(0, 0)).to.be.revertedWithCustomError(plain, "TaxDisabled");
  });

  it("accepts an ERC-2612 permit and rejects a long name", async function () {
    const { owner, factory, alice } = await signers();
    const token = await ethers.deployContract("AdvancedTokenPermit", [init(owner.address, factory.address, { name: "PermitToken" })]);
    expect(await token.decimals()).to.equal(18);
    const value = 25n;
    const deadline = (await networkHelpers.time.latest()) + 3600;
    const nonce = await token.nonces(owner.address);
    const signature = await owner.signTypedData(
      { name: "PermitToken", version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await token.getAddress() },
      {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { owner: owner.address, spender: alice.address, value, nonce, deadline },
    );
    const { v, r, s } = ethers.Signature.from(signature);
    await token.permit(owner.address, alice.address, value, deadline, v, r, s);
    expect(await token.allowance(owner.address, alice.address)).to.equal(value);
    expect(await token.nonces(owner.address)).to.equal(nonce + 1n);

    await expect(token.permit(owner.address, alice.address, value, deadline - 10_000, v, r, s)).to.be.revertedWithCustomError(
      token,
      "ERC2612ExpiredSignature",
    );
    await expect(token.permit(alice.address, owner.address, value, deadline, v, r, s)).to.be.revertedWithCustomError(
      token,
      "ERC2612InvalidSigner",
    );

    await expect(
      ethers.deployContract("AdvancedTokenPermit", [init(owner.address, factory.address, { name: "a".repeat(32) })]),
    ).to.be.revertedWithCustomError(await ethers.getContractFactory("AdvancedTokenPermit"), "StringTooLong");
    const maxName = await ethers.deployContract("AdvancedTokenPermit", [init(owner.address, factory.address, { name: "a".repeat(31) })]);
    expect(await maxName.name()).to.equal("a".repeat(31));
  });

  it("delegates votes and moves them on transfer", async function () {
    const { owner, factory, alice } = await signers();
    const supply = 1_000n;
    const token = await ethers.deployContract("AdvancedTokenVotes", [
      init(owner.address, factory.address, { name: "Votes", initialSupply: supply, hasMint: true }),
    ]);
    expect(await token.decimals()).to.equal(18);
    expect(await token.nonces(owner.address)).to.equal(0n);
    expect(await token.CLOCK_MODE()).to.equal("mode=blocknumber&from=default");
    expect(await token.getVotes(owner.address)).to.equal(0n);
    await token.delegate(owner.address);
    expect(await token.getVotes(owner.address)).to.equal(supply);
    const delegatedAt = await ethers.provider.getBlockNumber();
    await token.transfer(alice.address, 100n);
    expect(await token.getVotes(owner.address)).to.equal(supply - 100n);
    await token.connect(alice).delegate(owner.address);
    expect(await token.getVotes(owner.address)).to.equal(supply);
    await networkHelpers.mine();
    expect(await token.getPastVotes(owner.address, delegatedAt)).to.equal(supply);
    await token.mint(alice.address, 1n);
    expect(await token.balanceOf(alice.address)).to.equal(101n);

    const harness = await ethers.deployContract("VotesMaxSupplyHarness", [
      init(owner.address, factory.address, { name: "Cap", initialSupply: 10n, hasMint: true }),
    ]);
    await expect(harness.mint(alice.address, 1n)).to.be.revertedWithCustomError(harness, "ERC20ExceededSafeSupply");
  });

  it("moves ownership in two steps and excludes the new owner from tax", async function () {
    const { owner, factory, feeRecipient, alice } = await signers();
    const token = await ethers.deployContract("AdvancedToken", [
      init(owner.address, factory.address, {
        hasTax: true,
        feeRecipient: feeRecipient.address,
        sellFeeBps: 100,
        initialSupply: 1000n,
      }),
    ]);
    await token.transferOwnership(alice.address);
    expect(await token.pendingOwner()).to.equal(alice.address);
    await token.connect(alice).acceptOwnership();
    expect(await token.owner()).to.equal(alice.address);
    expect(await token.isExcluded(alice.address)).to.equal(true);
    expect(await token.isExcluded(owner.address)).to.equal(false);
    await token.transfer(alice.address, 100n);
    await token.connect(alice).setPool(owner.address, true);
    await token.connect(alice).transfer(owner.address, 100n);
    expect(await token.balanceOf(owner.address)).to.equal(1000n);
    expect(await token.balanceOf(feeRecipient.address)).to.equal(0n);
  });
});

import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { loadFixture } = networkHelpers;

describe("BasicERC20", function () {
  async function deployBasicERC20Fixture() {
    const [owner, otherAccount, thirdAccount] = await ethers.getSigners();
    const token = await ethers.deployContract("BasicERC20", [
      "Test Token",
      "TEST",
      18,
      1000,
      owner.address,
    ]);
    return { token, owner, otherAccount, thirdAccount };
  }

  describe("Deployment", function () {
    it("sets name, symbol, decimals and scaled supply", async function () {
      const { token, owner } = await loadFixture(deployBasicERC20Fixture);
      expect(await token.name()).to.equal("Test Token");
      expect(await token.symbol()).to.equal("TEST");
      expect(await token.decimals()).to.equal(18);
      const expectedSupply = ethers.parseUnits("1000", 18);
      expect(await token.totalSupply()).to.equal(expectedSupply);
      expect(await token.balanceOf(owner.address)).to.equal(expectedSupply);
    });

    it("scales supply by 10^decimals for 6 decimals", async function () {
      const [owner] = await ethers.getSigners();
      const token = await ethers.deployContract("BasicERC20", ["Six Decimals", "SIX", 6, 1000, owner.address]);
      expect(await token.decimals()).to.equal(6);
      expect(await token.balanceOf(owner.address)).to.equal(1000n * 10n ** 6n);
    });

    it("supports 0 decimals", async function () {
      const [owner] = await ethers.getSigners();
      const token = await ethers.deployContract("BasicERC20", ["Zero Decimals", "ZERO", 0, 1000, owner.address]);
      expect(await token.decimals()).to.equal(0);
      expect(await token.balanceOf(owner.address)).to.equal(1000n);
    });

    it("supports 30 decimals", async function () {
      const [owner] = await ethers.getSigners();
      const token = await ethers.deployContract("BasicERC20", ["Max Decimals", "MAX30", 30, 1, owner.address]);
      expect(await token.decimals()).to.equal(30);
      expect(await token.balanceOf(owner.address)).to.equal(10n ** 30n);
    });

    it("deploys with zero initial supply", async function () {
      const [owner] = await ethers.getSigners();
      const token = await ethers.deployContract("BasicERC20", ["Zero Supply", "ZERO", 18, 0, owner.address]);
      expect(await token.totalSupply()).to.equal(0n);
      expect(await token.balanceOf(owner.address)).to.equal(0n);
    });

    it("deploys at the maximum supply allowed for 18 decimals", async function () {
      const [owner] = await ethers.getSigners();
      const maxSafeSupply = ethers.MaxUint256 / 10n ** 18n;
      const token = await ethers.deployContract("BasicERC20", ["Max Token", "MAX", 18, maxSafeSupply, owner.address]);
      expect(await token.balanceOf(owner.address)).to.equal(maxSafeSupply * 10n ** 18n);
    });

    it("reverts if the initial owner is the zero address", async function () {
      await expect(
        ethers.deployContract("BasicERC20", ["Test Token", "TEST", 18, 1000, ethers.ZeroAddress]),
      ).to.be.revertedWith("Initial owner is zero");
    });

    it("reverts if decimals are above 30", async function () {
      const [owner] = await ethers.getSigners();
      await expect(
        ethers.deployContract("BasicERC20", ["Test Token", "TEST", 31, 1000, owner.address]),
      ).to.be.revertedWith("Decimals out of range");
    });

    it("reverts if supply exceeds MAX_SUPPLY", async function () {
      const [owner] = await ethers.getSigners();
      const maxSupply = ethers.MaxUint256 / 10n ** 18n;
      await expect(
        ethers.deployContract("BasicERC20", ["Test Token", "TEST", 18, maxSupply + 1n, owner.address]),
      ).to.be.revertedWith("Supply exceeds maximum");
    });

    it("reverts if scaling the supply would overflow", async function () {
      const [owner] = await ethers.getSigners();
      // For 18 decimals MAX_SUPPLY is the tighter bound. Above 18 decimals the
      // second check ("Supply overflow") is the one that fires.
      const overflowValue = ethers.MaxUint256 / 10n ** 30n + 1n;
      await expect(
        ethers.deployContract("BasicERC20", ["Test Token", "TEST", 30, overflowValue, owner.address]),
      ).to.be.revertedWith("Supply overflow");
    });
  });

  describe("Transfers", function () {
    it("transfers tokens and emits Transfer", async function () {
      const { token, owner, otherAccount } = await loadFixture(deployBasicERC20Fixture);
      const amount = ethers.parseUnits("50", 18);
      await expect(token.transfer(otherAccount.address, amount))
        .to.emit(token, "Transfer")
        .withArgs(owner.address, otherAccount.address, amount);
      expect(await token.balanceOf(otherAccount.address)).to.equal(amount);
    });

    it("reverts when the sender balance is too low", async function () {
      const { token, owner, otherAccount } = await loadFixture(deployBasicERC20Fixture);
      await expect(token.connect(otherAccount).transfer(owner.address, 1)).to.be.revertedWithCustomError(
        token,
        "ERC20InsufficientBalance",
      );
    });
  });

  describe("Allowances", function () {
    it("approves and emits Approval", async function () {
      const { token, owner, otherAccount } = await loadFixture(deployBasicERC20Fixture);
      const amount = ethers.parseUnits("100", 18);
      await expect(token.approve(otherAccount.address, amount))
        .to.emit(token, "Approval")
        .withArgs(owner.address, otherAccount.address, amount);
      expect(await token.allowance(owner.address, otherAccount.address)).to.equal(amount);
    });

    it("transferFrom spends allowance", async function () {
      const { token, owner, otherAccount, thirdAccount } = await loadFixture(deployBasicERC20Fixture);
      const approval = ethers.parseUnits("100", 18);
      const amount = ethers.parseUnits("50", 18);
      await token.approve(otherAccount.address, approval);
      await token.connect(otherAccount).transferFrom(owner.address, thirdAccount.address, amount);
      expect(await token.balanceOf(thirdAccount.address)).to.equal(amount);
      expect(await token.allowance(owner.address, otherAccount.address)).to.equal(approval - amount);
    });

    it("reverts transferFrom without allowance", async function () {
      const { token, owner, otherAccount } = await loadFixture(deployBasicERC20Fixture);
      await expect(
        token.connect(otherAccount).transferFrom(owner.address, otherAccount.address, 1),
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });

    it("reverts transferFrom when allowance is too low", async function () {
      const { token, owner, otherAccount } = await loadFixture(deployBasicERC20Fixture);
      await token.approve(otherAccount.address, ethers.parseUnits("50", 18));
      await expect(
        token.connect(otherAccount).transferFrom(owner.address, otherAccount.address, ethers.parseUnits("100", 18)),
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });
  });
});

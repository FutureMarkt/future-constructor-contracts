import { expect } from "chai";
import hre from "hardhat";

// Simple fixture helper
async function loadFixture<T>(fixture: () => Promise<T>): Promise<T> {
  return fixture();
}

describe("BasicERC20", function () {
  // Test fixtures for reusability
  async function deployBasicERC20Fixture() {
    const [owner, otherAccount] = await hre.ethers.getSigners();

    const BasicERC20Factory = await hre.ethers.getContractFactory("BasicERC20");
    const token = await BasicERC20Factory.deploy(
      "Test Token",
      "TEST",
      18,
      1000,
      owner.address
    );

    return { token, owner, otherAccount };
  }

  async function deployWithCustomDecimalsFixture() {
    const [owner] = await hre.ethers.getSigners();

    const BasicERC20Factory = await hre.ethers.getContractFactory("BasicERC20");
    const token = await BasicERC20Factory.deploy(
      "Six Decimals",
      "SIX",
      6,
      1000,
      owner.address
    );

    return { token, owner };
  }

  async function deployZeroDecimalsFixture() {
    const [owner] = await hre.ethers.getSigners();

    const BasicERC20Factory = await hre.ethers.getContractFactory("BasicERC20");
    const token = await BasicERC20Factory.deploy(
      "Zero Decimals",
      "ZERO",
      0,
      1000,
      owner.address
    );

    return { token, owner };
  }

  describe("Deployment", function () {
    it("Should set the correct name", async function () {
      const { token } = await loadFixture(deployBasicERC20Fixture);
      expect(await token.name()).to.equal("Test Token");
    });

    it("Should set the correct symbol", async function () {
      const { token } = await loadFixture(deployBasicERC20Fixture);
      expect(await token.symbol()).to.equal("TEST");
    });

    it("Should set the correct decimals", async function () {
      const { token } = await loadFixture(deployBasicERC20Fixture);
      expect(await token.decimals()).to.equal(18);
    });

    it("Should mint initial supply to owner", async function () {
      const { token, owner } = await loadFixture(deployBasicERC20Fixture);
      // 1000 * 10^18
      const expectedSupply = hre.ethers.parseUnits("1000", 18);
      expect(await token.balanceOf(owner.address)).to.equal(expectedSupply);
    });

    it("Should set the total supply correctly", async function () {
      const { token } = await loadFixture(deployBasicERC20Fixture);
      const expectedSupply = hre.ethers.parseUnits("1000", 18);
      expect(await token.totalSupply()).to.equal(expectedSupply);
    });

    it("Should handle custom decimals correctly", async function () {
      const { token, owner } = await loadFixture(deployWithCustomDecimalsFixture);
      expect(await token.decimals()).to.equal(6);
      // 1000 * 10^6
      const expectedSupply = 1000n * 10n ** 6n;
      expect(await token.balanceOf(owner.address)).to.equal(expectedSupply);
    });

    it("Should handle zero decimals correctly", async function () {
      const { token, owner } = await loadFixture(deployZeroDecimalsFixture);
      expect(await token.decimals()).to.equal(0);
      // 1000 * 10^0 = 1000
      expect(await token.balanceOf(owner.address)).to.equal(1000n);
    });

    it("Should revert if initial owner is zero address", async function () {
      const BasicERC20Factory = await hre.ethers.getContractFactory("BasicERC20");
      await expect(
        BasicERC20Factory.deploy(
          "Test Token",
          "TEST",
          18,
          1000,
          hre.ethers.ZeroAddress
        )
      ).to.be.revertedWith("Initial owner is zero");
    });

    it("Should revert if decimals are out of range (> 30)", async function () {
      const [owner] = await hre.ethers.getSigners();
      const BasicERC20Factory = await hre.ethers.getContractFactory("BasicERC20");
      await expect(
        BasicERC20Factory.deploy(
          "Test Token",
          "TEST",
          31,
          1000,
          owner.address
        )
      ).to.be.revertedWith("Decimals out of range");
    });

    it("Should revert if supply exceeds maximum", async function () {
      const [owner] = await hre.ethers.getSigners();
      const BasicERC20Factory = await hre.ethers.getContractFactory("BasicERC20");
      const maxSupply = hre.ethers.MaxUint256 / 10n ** 18n;
      await expect(
        BasicERC20Factory.deploy(
          "Test Token",
          "TEST",
          18,
          maxSupply + 1n,
          owner.address
        )
      ).to.be.revertedWith("Supply exceeds maximum");
    });

    it("Should revert on supply overflow during multiplication", async function () {
      const [owner] = await hre.ethers.getSigners();
      const BasicERC20Factory = await hre.ethers.getContractFactory("BasicERC20");
      // Value that would overflow when multiplied by 10^18
      const overflowValue = hre.ethers.MaxUint256 / 10n ** 17n;
      await expect(
        BasicERC20Factory.deploy(
          "Test Token",
          "TEST",
          18,
          overflowValue,
          owner.address
        )
      ).to.be.revertedWith("Supply overflow");
    });

    it("Should deploy with zero initial supply", async function () {
      const [owner] = await hre.ethers.getSigners();
      const BasicERC20Factory = await hre.ethers.getContractFactory("BasicERC20");
      const token = await BasicERC20Factory.deploy(
        "Zero Supply",
        "ZERO",
        18,
        0,
        owner.address
      );
      expect(await token.totalSupply()).to.equal(0);
      expect(await token.balanceOf(owner.address)).to.equal(0);
    });

    it("Should deploy with maximum safe supply and 18 decimals", async function () {
      const [owner] = await hre.ethers.getSigners();
      const BasicERC20Factory = await hre.ethers.getContractFactory("BasicERC20");
      const maxSafeSupply = hre.ethers.MaxUint256 / 10n ** 18n;
      const token = await BasicERC20Factory.deploy(
        "Max Token",
        "MAX",
        18,
        maxSafeSupply,
        owner.address
      );
      const expectedBalance = maxSafeSupply * 10n ** 18n;
      expect(await token.balanceOf(owner.address)).to.equal(expectedBalance);
    });

    it("Should deploy with 30 decimals (edge case)", async function () {
      const [owner] = await hre.ethers.getSigners();
      const BasicERC20Factory = await hre.ethers.getContractFactory("BasicERC20");
      const token = await BasicERC20Factory.deploy(
        "Max Decimals",
        "MAX30",
        30,
        1,
        owner.address
      );
      expect(await token.decimals()).to.equal(30);
      expect(await token.balanceOf(owner.address)).to.equal(10n ** 30n);
    });
  });

  describe("Transfers", function () {
    it("Should transfer tokens between accounts", async function () {
      const { token, owner, otherAccount } = await loadFixture(deployBasicERC20Fixture);
      const transferAmount = hre.ethers.parseUnits("50", 18);

      await expect(
        token.transfer(otherAccount.address, transferAmount)
      ).to.changeTokenBalances(
        token,
        [owner, otherAccount],
        [-transferAmount, transferAmount]
      );
    });

    it("Should emit Transfer event", async function () {
      const { token, owner, otherAccount } = await loadFixture(deployBasicERC20Fixture);
      const transferAmount = hre.ethers.parseUnits("50", 18);

      await expect(token.transfer(otherAccount.address, transferAmount))
        .to.emit(token, "Transfer")
        .withArgs(owner.address, otherAccount.address, transferAmount);
    });

    it("Should fail if sender doesn't have enough tokens", async function () {
      const { token, owner, otherAccount } = await loadFixture(deployBasicERC20Fixture);
      const initialOwnerBalance = await token.balanceOf(owner.address);

      await expect(
        token.connect(otherAccount).transfer(owner.address, 1)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });
  });

  describe("Allowances", function () {
    it("Should approve spending and emit Approval event", async function () {
      const { token, owner, otherAccount } = await loadFixture(deployBasicERC20Fixture);
      const approvalAmount = hre.ethers.parseUnits("100", 18);

      await expect(token.approve(otherAccount.address, approvalAmount))
        .to.emit(token, "Approval")
        .withArgs(owner.address, otherAccount.address, approvalAmount);

      expect(await token.allowance(owner.address, otherAccount.address)).to.equal(
        approvalAmount
      );
    });

    it("Should allow transferFrom with proper allowance", async function () {
      const { token, owner, otherAccount } = await loadFixture(deployBasicERC20Fixture);
      const [, , thirdAccount] = await hre.ethers.getSigners();
      const approvalAmount = hre.ethers.parseUnits("100", 18);
      const transferAmount = hre.ethers.parseUnits("50", 18);

      await token.approve(otherAccount.address, approvalAmount);

      await expect(
        token
          .connect(otherAccount)
          .transferFrom(owner.address, thirdAccount.address, transferAmount)
      ).to.changeTokenBalances(
        token,
        [owner, thirdAccount],
        [-transferAmount, transferAmount]
      );

      expect(await token.allowance(owner.address, otherAccount.address)).to.equal(
        approvalAmount - transferAmount
      );
    });

    it("Should fail transferFrom without allowance", async function () {
      const { token, owner, otherAccount } = await loadFixture(deployBasicERC20Fixture);
      const transferAmount = hre.ethers.parseUnits("50", 18);

      await expect(
        token
          .connect(otherAccount)
          .transferFrom(owner.address, otherAccount.address, transferAmount)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });

    it("Should fail transferFrom if allowance is too low", async function () {
      const { token, owner, otherAccount } = await loadFixture(deployBasicERC20Fixture);
      const approvalAmount = hre.ethers.parseUnits("50", 18);
      const transferAmount = hre.ethers.parseUnits("100", 18);

      await token.approve(otherAccount.address, approvalAmount);

      await expect(
        token
          .connect(otherAccount)
          .transferFrom(owner.address, otherAccount.address, transferAmount)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });
  });
});

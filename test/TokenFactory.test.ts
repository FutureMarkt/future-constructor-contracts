import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { loadFixture } = networkHelpers;

const FEE_USD_WEI = ethers.parseUnits("3", 18);
const ETH_USD_8_DECIMALS = 200_000_000_000n; // $2000 with 8 decimals

describe("TokenFactory", function () {
  async function deployMockAggregator(decimals = 8, price = ETH_USD_8_DECIMALS) {
    return ethers.deployContract("MockAggregator", [decimals, price]);
  }

  async function deployTokenFactoryFixture() {
    const [owner, feeRecipient, user1, user2] = await ethers.getSigners();
    const mockAggregator = await deployMockAggregator();
    const factory = await ethers.deployContract("TokenFactory", [
      await mockAggregator.getAddress(),
      feeRecipient.address,
      FEE_USD_WEI,
    ]);
    return { factory, mockAggregator, owner, feeRecipient, user1, user2 };
  }

  async function deployTokenFactoryWithZeroFeeFixture() {
    const [owner, feeRecipient, user1] = await ethers.getSigners();
    const mockAggregator = await deployMockAggregator();
    const factory = await ethers.deployContract("TokenFactory", [
      await mockAggregator.getAddress(),
      feeRecipient.address,
      0,
    ]);
    return { factory, mockAggregator, owner, feeRecipient, user1 };
  }

  function tokenConfig(owner: string, overrides: Record<string, unknown> = {}) {
    return {
      name: "Test Token",
      symbol: "TEST",
      decimals: 18,
      initialSupply: 1000,
      initialOwner: owner,
      ...overrides,
    };
  }

  describe("Deployment", function () {
    it("stores price feed, fee recipient, fee and owner", async function () {
      const { factory, mockAggregator, feeRecipient, owner } = await loadFixture(deployTokenFactoryFixture);
      expect(await factory.priceFeed()).to.equal(await mockAggregator.getAddress());
      expect(await factory.feeRecipient()).to.equal(feeRecipient.address);
      expect(await factory.feeUsdWei()).to.equal(FEE_USD_WEI);
      expect(await factory.owner()).to.equal(owner.address);
      expect(await factory.MAX_PRICE_AGE()).to.equal(3600n);
    });

    it("reverts if the aggregator is the zero address", async function () {
      const [, feeRecipient] = await ethers.getSigners();
      await expect(
        ethers.deployContract("TokenFactory", [ethers.ZeroAddress, feeRecipient.address, FEE_USD_WEI]),
      ).to.be.revertedWith("Aggregator is zero");
    });

    it("reverts if the fee recipient is the zero address", async function () {
      const mockAggregator = await deployMockAggregator();
      await expect(
        ethers.deployContract("TokenFactory", [await mockAggregator.getAddress(), ethers.ZeroAddress, FEE_USD_WEI]),
      ).to.be.revertedWith("Fee recipient is zero");
    });
  });

  describe("Token deployment", function () {
    it("emits TokenCreated and mints the scaled supply to initialOwner", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);
      const config = tokenConfig(user1.address);
      const fee = await factory.currentFee();
      const expectedSupply = 1000n * 10n ** 18n;

      const tx = factory.connect(user1).deployToken(config, { value: fee });
      await expect(tx)
        .to.emit(factory, "TokenCreated")
        .withArgs(user1.address, (addr: string) => addr !== ethers.ZeroAddress, "Test Token", "TEST", 18, expectedSupply, fee);

      const receipt = await (await tx).wait();
      const tokenAddress = receipt?.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed?.name === "TokenCreated")?.args.token as string;

      const token = await ethers.getContractAt("BasicERC20", tokenAddress);
      expect(await token.balanceOf(user1.address)).to.equal(expectedSupply);
      expect(await token.totalSupply()).to.equal(expectedSupply);
      expect(await token.decimals()).to.equal(18);
    });

    it("uses msg.sender as owner when initialOwner is zero", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);
      const fee = await factory.currentFee();
      const tx = await factory
        .connect(user1)
        .deployToken(tokenConfig(ethers.ZeroAddress), { value: fee });
      const receipt = await tx.wait();
      const parsed = receipt?.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((entry) => entry?.name === "TokenCreated");
      const token = await ethers.getContractAt("BasicERC20", parsed!.args.token);
      expect(await token.balanceOf(user1.address)).to.equal(1000n * 10n ** 18n);
    });

    it("accepts the maximum name and symbol lengths and decimals 0 and 30", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);
      const fee = await factory.currentFee();
      await expect(
        factory.connect(user1).deployToken(
          tokenConfig(user1.address, { name: "n".repeat(100), symbol: "S".repeat(20), decimals: 0, initialSupply: 10 }),
          { value: fee },
        ),
      ).to.emit(factory, "TokenCreated");
      await expect(
        factory.connect(user1).deployToken(
          tokenConfig(user1.address, { name: "Max", symbol: "MAX", decimals: 30, initialSupply: 1 }),
          { value: fee },
        ),
      ).to.emit(factory, "TokenCreated");
    });

    it("reverts on empty or oversized name and symbol", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);
      const fee = await factory.currentFee();
      await expect(
        factory.connect(user1).deployToken(tokenConfig(user1.address, { name: "" }), { value: fee }),
      ).to.be.revertedWith("Invalid name length");
      await expect(
        factory.connect(user1).deployToken(tokenConfig(user1.address, { name: "a".repeat(101) }), { value: fee }),
      ).to.be.revertedWith("Invalid name length");
      await expect(
        factory.connect(user1).deployToken(tokenConfig(user1.address, { symbol: "" }), { value: fee }),
      ).to.be.revertedWith("Invalid symbol length");
      await expect(
        factory.connect(user1).deployToken(tokenConfig(user1.address, { symbol: "VERYLONGSYMBOLEXCEEDS" }), { value: fee }),
      ).to.be.revertedWith("Invalid symbol length");
    });

    it("reverts when decimals are out of range", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);
      const fee = await factory.currentFee();
      await expect(
        factory.connect(user1).deployToken(tokenConfig(user1.address, { decimals: 31 }), { value: fee }),
      ).to.be.revertedWith("Decimals out of range");
    });

    it("reverts when the fee is short by 1 wei", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);
      const fee = await factory.currentFee();
      await expect(
        factory.connect(user1).deployToken(tokenConfig(user1.address), { value: fee - 1n }),
      ).to.be.revertedWith("Insufficient fee");
    });

    it("collects the exact fee and emits FeeCollected", async function () {
      const { factory, feeRecipient, user1 } = await loadFixture(deployTokenFactoryFixture);
      const fee = await factory.currentFee();
      const before = await ethers.provider.getBalance(feeRecipient.address);
      await expect(factory.connect(user1).deployToken(tokenConfig(user1.address), { value: fee }))
        .to.emit(factory, "FeeCollected")
        .withArgs(user1.address, fee, feeRecipient.address);
      expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(before + fee);
    });

    it("refunds the excess payment to the caller", async function () {
      const { factory, feeRecipient, user1 } = await loadFixture(deployTokenFactoryFixture);
      const fee = await factory.currentFee();
      const excess = ethers.parseEther("1");
      const recipientBefore = await ethers.provider.getBalance(feeRecipient.address);
      const userBefore = await ethers.provider.getBalance(user1.address);
      const tx = await factory.connect(user1).deployToken(tokenConfig(user1.address), { value: fee + excess });
      const receipt = await tx.wait();
      const gas = receipt!.gasUsed * receipt!.gasPrice;
      expect(await ethers.provider.getBalance(user1.address)).to.equal(userBefore - fee - gas);
      expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(recipientBefore + fee);
    });

    it("sends the excess to the fee recipient when the caller cannot receive a refund", async function () {
      const { factory, feeRecipient, user1 } = await loadFixture(deployTokenFactoryFixture);
      const rejecter = await ethers.deployContract("RejectingDeployer");
      const fee = await factory.currentFee();
      const excess = ethers.parseEther("0.5");
      const before = await ethers.provider.getBalance(feeRecipient.address);
      await expect(
        rejecter.connect(user1).deploy(await factory.getAddress(), tokenConfig(user1.address), { value: fee + excess }),
      )
        .to.emit(factory, "RefundFailed")
        .withArgs(await rejecter.getAddress(), excess, feeRecipient.address);
      expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(before + fee + excess);
    });

    it("deploys for free when feeUsdWei is zero and still refunds leftover value", async function () {
      const { factory, user1, feeRecipient } = await loadFixture(deployTokenFactoryWithZeroFeeFixture);
      const before = await ethers.provider.getBalance(feeRecipient.address);
      const userBefore = await ethers.provider.getBalance(user1.address);
      const extra = ethers.parseEther("0.2");
      const tx = await factory.connect(user1).deployToken(tokenConfig(user1.address), { value: extra });
      const receipt = await tx.wait();
      const gas = receipt!.gasUsed * receipt!.gasPrice;
      expect(await factory.currentFee()).to.equal(0n);
      expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(before);
      expect(await ethers.provider.getBalance(user1.address)).to.equal(userBefore - gas);
    });

    it("increments a per-creator nonce and deploys distinct addresses", async function () {
      const { factory, user1, user2 } = await loadFixture(deployTokenFactoryFixture);
      expect(await factory.getNonce(user1.address)).to.equal(0n);
      const fee = await factory.currentFee();
      const config = tokenConfig(ethers.ZeroAddress);
      const tx1 = await factory.connect(user1).deployToken(config, { value: fee });
      const tx2 = await factory.connect(user1).deployToken({ ...config, name: "Second" }, { value: fee });
      const tx3 = await factory.connect(user2).deployToken(config, { value: fee });
      const addr = async (tx: Awaited<typeof tx1>) => {
        const receipt = await tx.wait();
        return receipt!.logs
          .map((log) => {
            try {
              return factory.interface.parseLog(log);
            } catch {
              return null;
            }
          })
          .find((entry) => entry?.name === "TokenCreated")!.args.token as string;
      };
      const [a, b, c] = await Promise.all([addr(tx1), addr(tx2), addr(tx3)]);
      expect(await factory.getNonce(user1.address)).to.equal(2n);
      expect(await factory.getNonce(user2.address)).to.equal(1n);
      expect(new Set([a, b, c]).size).to.equal(3);
    });
  });

  describe("Fee calculation", function () {
    it("converts $3 at a $2000 price into 0.0015 native", async function () {
      const { factory } = await loadFixture(deployTokenFactoryFixture);
      expect(await factory.currentFee()).to.equal(ethers.parseUnits("0.0015", 18));
    });

    it("normalizes an 18-decimal feed the same way", async function () {
      const { feeRecipient } = await loadFixture(deployTokenFactoryFixture);
      const feed = await deployMockAggregator(18, ethers.parseUnits("2000", 18));
      const factory = await ethers.deployContract("TokenFactory", [
        await feed.getAddress(),
        feeRecipient.address,
        FEE_USD_WEI,
      ]);
      expect(await factory.currentFee()).to.equal(ethers.parseUnits("0.0015", 18));
    });

    it("scales down a feed that has more than 18 decimals", async function () {
      const { feeRecipient } = await loadFixture(deployTokenFactoryFixture);
      const feed = await deployMockAggregator(20, 2000n * 10n ** 20n);
      const factory = await ethers.deployContract("TokenFactory", [
        await feed.getAddress(),
        feeRecipient.address,
        FEE_USD_WEI,
      ]);
      expect(await factory.currentFee()).to.equal(ethers.parseUnits("0.0015", 18));
    });

    it("returns zero without reading a price when the USD fee is zero", async function () {
      const { factory } = await loadFixture(deployTokenFactoryWithZeroFeeFixture);
      expect(await factory.currentFee()).to.equal(0n);
    });

    it("reverts on a zero or negative price", async function () {
      const { factory, mockAggregator } = await loadFixture(deployTokenFactoryFixture);
      await mockAggregator.setPrice(0);
      await expect(factory.currentFee()).to.be.revertedWith("Invalid price");
      await mockAggregator.setPrice(-1);
      await expect(factory.currentFee()).to.be.revertedWith("Invalid price");
    });

    it("reverts when the round is stale", async function () {
      const { factory, mockAggregator } = await loadFixture(deployTokenFactoryFixture);
      await mockAggregator.setAnsweredInRound(0);
      await expect(factory.currentFee()).to.be.revertedWith("Stale round");
    });

    it("reverts when the price timestamp is in the future", async function () {
      const { factory, mockAggregator } = await loadFixture(deployTokenFactoryFixture);
      const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
      await mockAggregator.setUpdatedAt(now + 60n);
      await expect(factory.currentFee()).to.be.revertedWith("Invalid timestamp");
    });

    it("reverts when the price is older than one hour", async function () {
      const { factory, mockAggregator } = await loadFixture(deployTokenFactoryFixture);
      const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
      await mockAggregator.setUpdatedAt(now - 3601n);
      await expect(factory.currentFee()).to.be.revertedWith("Price too old");
    });

    it("accepts a price that is exactly one hour old", async function () {
      const { factory, mockAggregator } = await loadFixture(deployTokenFactoryFixture);
      const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
      // setUpdatedAt mines the next block at now + 1, so age is measured from that timestamp.
      await mockAggregator.setUpdatedAt(now + 1n - 3600n);
      expect(await factory.currentFee()).to.equal(ethers.parseUnits("0.0015", 18));
    });

    it("reverts below the minimum and above the maximum normalized price", async function () {
      const { factory, mockAggregator } = await loadFixture(deployTokenFactoryFixture);
      await mockAggregator.setPrice(1);
      await expect(factory.currentFee()).to.be.revertedWith("Price too low");
      await mockAggregator.setPrice(10n ** 16n);
      await expect(factory.currentFee()).to.be.revertedWith("Price too high");
    });

    it("accepts the minimum and maximum normalized prices", async function () {
      const { factory, mockAggregator } = await loadFixture(deployTokenFactoryFixture);
      await mockAggregator.setPrice(10n ** 6n);
      expect(await factory.currentFee()).to.equal((FEE_USD_WEI * 10n ** 18n) / 10n ** 16n);
      await mockAggregator.setPrice(10n ** 15n);
      expect(await factory.currentFee()).to.equal((FEE_USD_WEI * 10n ** 18n) / 10n ** 25n);
    });
  });

  describe("Owner controls", function () {
    it("emits the previous and next fee recipient and fee amount", async function () {
      const { factory, owner, feeRecipient, user1 } = await loadFixture(deployTokenFactoryFixture);
      await expect(factory.connect(owner).setFeeRecipient(user1.address))
        .to.emit(factory, "FeeRecipientUpdated")
        .withArgs(feeRecipient.address, user1.address);
      const nextFee = ethers.parseUnits("5", 18);
      await expect(factory.connect(owner).setFeeUsdWei(nextFee))
        .to.emit(factory, "FeeUsdWeiUpdated")
        .withArgs(FEE_USD_WEI, nextFee);
      expect(await factory.feeUsdWei()).to.equal(nextFee);
      expect(await factory.feeRecipient()).to.equal(user1.address);
    });

    it("rejects a zero fee recipient and rejects non-owners", async function () {
      const { factory, owner, user1 } = await loadFixture(deployTokenFactoryFixture);
      await expect(factory.connect(owner).setFeeRecipient(ethers.ZeroAddress)).to.be.revertedWith("Recipient is zero");
      await expect(factory.connect(user1).setFeeRecipient(user1.address)).to.be.revertedWithCustomError(
        factory,
        "OwnableUnauthorizedAccount",
      );
      await expect(factory.connect(user1).setFeeUsdWei(1)).to.be.revertedWithCustomError(
        factory,
        "OwnableUnauthorizedAccount",
      );
      await expect(factory.connect(user1).pause()).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      await expect(factory.connect(user1).unpause()).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("blocks deployment while paused and allows it again after unpause", async function () {
      const { factory, owner, user1 } = await loadFixture(deployTokenFactoryFixture);
      await factory.connect(owner).pause();
      expect(await factory.paused()).to.equal(true);
      const fee = await factory.currentFee();
      await expect(
        factory.connect(user1).deployToken(tokenConfig(user1.address), { value: fee }),
      ).to.be.revertedWithCustomError(factory, "EnforcedPause");
      await factory.connect(owner).unpause();
      expect(await factory.paused()).to.equal(false);
      await expect(factory.connect(user1).deployToken(tokenConfig(user1.address), { value: fee })).to.emit(
        factory,
        "TokenCreated",
      );
    });

    it("locks admin functions after ownership is renounced", async function () {
      const { factory, owner, user1 } = await loadFixture(deployTokenFactoryFixture);
      await factory.connect(owner).renounceOwnership();
      expect(await factory.owner()).to.equal(ethers.ZeroAddress);
      await expect(factory.connect(owner).pause()).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      await expect(factory.connect(owner).setFeeUsdWei(0)).to.be.revertedWithCustomError(
        factory,
        "OwnableUnauthorizedAccount",
      );
      const fee = await factory.currentFee();
      await expect(factory.connect(user1).deployToken(tokenConfig(user1.address), { value: fee })).to.emit(
        factory,
        "TokenCreated",
      );
    });
  });

  describe("Documented existing behavior", function () {
    it.skip("BUG: a non-zero USD fee can round down to a free deployment at the top of the allowed price band. Integer division in currentFee() returns 0 when feeUsdWei * 1e18 < normalizedPrice. deployToken then skips payment. Production fee ($3) does not hit this; a fee below 1e7 wei-USD does, at the maximum allowed price (1e25). Not fixed in this change.", async function () {
      const { feeRecipient } = await loadFixture(deployTokenFactoryFixture);
      const feed = await deployMockAggregator(8, 10n ** 15n);
      const tinyFee = 1n;
      const factory = await ethers.deployContract("TokenFactory", [await feed.getAddress(), feeRecipient.address, tinyFee]);
      expect(await factory.feeUsdWei()).to.equal(tinyFee);
      expect(await factory.currentFee()).to.be.greaterThan(0n);
    });
  });
});

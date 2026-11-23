import { expect } from "chai";
import hre from "hardhat";

// Simple fixture helper
async function loadFixture<T>(fixture: () => Promise<T>): Promise<T> {
  return fixture();
}

// Simple time helper
const time = {
  async increase(seconds: number) {
    await hre.ethers.provider.send("evm_increaseTime", [seconds]);
    await hre.ethers.provider.send("evm_mine", []);
  },
};

describe("TokenFactory", function () {
  const FEE_USD_WEI = hre.ethers.parseUnits("3", 18); // $3 USD

  // Mock price feed that returns a simple price
  async function deployMockAggregator() {
    const MockAggregatorFactory = await hre.ethers.getContractFactory(
      "contracts/vendor/AggregatorV3Interface.sol:AggregatorV3Interface"
    );
    // For testing, we'll use a real mock contract
    const MockAggregator = await hre.ethers.getContractFactory("MockAggregator");
    const mockAggregator = await MockAggregator.deploy(
      8, // decimals
      200000000000 // $2000 (8 decimals)
    );
    return mockAggregator;
  }

  async function deployTokenFactoryFixture() {
    const [owner, feeRecipient, user1, user2] = await hre.ethers.getSigners();

    const mockAggregator = await deployMockAggregator();

    const TokenFactoryContract = await hre.ethers.getContractFactory("TokenFactory");
    const factory = await TokenFactoryContract.deploy(
      await mockAggregator.getAddress(),
      feeRecipient.address,
      FEE_USD_WEI
    );

    return { factory, mockAggregator, owner, feeRecipient, user1, user2 };
  }

  async function deployTokenFactoryWithZeroFeeFixture() {
    const [owner, feeRecipient, user1] = await hre.ethers.getSigners();

    const mockAggregator = await deployMockAggregator();

    const TokenFactoryContract = await hre.ethers.getContractFactory("TokenFactory");
    const factory = await TokenFactoryContract.deploy(
      await mockAggregator.getAddress(),
      feeRecipient.address,
      0
    );

    return { factory, mockAggregator, owner, feeRecipient, user1 };
  }

  describe("Deployment", function () {
    it("Should set the correct price feed address", async function () {
      const { factory, mockAggregator } = await loadFixture(deployTokenFactoryFixture);
      expect(await factory.priceFeed()).to.equal(await mockAggregator.getAddress());
    });

    it("Should set the correct fee recipient", async function () {
      const { factory, feeRecipient } = await loadFixture(deployTokenFactoryFixture);
      expect(await factory.feeRecipient()).to.equal(feeRecipient.address);
    });

    it("Should set the correct fee amount", async function () {
      const { factory } = await loadFixture(deployTokenFactoryFixture);
      expect(await factory.feeUsdWei()).to.equal(FEE_USD_WEI);
    });

    it("Should set the correct owner", async function () {
      const { factory, owner } = await loadFixture(deployTokenFactoryFixture);
      expect(await factory.owner()).to.equal(owner.address);
    });

    it("Should revert if aggregator is zero address", async function () {
      const [owner, feeRecipient] = await hre.ethers.getSigners();
      const TokenFactoryContract = await hre.ethers.getContractFactory("TokenFactory");
      await expect(
        TokenFactoryContract.deploy(
          hre.ethers.ZeroAddress,
          feeRecipient.address,
          FEE_USD_WEI
        )
      ).to.be.revertedWith("Aggregator is zero");
    });

    it("Should revert if fee recipient is zero address", async function () {
      const mockAggregator = await deployMockAggregator();
      const TokenFactoryContract = await hre.ethers.getContractFactory("TokenFactory");
      await expect(
        TokenFactoryContract.deploy(
          await mockAggregator.getAddress(),
          hre.ethers.ZeroAddress,
          FEE_USD_WEI
        )
      ).to.be.revertedWith("Fee recipient is zero");
    });
  });

  describe("Token Deployment", function () {
    it("Should deploy a token with correct parameters", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);

      const tokenConfig = {
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      const fee = await factory.currentFee();
      const tx = await factory.connect(user1).deployToken(tokenConfig, { value: fee });
      const receipt = await tx.wait();

      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "TokenCreated"
      );
      expect(event).to.not.be.undefined;
    });

    it("Should emit TokenCreated event with correct parameters", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);

      const tokenConfig = {
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      const fee = await factory.currentFee();
      const expectedSupply = 1000n * 10n ** 18n;

      await expect(factory.connect(user1).deployToken(tokenConfig, { value: fee }))
        .to.emit(factory, "TokenCreated")
        .withArgs(
          user1.address,
          (addr: string) => addr !== hre.ethers.ZeroAddress,
          "Test Token",
          "TEST",
          18,
          expectedSupply,
          fee
        );
    });

    it("Should deploy token with msg.sender as owner if initialOwner is zero", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);

      const tokenConfig = {
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: hre.ethers.ZeroAddress,
      };

      const fee = await factory.currentFee();
      const tx = await factory.connect(user1).deployToken(tokenConfig, { value: fee });
      const receipt = await tx.wait();

      const event = receipt?.logs.find(
        (log: any) => log.fragment?.name === "TokenCreated"
      );
      
      const tokenAddress = (event as any).args[1];
      const token = await hre.ethers.getContractAt("BasicERC20", tokenAddress);
      
      expect(await token.balanceOf(user1.address)).to.equal(1000n * 10n ** 18n);
    });

    it("Should revert if name is empty", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);

      const tokenConfig = {
        name: "",
        symbol: "TEST",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      const fee = await factory.currentFee();
      await expect(
        factory.connect(user1).deployToken(tokenConfig, { value: fee })
      ).to.be.revertedWith("Invalid name length");
    });

    it("Should revert if name is too long (> 100 characters)", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);

      const longName = "a".repeat(101);
      const tokenConfig = {
        name: longName,
        symbol: "TEST",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      const fee = await factory.currentFee();
      await expect(
        factory.connect(user1).deployToken(tokenConfig, { value: fee })
      ).to.be.revertedWith("Invalid name length");
    });

    it("Should revert if symbol is empty", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);

      const tokenConfig = {
        name: "Test Token",
        symbol: "",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      const fee = await factory.currentFee();
      await expect(
        factory.connect(user1).deployToken(tokenConfig, { value: fee })
      ).to.be.revertedWith("Invalid symbol length");
    });

    it("Should revert if symbol is too long (> 20 characters)", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);

      const tokenConfig = {
        name: "Test Token",
        symbol: "VERYLONGSYMBOLEXCEEDS",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      const fee = await factory.currentFee();
      await expect(
        factory.connect(user1).deployToken(tokenConfig, { value: fee })
      ).to.be.revertedWith("Invalid symbol length");
    });

    it("Should revert if decimals are out of range (> 30)", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);

      const tokenConfig = {
        name: "Test Token",
        symbol: "TEST",
        decimals: 31,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      const fee = await factory.currentFee();
      await expect(
        factory.connect(user1).deployToken(tokenConfig, { value: fee })
      ).to.be.revertedWith("Decimals out of range");
    });

    it("Should deploy token with 0 decimals", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);

      const tokenConfig = {
        name: "Zero Decimals",
        symbol: "ZERO",
        decimals: 0,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      const fee = await factory.currentFee();
      await expect(factory.connect(user1).deployToken(tokenConfig, { value: fee }))
        .to.emit(factory, "TokenCreated");
    });

    it("Should deploy token with 30 decimals", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);

      const tokenConfig = {
        name: "Max Decimals",
        symbol: "MAX",
        decimals: 30,
        initialSupply: 1,
        initialOwner: user1.address,
      };

      const fee = await factory.currentFee();
      await expect(factory.connect(user1).deployToken(tokenConfig, { value: fee }))
        .to.emit(factory, "TokenCreated");
    });

    it("Should revert if fee is insufficient", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);

      const tokenConfig = {
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      const fee = await factory.currentFee();
      await expect(
        factory.connect(user1).deployToken(tokenConfig, { value: fee - 1n })
      ).to.be.revertedWith("Insufficient fee");
    });

    it("Should refund excess payment", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);

      const tokenConfig = {
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      const fee = await factory.currentFee();
      const excess = hre.ethers.parseEther("1");
      const totalPayment = fee + excess;

      const balanceBefore = await hre.ethers.provider.getBalance(user1.address);
      const tx = await factory.connect(user1).deployToken(tokenConfig, { value: totalPayment });
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await hre.ethers.provider.getBalance(user1.address);

      const expectedBalance = balanceBefore - fee - gasUsed;
      expect(balanceAfter).to.be.closeTo(expectedBalance, hre.ethers.parseEther("0.001"));
    });

    it("Should collect fee and send to fee recipient", async function () {
      const { factory, feeRecipient, user1 } = await loadFixture(deployTokenFactoryFixture);

      const tokenConfig = {
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      const fee = await factory.currentFee();
      const balanceBefore = await hre.ethers.provider.getBalance(feeRecipient.address);

      await factory.connect(user1).deployToken(tokenConfig, { value: fee });

      const balanceAfter = await hre.ethers.provider.getBalance(feeRecipient.address);
      expect(balanceAfter - balanceBefore).to.equal(fee);
    });

    it("Should emit FeeCollected event", async function () {
      const { factory, feeRecipient, user1 } = await loadFixture(deployTokenFactoryFixture);

      const tokenConfig = {
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      const fee = await factory.currentFee();

      await expect(factory.connect(user1).deployToken(tokenConfig, { value: fee }))
        .to.emit(factory, "FeeCollected")
        .withArgs(user1.address, fee, feeRecipient.address);
    });

    it("Should deploy with zero fee if feeUsdWei is 0", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryWithZeroFeeFixture);

      const tokenConfig = {
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      await expect(factory.connect(user1).deployToken(tokenConfig, { value: 0 }))
        .to.emit(factory, "TokenCreated");
    });

    it("Should increment nonce after each deployment", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);

      expect(await factory.getNonce(user1.address)).to.equal(0);

      const tokenConfig = {
        name: "Test Token 1",
        symbol: "TEST1",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      const fee = await factory.currentFee();
      await factory.connect(user1).deployToken(tokenConfig, { value: fee });

      expect(await factory.getNonce(user1.address)).to.equal(1);

      const tokenConfig2 = {
        name: "Test Token 2",
        symbol: "TEST2",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      await factory.connect(user1).deployToken(tokenConfig2, { value: fee });

      expect(await factory.getNonce(user1.address)).to.equal(2);
    });

    it("Should deploy different tokens with same parameters from different users", async function () {
      const { factory, user1, user2 } = await loadFixture(deployTokenFactoryFixture);

      const tokenConfig = {
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: hre.ethers.ZeroAddress, // Will use msg.sender
      };

      const fee = await factory.currentFee();
      
      const tx1 = await factory.connect(user1).deployToken(tokenConfig, { value: fee });
      const receipt1 = await tx1.wait();
      const event1 = receipt1?.logs.find((log: any) => log.fragment?.name === "TokenCreated");
      const token1Address = (event1 as any).args[1];

      const tx2 = await factory.connect(user2).deployToken(tokenConfig, { value: fee });
      const receipt2 = await tx2.wait();
      const event2 = receipt2?.logs.find((log: any) => log.fragment?.name === "TokenCreated");
      const token2Address = (event2 as any).args[1];

      expect(token1Address).to.not.equal(token2Address);
    });
  });

  describe("Fee Calculation", function () {
    it("Should calculate fee correctly with valid price", async function () {
      const { factory } = await loadFixture(deployTokenFactoryFixture);
      const fee = await factory.currentFee();
      // With $2000/ETH price and $3 fee: 3 / 2000 = 0.0015 ETH
      expect(fee).to.equal(hre.ethers.parseUnits("0.0015", 18));
    });

    it("Should return 0 fee if feeUsdWei is 0", async function () {
      const { factory } = await loadFixture(deployTokenFactoryWithZeroFeeFixture);
      const fee = await factory.currentFee();
      expect(fee).to.equal(0);
    });

    it("Should revert if price is 0", async function () {
      const { factory, mockAggregator } = await loadFixture(deployTokenFactoryFixture);
      await mockAggregator.setPrice(0);
      await expect(factory.currentFee()).to.be.revertedWith("Invalid price");
    });

    it("Should revert if price is negative", async function () {
      const { factory, mockAggregator } = await loadFixture(deployTokenFactoryFixture);
      await mockAggregator.setPrice(-1);
      await expect(factory.currentFee()).to.be.revertedWith("Invalid price");
    });

    it("Should revert if price is too old", async function () {
      const { factory, mockAggregator } = await loadFixture(deployTokenFactoryFixture);
      
      await time.increase(3601); // More than 1 hour
      await mockAggregator.updateTimestamp();
      
      await expect(factory.currentFee()).to.be.revertedWith("Price too old");
    });

    it("Should revert if normalized price is too low", async function () {
      const { factory, mockAggregator } = await loadFixture(deployTokenFactoryFixture);
      // Set price below MIN_NORMALIZED_PRICE (1e16 = $0.01)
      await mockAggregator.setPrice(1); // Very low price
      await expect(factory.currentFee()).to.be.revertedWith("Price too low");
    });

    it("Should revert if normalized price is too high", async function () {
      const { factory, mockAggregator } = await loadFixture(deployTokenFactoryFixture);
      // Set price above MAX_NORMALIZED_PRICE (1e25 = $10,000,000)
      await mockAggregator.setPrice(hre.ethers.MaxUint256);
      await expect(factory.currentFee()).to.be.reverted;
    });
  });

  describe("Owner Functions", function () {
    it("Should allow owner to update fee recipient", async function () {
      const { factory, owner, user1 } = await loadFixture(deployTokenFactoryFixture);
      
      await expect(factory.connect(owner).setFeeRecipient(user1.address))
        .to.emit(factory, "FeeRecipientUpdated");
      
      expect(await factory.feeRecipient()).to.equal(user1.address);
    });

    it("Should revert if non-owner tries to update fee recipient", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);
      
      await expect(
        factory.connect(user1).setFeeRecipient(user1.address)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Should revert if new fee recipient is zero address", async function () {
      const { factory, owner } = await loadFixture(deployTokenFactoryFixture);
      
      await expect(
        factory.connect(owner).setFeeRecipient(hre.ethers.ZeroAddress)
      ).to.be.revertedWith("Recipient is zero");
    });

    it("Should allow owner to update fee amount", async function () {
      const { factory, owner } = await loadFixture(deployTokenFactoryFixture);
      const newFee = hre.ethers.parseUnits("5", 18);
      
      await expect(factory.connect(owner).setFeeUsdWei(newFee))
        .to.emit(factory, "FeeUsdWeiUpdated")
        .withArgs(FEE_USD_WEI, newFee);
      
      expect(await factory.feeUsdWei()).to.equal(newFee);
    });

    it("Should revert if non-owner tries to update fee amount", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);
      const newFee = hre.ethers.parseUnits("5", 18);
      
      await expect(
        factory.connect(user1).setFeeUsdWei(newFee)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to pause the factory", async function () {
      const { factory, owner } = await loadFixture(deployTokenFactoryFixture);
      
      await factory.connect(owner).pause();
      expect(await factory.paused()).to.be.true;
    });

    it("Should revert if non-owner tries to pause", async function () {
      const { factory, user1 } = await loadFixture(deployTokenFactoryFixture);
      
      await expect(
        factory.connect(user1).pause()
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to unpause the factory", async function () {
      const { factory, owner } = await loadFixture(deployTokenFactoryFixture);
      
      await factory.connect(owner).pause();
      await factory.connect(owner).unpause();
      expect(await factory.paused()).to.be.false;
    });

    it("Should revert if non-owner tries to unpause", async function () {
      const { factory, owner, user1 } = await loadFixture(deployTokenFactoryFixture);
      
      await factory.connect(owner).pause();
      
      await expect(
        factory.connect(user1).unpause()
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Should revert token deployment when paused", async function () {
      const { factory, owner, user1 } = await loadFixture(deployTokenFactoryFixture);
      
      await factory.connect(owner).pause();

      const tokenConfig = {
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        initialSupply: 1000,
        initialOwner: user1.address,
      };

      const fee = await factory.currentFee();
      
      await expect(
        factory.connect(user1).deployToken(tokenConfig, { value: fee })
      ).to.be.revertedWithCustomError(factory, "EnforcedPause");
    });
  });
});

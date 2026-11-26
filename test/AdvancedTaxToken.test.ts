import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { loadFixture } = networkHelpers;

const BPS = 10_000n;
const BUY = 200;
const SELL = 300;

function feeOn(value: bigint, bps: number | bigint): bigint {
  const rate = BigInt(bps);
  if (rate === 0n || value === 0n) return 0n;
  return (value / BPS) * rate + ((value % BPS) * rate) / BPS;
}

describe("AdvancedTaxToken", function () {
  async function deployToken(
    buy = BUY,
    sell = SELL,
    supply = ethers.parseEther("1000000"),
  ) {
    const [owner, factory, feeRecipient, alice, bob] = await ethers.getSigners();
    const token = await ethers.deployContract("AdvancedTaxToken", [
      "Tax Token",
      "TAX",
      18,
      supply,
      owner.address,
      factory.address,
      feeRecipient.address,
      buy,
      sell,
    ]);
    return { token, owner, factory, feeRecipient, alice, bob };
  }

  async function tokenFixture() {
    return deployToken();
  }

  async function deployMarketFixture() {
    const base = await deployToken();
    const { token, owner } = base;
    const quote = await ethers.deployContract("MockERC20");
    const uniFactory = await ethers.deployContract("MockUniswapV2Factory");
    const router = await ethers.deployContract("MockUniswapV2Router", [await uniFactory.getAddress()]);
    await uniFactory.createPair(await token.getAddress(), await quote.getAddress());
    const pair = await uniFactory.getPair(await token.getAddress(), await quote.getAddress());

    const tokenLiquidity = ethers.parseEther("100000");
    const quoteLiquidity = ethers.parseEther("1000");
    await quote.mint(owner.address, quoteLiquidity);
    await token.connect(owner).approve(await router.getAddress(), ethers.MaxUint256);
    await quote.connect(owner).approve(await router.getAddress(), ethers.MaxUint256);
    await token.connect(owner).setPool(pair, true);
    await router.connect(owner).addLiquidity(
      await token.getAddress(),
      await quote.getAddress(),
      tokenLiquidity,
      quoteLiquidity,
      owner.address,
    );

    return { ...base, quote, uniFactory, router, pair, tokenLiquidity, quoteLiquidity };
  }

  describe("Deployment", function () {
    it("mints the raw supply to the owner and stores fees", async function () {
      const supply = ethers.parseEther("1000000");
      const { token, owner, factory, feeRecipient } = await deployToken();
      expect(await token.name()).to.equal("Tax Token");
      expect(await token.symbol()).to.equal("TAX");
      expect(await token.decimals()).to.equal(18);
      expect(await token.totalSupply()).to.equal(supply);
      expect(await token.balanceOf(owner.address)).to.equal(supply);
      expect(await token.factory()).to.equal(factory.address);
      expect(await token.feeRecipient()).to.equal(feeRecipient.address);
      expect(await token.buyFeeBps()).to.equal(BUY);
      expect(await token.sellFeeBps()).to.equal(SELL);
      expect(await token.MAX_TOTAL_FEE_BPS()).to.equal(1000);
      expect(await token.isExcluded(owner.address)).to.equal(true);
      expect(await token.isExcluded(factory.address)).to.equal(true);
      expect(await token.isExcluded(feeRecipient.address)).to.equal(false);
    });

    it("allows a zero initial supply and a zero starting fee", async function () {
      const { token, owner } = await deployToken(0, 0, 0);
      expect(await token.totalSupply()).to.equal(0n);
      expect(await token.balanceOf(owner.address)).to.equal(0n);
    });

    it("accepts buy + sell equal to the ceiling", async function () {
      const { token } = await deployToken(400, 600, 0);
      expect(await token.buyFeeBps()).to.equal(400);
      expect(await token.sellFeeBps()).to.equal(600);
    });

    it("reverts when buy + sell is above 10%", async function () {
      const [owner, factory, feeRecipient] = await ethers.getSigners();
      await expect(
        ethers.deployContract("AdvancedTaxToken", [
          "Tax",
          "TAX",
          18,
          0,
          owner.address,
          factory.address,
          feeRecipient.address,
          501,
          500,
        ]),
      ).to.be.revertedWithCustomError(
        await ethers.getContractFactory("AdvancedTaxToken"),
        "FeeTooHigh",
      );
    });

    it("reverts on a zero factory or a bad fee recipient", async function () {
      const [owner, , feeRecipient] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("AdvancedTaxToken");
      const args = ["Tax", "TAX", 18, 0, owner.address] as const;
      await expect(
        ethers.deployContract("AdvancedTaxToken", [...args, ethers.ZeroAddress, feeRecipient.address, 0, 0]),
      ).to.be.revertedWithCustomError(factory, "ZeroAddress");
      await expect(
        ethers.deployContract("AdvancedTaxToken", [...args, owner.address, ethers.ZeroAddress, 0, 0]),
      ).to.be.revertedWithCustomError(factory, "InvalidFeeRecipient");
    });
  });

  describe("Owner controls", function () {
    it("lowers fees and rejects an increase or a sum above the ceiling", async function () {
      const { token, owner, alice } = await loadFixture(tokenFixture);
      await expect(token.connect(owner).setFees(100, 300))
        .to.emit(token, "FeesUpdated")
        .withArgs(100, 300);
      expect(await token.buyFeeBps()).to.equal(100);
      await expect(token.connect(owner).setFees(100, 300)).to.emit(token, "FeesUpdated");
      await expect(token.connect(owner).setFees(101, 300)).to.be.revertedWithCustomError(
        token,
        "FeeIncreaseForbidden",
      );
      await expect(token.connect(owner).setFees(100, 301)).to.be.revertedWithCustomError(
        token,
        "FeeIncreaseForbidden",
      );
      await expect(token.connect(owner).setFees(0, 0)).to.emit(token, "FeesUpdated").withArgs(0, 0);

      const high = await deployToken(600, 400, 0);
      await expect(high.token.connect(high.owner).setFees(500, 501)).to.be.revertedWithCustomError(
        high.token,
        "FeeTooHigh",
      );
      await expect(token.connect(alice).setFees(0, 0)).to.be.revertedWithCustomError(
        token,
        "OwnableUnauthorizedAccount",
      );
    });

    it("marks and unmarks a pool", async function () {
      const { token, owner, alice } = await loadFixture(tokenFixture);
      await expect(token.connect(owner).setPool(alice.address, true))
        .to.emit(token, "PoolUpdated")
        .withArgs(alice.address, true);
      expect(await token.isPool(alice.address)).to.equal(true);
      await token.connect(owner).setPool(alice.address, false);
      expect(await token.isPool(alice.address)).to.equal(false);
      await expect(token.connect(owner).setPool(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(
        token,
        "ZeroAddress",
      );
      await expect(token.connect(alice).setPool(owner.address, true)).to.be.revertedWithCustomError(
        token,
        "OwnableUnauthorizedAccount",
      );
    });

    it("manages the extra exclusion list without dropping owner or factory", async function () {
      const { token, owner, factory, alice } = await loadFixture(tokenFixture);
      await expect(token.connect(owner).setExcluded(alice.address, true))
        .to.emit(token, "ExclusionUpdated")
        .withArgs(alice.address, true);
      expect(await token.isExcluded(alice.address)).to.equal(true);
      await token.connect(owner).setExcluded(owner.address, false);
      await token.connect(owner).setExcluded(factory.address, false);
      expect(await token.isExcluded(owner.address)).to.equal(true);
      expect(await token.isExcluded(factory.address)).to.equal(true);
      await expect(token.connect(owner).setExcluded(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(
        token,
        "ZeroAddress",
      );
      await expect(token.connect(alice).setExcluded(alice.address, false)).to.be.revertedWithCustomError(
        token,
        "OwnableUnauthorizedAccount",
      );
    });

    it("rotates the fee recipient and rejects the token itself", async function () {
      const { token, owner, feeRecipient, alice } = await loadFixture(tokenFixture);
      await expect(token.connect(owner).setFeeRecipient(alice.address))
        .to.emit(token, "FeeRecipientUpdated")
        .withArgs(feeRecipient.address, alice.address);
      expect(await token.feeRecipient()).to.equal(alice.address);
      await expect(token.connect(owner).setFeeRecipient(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        token,
        "InvalidFeeRecipient",
      );
      await expect(token.connect(owner).setFeeRecipient(await token.getAddress())).to.be.revertedWithCustomError(
        token,
        "InvalidFeeRecipient",
      );
      await expect(token.connect(alice).setFeeRecipient(owner.address)).to.be.revertedWithCustomError(
        token,
        "OwnableUnauthorizedAccount",
      );
    });

    it("excludes the new owner after Ownable2Step acceptance", async function () {
      const { token, owner, alice } = await loadFixture(tokenFixture);
      expect(await token.isExcluded(alice.address)).to.equal(false);
      await token.connect(owner).transferOwnership(alice.address);
      await token.connect(alice).acceptOwnership();
      expect(await token.owner()).to.equal(alice.address);
      expect(await token.isExcluded(alice.address)).to.equal(true);
      expect(await token.isExcluded(owner.address)).to.equal(false);
    });
  });

  describe("Uniswap V2 market", function () {
    it("lets the owner add liquidity without a tax", async function () {
      const { token, pair, tokenLiquidity, quote, quoteLiquidity } = await loadFixture(deployMarketFixture);
      expect(await token.balanceOf(pair)).to.equal(tokenLiquidity);
      expect(await quote.balanceOf(pair)).to.equal(quoteLiquidity);
    });

    it("taxes a buy through the pair and not a later wallet transfer", async function () {
      const { token, quote, router, pair, feeRecipient, alice, bob } = await loadFixture(deployMarketFixture);
      const spent = ethers.parseEther("10");
      await quote.mint(alice.address, spent);
      await quote.connect(alice).approve(await router.getAddress(), spent);

      const pairBefore = await token.balanceOf(pair);
      const recipientBefore = await token.balanceOf(feeRecipient.address);
      await router.connect(alice).swapExactTokensForTokens(spent, [await quote.getAddress(), await token.getAddress()], alice.address);
      const grossOut = pairBefore - (await token.balanceOf(pair));
      const tax = feeOn(grossOut, BUY);
      expect(tax).to.be.greaterThan(0n);
      expect(await token.balanceOf(alice.address)).to.equal(grossOut - tax);
      expect(await token.balanceOf(feeRecipient.address)).to.equal(recipientBefore + tax);

      const gift = (await token.balanceOf(alice.address)) / 2n;
      const recipientMid = await token.balanceOf(feeRecipient.address);
      await token.connect(alice).transfer(bob.address, gift);
      expect(await token.balanceOf(bob.address)).to.equal(gift);
      expect(await token.balanceOf(alice.address)).to.equal(grossOut - tax - gift);
      expect(await token.balanceOf(feeRecipient.address)).to.equal(recipientMid);
    });

    it("taxes a sell through the pair and still pays the seller", async function () {
      const { token, quote, router, pair, owner, feeRecipient, alice } = await loadFixture(deployMarketFixture);
      const sold = ethers.parseEther("100");
      await token.connect(owner).transfer(alice.address, sold);
      await token.connect(alice).approve(await router.getAddress(), sold);

      const pairBefore = await token.balanceOf(pair);
      const recipientBefore = await token.balanceOf(feeRecipient.address);
      const quoteBefore = await quote.balanceOf(alice.address);
      await router.connect(alice).swapExactTokensForTokens(sold, [await token.getAddress(), await quote.getAddress()], alice.address);

      const tax = feeOn(sold, SELL);
      expect(await token.balanceOf(alice.address)).to.equal(0n);
      expect(await token.balanceOf(pair)).to.equal(pairBefore + sold - tax);
      expect(await token.balanceOf(feeRecipient.address)).to.equal(recipientBefore + tax);
      expect(await quote.balanceOf(alice.address)).to.be.greaterThan(quoteBefore);
    });

    it("does not tax an excluded buyer or seller", async function () {
      const { token, quote, router, pair, owner, feeRecipient, alice } = await loadFixture(deployMarketFixture);
      await token.connect(owner).setExcluded(alice.address, true);

      const spent = ethers.parseEther("5");
      await quote.mint(alice.address, spent);
      await quote.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);
      const pairBefore = await token.balanceOf(pair);
      const recipientBefore = await token.balanceOf(feeRecipient.address);
      await router.connect(alice).swapExactTokensForTokens(spent, [await quote.getAddress(), await token.getAddress()], alice.address);
      const grossOut = pairBefore - (await token.balanceOf(pair));
      expect(await token.balanceOf(alice.address)).to.equal(grossOut);
      expect(await token.balanceOf(feeRecipient.address)).to.equal(recipientBefore);

      const sold = grossOut / 2n;
      await token.connect(alice).approve(await router.getAddress(), sold);
      const pairSellBefore = await token.balanceOf(pair);
      await router.connect(alice).swapExactTokensForTokens(sold, [await token.getAddress(), await quote.getAddress()], alice.address);
      expect(await token.balanceOf(pair)).to.equal(pairSellBefore + sold);
      expect(await token.balanceOf(feeRecipient.address)).to.equal(recipientBefore);
    });

    it("does not tax the factory when it sends tokens into the pair", async function () {
      const { token, pair, owner, factory, feeRecipient } = await loadFixture(deployMarketFixture);
      const amount = ethers.parseEther("25");
      await token.connect(owner).transfer(factory.address, amount);
      const pairBefore = await token.balanceOf(pair);
      const recipientBefore = await token.balanceOf(feeRecipient.address);
      await token.connect(factory).transfer(pair, amount);
      expect(await token.balanceOf(pair)).to.equal(pairBefore + amount);
      expect(await token.balanceOf(feeRecipient.address)).to.equal(recipientBefore);
    });

    it("stops taxing after the pair is unmarked", async function () {
      const { token, quote, router, pair, owner, feeRecipient, alice } = await loadFixture(deployMarketFixture);
      await token.connect(owner).setPool(pair, false);
      const sold = ethers.parseEther("20");
      await token.connect(owner).transfer(alice.address, sold);
      await token.connect(alice).approve(await router.getAddress(), sold);
      const recipientBefore = await token.balanceOf(feeRecipient.address);
      const pairBefore = await token.balanceOf(pair);
      await router.connect(alice).swapExactTokensForTokens(sold, [await token.getAddress(), await quote.getAddress()], alice.address);
      expect(await token.balanceOf(pair)).to.equal(pairBefore + sold);
      expect(await token.balanceOf(feeRecipient.address)).to.equal(recipientBefore);
    });

    it("sells the full balance at the 10% ceiling", async function () {
      const [owner, factorySigner, feeRecipient, trader] = await ethers.getSigners();
      const token = await ethers.deployContract("AdvancedTaxToken", [
        "Max Tax",
        "MAX",
        18,
        ethers.parseEther("1000000"),
        owner.address,
        factorySigner.address,
        feeRecipient.address,
        0,
        1000,
      ]);
      const quote = await ethers.deployContract("MockERC20");
      const uniFactory = await ethers.deployContract("MockUniswapV2Factory");
      const router = await ethers.deployContract("MockUniswapV2Router", [await uniFactory.getAddress()]);
      await uniFactory.createPair(await token.getAddress(), await quote.getAddress());
      const pair = await uniFactory.getPair(await token.getAddress(), await quote.getAddress());
      await token.connect(owner).setPool(pair, true);
      const tokenLiquidity = ethers.parseEther("100000");
      const quoteLiquidity = ethers.parseEther("5000");
      await quote.mint(owner.address, quoteLiquidity);
      await token.connect(owner).approve(await router.getAddress(), ethers.MaxUint256);
      await quote.connect(owner).approve(await router.getAddress(), ethers.MaxUint256);
      await router.connect(owner).addLiquidity(
        await token.getAddress(),
        await quote.getAddress(),
        tokenLiquidity,
        quoteLiquidity,
        owner.address,
      );
      expect(await token.balanceOf(pair)).to.equal(tokenLiquidity);

      const spent = ethers.parseEther("20");
      await quote.mint(trader.address, spent);
      await quote.connect(trader).approve(await router.getAddress(), ethers.MaxUint256);
      await router.connect(trader).swapExactTokensForTokens(
        spent,
        [await quote.getAddress(), await token.getAddress()],
        trader.address,
      );
      const bought = await token.balanceOf(trader.address);
      expect(bought).to.be.greaterThan(0n);
      await token.connect(trader).approve(await router.getAddress(), bought);
      const quoteBefore = await quote.balanceOf(trader.address);
      await router.connect(trader).swapExactTokensForTokens(
        bought,
        [await token.getAddress(), await quote.getAddress()],
        trader.address,
      );
      expect(await token.balanceOf(trader.address)).to.equal(0n);
      expect(await quote.balanceOf(trader.address)).to.be.greaterThan(quoteBefore);
      expect(await token.balanceOf(pair)).to.equal(tokenLiquidity - bought + bought - feeOn(bought, 1000));
    });

    it("charges only the sell fee when one marked pool sends to another", async function () {
      const { token, pair, owner, feeRecipient, uniFactory } = await loadFixture(deployMarketFixture);
      const quote2 = await ethers.deployContract("MockERC20");
      await uniFactory.createPair(await token.getAddress(), await quote2.getAddress());
      const pair2 = await uniFactory.getPair(await token.getAddress(), await quote2.getAddress());
      await token.connect(owner).setPool(pair2, true);

      await networkHelpers.setBalance(pair, ethers.parseEther("1"));
      const pairSigner = await ethers.getImpersonatedSigner(pair);
      const amount = ethers.parseEther("10");
      const pairBefore = await token.balanceOf(pair);
      const recipientBefore = await token.balanceOf(feeRecipient.address);
      await token.connect(pairSigner).transfer(pair2, amount);
      const tax = feeOn(amount, SELL);
      expect(tax).to.be.greaterThan(0n);
      expect(await token.balanceOf(pair)).to.equal(pairBefore - amount);
      expect(await token.balanceOf(pair2)).to.equal(amount - tax);
      expect(await token.balanceOf(feeRecipient.address)).to.equal(recipientBefore + tax);
    });

    it("rounds a tiny taxed transfer down to zero fee", async function () {
      const { token, owner, alice, bob } = await loadFixture(tokenFixture);
      await token.connect(owner).setPool(alice.address, true);
      await token.connect(owner).transfer(bob.address, 100n);
      await token.connect(bob).transfer(alice.address, 5n);
      expect(await token.balanceOf(alice.address)).to.equal(5n);
      expect(await token.balanceOf(bob.address)).to.equal(95n);
    });
  });
});

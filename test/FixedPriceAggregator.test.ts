import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("FixedPriceAggregator", function () {
  it("keeps an 8-decimal price fresh at the current block", async function () {
    const price = 7_689_800n;
    const feed = await ethers.deployContract("FixedPriceAggregator", ["POL / USD", price]);
    await feed.waitForDeployment();

    expect(await feed.decimals()).to.equal(8);
    expect(await feed.description()).to.equal("POL / USD");
    expect(await feed.version()).to.equal(1n);

    const round = await feed.latestRoundData();
    const block = await ethers.provider.getBlock("latest");
    expect(round.answer).to.equal(price);
    expect(round.roundId).to.equal(1n);
    expect(round.answeredInRound).to.equal(round.roundId);
    expect(round.updatedAt).to.equal(block!.timestamp);

    await ethers.provider.send("evm_mine", []);
    const later = await feed.latestRoundData();
    const laterBlock = await ethers.provider.getBlock("latest");
    expect(later.answer).to.equal(price);
    expect(later.updatedAt).to.equal(laterBlock!.timestamp);
    expect(later.updatedAt).to.not.equal(round.updatedAt);
  });

  it("rejects a non-positive price", async function () {
    await expect(ethers.deployContract("FixedPriceAggregator", ["POL / USD", 0])).to.be.revertedWithCustomError(
      await ethers.getContractFactory("FixedPriceAggregator"),
      "NonPositivePrice",
    );
  });
});

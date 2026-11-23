import hre from "hardhat";

export async function loadFixture<T>(fixture: () => Promise<T>): Promise<T> {
  return fixture();
}

export async function time() {
  return {
    async increase(seconds: number) {
      await hre.ethers.provider.send("evm_increaseTime", [seconds]);
      await hre.ethers.provider.send("evm_mine", []);
    },
    async latest() {
      const block = await hre.ethers.provider.getBlock("latest");
      return block!.timestamp;
    },
  };
}

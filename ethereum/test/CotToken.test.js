const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseEther } = require("ethers");

describe("CotToken", function () {
  let CotToken;
  let cotToken;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    CotToken = await ethers.getContractFactory("CotToken");
    [owner, addr1, addr2, _] = await ethers.getSigners();

    cotToken = await CotToken.deploy(owner.address);
    await cotToken.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await cotToken.owner()).to.equal(owner.address);
    });

    it("Should have correct name and symbol", async function () {
      expect(await cotToken.name()).to.equal("Certified Cotton Token");
      expect(await cotToken.symbol()).to.equal("COT");
    });

    it("Should have zero initial supply", async function () {
      expect(await cotToken.totalSupply()).to.equal(0);
    });
  });

  describe("Transactions", function () {
    const testFabricId = "TEST-FABRIC-001";
    const metadata = JSON.stringify({
      origin: "Test Farm",
      certifications: ["Organic"],
    });

    it("Should allow owner to register certified cotton", async function () {
      const amount = parseEther("1");

      await expect(
        cotToken.mintBatch(testFabricId, amount, "WH-001", owner.address)
      )
        .to.emit(cotToken, "BatchTokensMinted")
        .withArgs(testFabricId, amount, "WH-001");

      expect(await cotToken.balanceOf(owner.address)).to.equal(amount);
      expect(await cotToken.fabricIdToBatchId(testFabricId)).to.equal(testFabricId);
    });

    it("Should not allow non-owners to register cotton", async function () {
      const amount = parseEther("1");

      await expect(
        cotToken.connect(addr1).mintBatch(testFabricId, amount, "WH-001", addr1.address)
      ).to.be.revertedWith("CotToken: must have minter role to mint");
    });

    it("Should not allow registering the same fabric ID twice", async function () {
      const amount = parseEther("1");

      await cotToken.mintBatch(testFabricId, amount, "WH-001", owner.address);

      await expect(
        cotToken.mintBatch(testFabricId, amount, "WH-001", owner.address)
      ).to.be.revertedWith("CotToken: batch ID already used");
    });

    it("Should allow token holders to redeem cotton", async function () {
      const amount = 1000000000000000000n;
      const redeemAmount = 1000000000000000000n;

      await cotToken.mintBatch(testFabricId, amount, "WH-001", owner.address);
      await cotToken.transfer(addr1.address, redeemAmount);

      await expect(
        cotToken.connect(addr1).burn(redeemAmount)
      )
        .to.emit(cotToken, "Transfer")
        .withArgs(addr1.address, ethers.ZeroAddress, redeemAmount);

      expect(await cotToken.balanceOf(addr1.address)).to.equal(0);
      expect(await cotToken.totalSupply()).to.equal(amount - redeemAmount);
    });

    it("Should not allow redeeming more tokens than owned", async function () {
      const amount = parseEther("1");
      const transferAmount = parseEther("1");
      const redeemAmount = 2000000000000000000n;

      await cotToken.mintBatch(testFabricId, amount, "WH-001", owner.address);
      await cotToken.transfer(addr1.address, transferAmount);

      await expect(
        cotToken.connect(addr1).burn(redeemAmount)
      ).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });
  });
});
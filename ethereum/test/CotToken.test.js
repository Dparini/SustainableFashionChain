const { expect } = require("chai");
const { ethers } = require("hardhat");

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
      const amount = ethers.utils.parseEther("1");

      await expect(
        cotToken.registerCertifiedCotton(testFabricId, amount, metadata)
      )
        .to.emit(cotToken, "CertifiedCottonRegistered")
        .withArgs(1, testFabricId, amount, metadata);

      expect(await cotToken.balanceOf(owner.address)).to.equal(amount);
      expect(await cotToken.fabricIdToBatchId(testFabricId)).to.equal(1);
      expect(await cotToken.getBatchMetadata(1)).to.equal(metadata);
    });

    it("Should not allow non-owners to register cotton", async function () {
      const amount = ethers.utils.parseEther("1");

      await expect(
        cotToken.connect(addr1).registerCertifiedCotton(testFabricId, amount, metadata)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should not allow registering the same fabric ID twice", async function () {
      const amount = ethers.utils.parseEther("1");

      await cotToken.registerCertifiedCotton(testFabricId, amount, metadata);

      await expect(
        cotToken.registerCertifiedCotton(testFabricId, amount, metadata)
      ).to.be.revertedWith("Cotton batch already registered");
    });

    it("Should allow token holders to redeem cotton", async function () {
      const amount = ethers.utils.parseEther("1");
      const redeemAmount = ethers.utils.parseEther("1");

      await cotToken.registerCertifiedCotton(testFabricId, amount, metadata);
      await cotToken.transfer(addr1.address, redeemAmount);

      await expect(
        cotToken.connect(addr1).redeemCotton(1, redeemAmount)
      )
        .to.emit(cotToken, "CottonRedeemed")
        .withArgs(1, redeemAmount, addr1.address);

      expect(await cotToken.balanceOf(addr1.address)).to.equal(0);
      expect(await cotToken.totalSupply()).to.equal(amount.sub(redeemAmount));
    });

    it("Should not allow redeeming more tokens than owned", async function () {
      const amount = ethers.utils.parseEther("1");
      const transferAmount = ethers.utils.parseEther("1");
      const redeemAmount = ethers.utils.parseEther("1");

      await cotToken.registerCertifiedCotton(testFabricId, amount, metadata);
      await cotToken.transfer(addr1.address, transferAmount);

      await expect(
        cotToken.connect(addr1).redeemCotton(1, redeemAmount)
      ).to.be.revertedWith("Insufficient balance");
    });
  });
});
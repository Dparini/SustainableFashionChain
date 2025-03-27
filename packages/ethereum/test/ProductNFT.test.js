const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProductNFT", function () {
  let ProductNFT;
  let productNFT;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    ProductNFT = await ethers.getContractFactory("ProductNFT");
    [owner, addr1, addr2, _] = await ethers.getSigners();

    productNFT = await ProductNFT.deploy();
    await productNFT.deployed();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await productNFT.owner()).to.equal(owner.address);
    });

    it("Should have correct name and symbol", async function () {
      expect(await productNFT.name()).to.equal("Sustainable Fashion Product");
      expect(await productNFT.symbol()).to.equal("SFP");
    });
  });

  describe("Minting", function () {
    const testFabricId = "TEST-FABRIC-001";
    const testTokenURI = "ipfs://QmTest";

    it("Should allow owner to mint a product NFT", async function () {
      await expect(
        productNFT.mintProduct(addr1.address, testFabricId, testTokenURI)
      )
        .to.emit(productNFT, "ProductMinted")
        .withArgs(1, testFabricId, addr1.address, testTokenURI);

      expect(await productNFT.ownerOf(1)).to.equal(addr1.address);
      expect(await productNFT.tokenURI(1)).to.equal(testTokenURI);
      expect(await productNFT.getFabricId(1)).to.equal(testFabricId);
    });

    it("Should not allow non-owners to mint NFTs", async function () {
      await expect(
        productNFT.connect(addr1).mintProduct(addr2.address, testFabricId, testTokenURI)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should require non-empty fabric ID", async function () {
      await expect(
        productNFT.mintProduct(addr1.address, "", testTokenURI)
      ).to.be.revertedWith("Fabric ID cannot be empty");
    });

    it("Should require non-empty token URI", async function () {
      await expect(
        productNFT.mintProduct(addr1.address, testFabricId, "")
      ).to.be.revertedWith("Token URI cannot be empty");
    });
  });

  describe("Recycling", function () {
    const testFabricId = "TEST-FABRIC-001";
    const testTokenURI = "ipfs://QmTest";

    beforeEach(async function () {
      await productNFT.mintProduct(addr1.address, testFabricId, testTokenURI);
    });

    it("Should allow token owner to initiate recycling", async function () {
      await expect(
        productNFT.connect(addr1).recycleProduct(1)
      )
        .to.emit(productNFT, "RecycleInitiated")
        .withArgs(1, addr1.address, await ethers.provider.getBlock('latest').then(b => b.timestamp + 1));

      const recyclingInfo = await productNFT.getRecyclingInfo(1);
      expect(recyclingInfo.recycled).to.be.true;
      expect(recyclingInfo.recycler).to.equal(addr1.address);
    });

    it("Should not allow non-token-owners to initiate recycling", async function () {
      await expect(
        productNFT.connect(addr2).recycleProduct(1)
      ).to.be.revertedWith("Not the token owner");
    });

    it("Should not allow recycling a product twice", async function () {
      await productNFT.connect(addr1).recycleProduct(1);

      await expect(
        productNFT.connect(addr1).recycleProduct(1)
      ).to.be.revertedWith("Product already recycled");
    });
  });
});
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CircularRewards", function () {
  let CotToken;
  let ProductNFT;
  let CircularRewards;
  let cotToken;
  let productNFT;
  let circularRewards;
  let owner;
  let minter;
  let verifier;
  let consumer;
  let addr1;

  // Constants for testing
  const fabricProductId = "product_12345";
  const productType = "T-shirt";
  const manufacturer = "sustainable_brand";
  const cottonBatchIds = ["batch_123", "batch_456"];

  beforeEach(async function () {
    // Get contract factories and signers
    [owner, minter, verifier, consumer, addr1] = await ethers.getSigners();

    // Deploy CotToken
    CotToken = await ethers.getContractFactory("CotToken");
    cotToken = await CotToken.deploy(owner.address);
    await cotToken.waitForDeployment();

    // Add minter role to the minter account
    await cotToken.grantRole(await cotToken.MINTER_ROLE(), minter.address);

    // Deploy ProductNFT
    ProductNFT = await ethers.getContractFactory("ProductNFT");
    productNFT = await ProductNFT.deploy(owner.address);
    await productNFT.waitForDeployment();

    // Add minter and bridge roles
    await productNFT.addMinter(minter.address);

    // Deploy CircularRewards
    CircularRewards = await ethers.getContractFactory("CircularRewards");
    circularRewards = await CircularRewards.deploy(
      owner.address,
      await productNFT.getAddress(),
      await cotToken.getAddress()
    );
    await circularRewards.waitForDeployment();

    // Add roles for rewards system
    await circularRewards.addVerifier(verifier.address);
    await cotToken.grantRole(await cotToken.MINTER_ROLE(), await circularRewards.getAddress());
    await productNFT.addBridge(await circularRewards.getAddress());

    // Mint a product NFT for testing
    await productNFT.connect(minter).mintProduct(
      consumer.address,
      "TEST-FABRIC-001",
      "T-Shirt",
      "Sustainable Manufacturer Ltd.",
      "ipfs://metadataURI-example",
      "ipfs://tokenURI-example",
      ["batch001", "batch002"]
    );

    // Log contract addresses for debugging
    console.log("Contract Addresses:");
    console.log("CotToken:", await cotToken.getAddress());
    console.log("ProductNFT:", await productNFT.getAddress());
    console.log("CircularRewards:", await circularRewards.getAddress());

    // Check token ownership for debugging
    console.log("Token 1 Owner:", await productNFT.ownerOf(1n));
    console.log("Is consumer the owner?", (await productNFT.ownerOf(1n)) === consumer.address);
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await circularRewards.hasRole(await circularRewards.DEFAULT_ADMIN_ROLE(), owner.address)).to.equal(true);
    });

    it("Should reference the right token contracts", async function () {
      expect(await circularRewards.productNFT()).to.equal(await productNFT.getAddress());
      expect(await circularRewards.cotToken()).to.equal(await cotToken.getAddress());
    });

    it("Should set up default reward configurations", async function () {
      // Check the "Recycle" action config (exists by default)
      const recycleConfig = await circularRewards.rewardConfigs("Recycle");
      console.log("Recycle config:", {
        actionType: recycleConfig.actionType,
        baseReward: recycleConfig.baseReward.toString(),
        active: recycleConfig.active
      });

      expect(recycleConfig.actionType).to.equal("Recycle");
      expect(recycleConfig.baseReward).to.equal(ethers.parseEther("50"));
      expect(recycleConfig.active).to.equal(true);

      // Check the number of action types
      expect(await circularRewards.getActionTypeCount()).to.equal(4n); // Default 4 actions in constructor
    });
  });

  describe("Reward Configuration", function () {
    it("Should allow admin to add a new reward config", async function () {
      // Add a new reward type
      await circularRewards.connect(owner).addRewardConfig("Donate", ethers.parseEther("10"));

      // Check that it was added correctly
      const donateConfig = await circularRewards.rewardConfigs("Donate");
      expect(donateConfig.actionType).to.equal("Donate");
      expect(donateConfig.baseReward).to.equal(ethers.parseEther("10"));
      expect(donateConfig.active).to.equal(true);

      // Check that the action type count increased
      expect(await circularRewards.getActionTypeCount()).to.equal(5n);
    });

    it("Should fail if non-admin tries to add a reward config", async function () {
      await expect(
        circularRewards.connect(addr1).addRewardConfig("Donate", ethers.parseEther("10"))
      ).to.be.reverted;
    });

    it("Should allow admin to update an existing reward config", async function () {
      // Update the Recycle reward
      await circularRewards.connect(owner).updateRewardConfig(
        "Recycle",
        ethers.parseEther("75"),
        true
      );

      // Check that it was updated correctly
      const recycleConfig = await circularRewards.rewardConfigs("Recycle");
      expect(recycleConfig.baseReward).to.equal(ethers.parseEther("75"));
    });

    it("Should allow admin to deactivate a reward config", async function () {
      // Deactivate the Repair reward
      await circularRewards.connect(owner).updateRewardConfig(
        "Repair",
        ethers.parseEther("20"),
        false
      );

      // Check that it was deactivated
      const repairConfig = await circularRewards.rewardConfigs("Repair");
      expect(repairConfig.active).to.equal(false);
    });
  });

  describe("Reward Issuance", function () {
    it("Should allow verifier to issue rewards for recycling", async function () {
      console.log("Testing recycling rewards...");
      console.log("Verifier address:", verifier.address);
      console.log("Consumer address:", consumer.address);
      console.log("Is verifier role assigned:", await circularRewards.hasRole(await circularRewards.VERIFIER_ROLE(), verifier.address));

      // Check product state before recycling
      const productDataBefore = await productNFT.productData(1n);
      console.log("Product recycled before:", productDataBefore.recycled);

      // Issue a reward for recycling
      const tx = await circularRewards.connect(verifier).issueReward(
        consumer.address,
        1n, // token ID
        "Recycle",
        "Recycled at certified facility"
      );

      // Wait for transaction receipt to debug
      const receipt = await tx.wait();
      console.log("Transaction succeeded with status:", receipt.status);

      // Check that tokens were minted to the consumer
      const rewardAmount = ethers.parseEther("50"); // Default reward for recycling
      expect(await cotToken.balanceOf(consumer.address)).to.equal(rewardAmount);

      // Check that the product was marked as recycled
      const productData = await productNFT.productData(1n);
      expect(productData.recycled).to.equal(true);

      // Check that the reward event was recorded
      expect(await circularRewards.getRewardHistoryCount()).to.equal(1n);
    });

    it("Should allow verifier to issue rewards for repair", async function () {
      // Issue a reward for repair
      await circularRewards.connect(verifier).issueReward(
        consumer.address,
        1n, // token ID
        "Repair",
        "Repaired torn seam"
      );

      // Check that tokens were minted to the consumer
      const rewardAmount = ethers.parseEther("20"); // Default reward for repair
      expect(await cotToken.balanceOf(consumer.address)).to.equal(rewardAmount);

      // Check that the product was NOT marked as recycled (repair doesn't recycle)
      const productData = await productNFT.productData(1n);
      expect(productData.recycled).to.equal(false);
    });

    it("Should fail if non-verifier tries to issue rewards", async function () {
      await expect(
        circularRewards.connect(addr1).issueReward(
          consumer.address,
          1n,
          "Recycle",
          "Recycled at certified facility"
        )
      ).to.be.reverted;
    });

    it("Should fail if action type is inactive", async function () {
      // Deactivate the Repair reward
      await circularRewards.connect(owner).updateRewardConfig(
        "Repair",
        ethers.parseEther("20"),
        false
      );

      // Try to issue a reward for the deactivated action
      await expect(
        circularRewards.connect(verifier).issueReward(
          consumer.address,
          1n,
          "Repair",
          "Repaired torn seam"
        )
      ).to.be.reverted;
    });

    it("Should fail if user doesn't own the token", async function () {
      // Transfer the token to another user
      await productNFT.connect(consumer).transferFrom(consumer.address, addr1.address, 1n);

      // Try to issue a reward to the original owner who no longer owns the token
      await expect(
        circularRewards.connect(verifier).issueReward(
          consumer.address,
          1n,
          "Recycle",
          "Recycled at certified facility"
        )
      ).to.be.reverted;
    });
  });

  describe("Role Management", function () {
    it("Should allow admin to add a verifier", async function () {
      await circularRewards.connect(owner).addVerifier(addr1.address);
      expect(await circularRewards.hasRole(await circularRewards.VERIFIER_ROLE(), addr1.address)).to.equal(true);
    });

    it("Should not allow non-admin to add a verifier", async function () {
      await expect(
        circularRewards.connect(addr1).addVerifier(addr1.address)
      ).to.be.reverted;
    });
  });
});
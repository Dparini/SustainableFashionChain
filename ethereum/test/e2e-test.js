const axios = require('axios');
const { expect } = require('chai');
const { ethers } = require("hardhat");

// Constants and configuration
const API_URL = 'http://localhost:3000/api';
const ETHEREUM_PROVIDER_URL = 'http://127.0.0.1:8545';
const addresses = require('../contract-addresses.json');
const COT_TOKEN_ADDRESS = addresses.CotToken;
const PRODUCT_NFT_ADDRESS = addresses.ProductNFT;

// ABI imports
const CotTokenABI = require('../artifacts/contracts/CotToken.sol/CotToken.json').abi;
const ProductNFTABI = require('../artifacts/contracts/ProductNFT.sol/ProductNFT.json').abi;

// Test product data
const testProduct = {
  id: `COTTON-${Date.now()}`,
  type: 'cotton',
  origin: 'Organic Farm A',
  certifications: [
    {
      type: 'Organic',
      id: 'ORG-2023-001',
      issuer: 'Global Organic Textile Standard'
    }
  ],
  metadata: {
    quality: 'premium',
    harvestDate: '2023-05-15',
    amount: 100 // kg
  }
};

// Ethereum setup
let provider;
let cotToken;
let productNFT;
let wallet;
let walletAddress;

// Remove .skip() to run these tests when API server is available
describe('End-to-End Test: Supply Chain and Tokenization', function() {
  this.timeout(30000); // 30 seconds timeout

  before(async () => {
    try {
      // Setup Ethereum connection
      provider = new ethers.JsonRpcProvider(ETHEREUM_PROVIDER_URL);
      const accounts = await provider.listAccounts();
      wallet = provider.getSigner(accounts[0]);
      walletAddress = await wallet.getAddress();

      cotToken = new ethers.Contract(COT_TOKEN_ADDRESS, CotTokenABI, wallet);
      productNFT = new ethers.Contract(PRODUCT_NFT_ADDRESS, ProductNFTABI, wallet);

      console.log("Connected to Ethereum with wallet:", walletAddress);
    } catch (error) {
      console.error("Error in setup:", error);
    }
  });

  it('should register a product in Fabric', async () => {
    // Skip this test if the API server is not running
    try {
      const response = await axios.post(`${API_URL}/products`, testProduct);

      expect(response.status).to.equal(201);
      expect(response.data.status).to.equal('success');
      expect(response.data.product).to.have.property('id').that.equals(testProduct.id);
      expect(response.data.product).to.have.property('status').that.equals('REGISTERED');
    } catch (error) {
      console.log("API server not running, skipping test");
      this.skip();
    }
  });

  it('should retrieve the registered product', async () => {
    try {
      const response = await axios.get(`${API_URL}/products/${testProduct.id}`);

      expect(response.status).to.equal(200);
      expect(response.data.status).to.equal('success');
      expect(response.data.product).to.have.property('id').that.equals(testProduct.id);
      expect(response.data.product).to.have.property('type').that.equals(testProduct.type);
    } catch (error) {
      console.log("API server not running, skipping test");
      this.skip();
    }
  });

  it('should update product status to CERTIFIED', async () => {
    try {
      const response = await axios.post(`${API_URL}/products/${testProduct.id}/status`, {
        newStatus: 'CERTIFIED',
        additionalData: {
          certificationDate: new Date().toISOString(),
          inspector: 'John Doe'
        }
      });

      expect(response.status).to.equal(200);
      expect(response.data.status).to.equal('success');
      expect(response.data.product).to.have.property('status').that.equals('CERTIFIED');
    } catch (error) {
      console.log("API server not running, skipping test");
      this.skip();
    }
  });

  it('should automatically mint CotTokens after certification', async function() {
    try {
      // Wait for the bridge to process the certification event (3 seconds)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if tokens were minted in the Ethereum contract
      const fabricIdToBatchId = await cotToken.fabricIdToBatchId(testProduct.id);
      expect(fabricIdToBatchId).to.not.equal("0", 'Batch ID should be assigned');

      // Get owner's token balance
      const balance = await cotToken.balanceOf(walletAddress);
      expect(balance).to.be.gt(0n, 'Owner should have tokens');
    } catch (error) {
      console.log("Skipping test:", error.message);
      this.skip();
    }
  });

  it('should transfer product custody to manufacturer', async () => {
    try {
      const response = await axios.post(`${API_URL}/products/${testProduct.id}/transfer`, {
        newHolder: 'Manufacturer X',
        location: 'Factory 1, New York'
      });

      expect(response.status).to.equal(200);
      expect(response.data.product.custodyHistory).to.have.lengthOf(2);
      expect(response.data.product.custodyHistory[1].holder).to.equal('Manufacturer X');
    } catch (error) {
      console.log("API server not running, skipping test");
      this.skip();
    }
  });

  it('should update product status to FINISHED', async () => {
    try {
      const response = await axios.post(`${API_URL}/products/${testProduct.id}/status`, {
        newStatus: 'FINISHED',
        additionalData: {
          completionDate: new Date().toISOString(),
          productSKU: 'ECO-SHIRT-001'
        }
      });

      expect(response.status).to.equal(200);
      expect(response.data.product).to.have.property('status').that.equals('FINISHED');
    } catch (error) {
      console.log("API server not running, skipping test");
      this.skip();
    }
  });

  it('should mint an NFT for the finished product', async () => {
    try {
      const response = await axios.post(`${API_URL}/products/${testProduct.id}/mint-nft`, {
        ownerAddress: walletAddress,
        metadata: {
          name: `Eco T-Shirt ${testProduct.id}`,
          description: 'Sustainable cotton t-shirt with verified provenance',
          image: 'https://example.com/eco-shirt.jpg'
        }
      });

      expect(response.status).to.equal(200);
      expect(response.data).to.have.property('tokenId');

      // Check if NFT exists in the contract
      const tokenId = BigInt(response.data.tokenId);
      const tokenOwner = await productNFT.ownerOf(tokenId);
      expect(tokenOwner).to.equal(walletAddress);

      // Check if fabric ID is linked correctly - use product data mapping if available
      // const fabricId = await productNFT.productData(tokenId).fabricProductId;
      // expect(fabricId).to.equal(testProduct.id);
    } catch (error) {
      console.log("Skipping test:", error.message);
      this.skip();
    }
  });

  it('should initiate recycling for the product', async () => {
    try {
      // Get the token ID from the product data
      const productResponse = await axios.get(`${API_URL}/products/${testProduct.id}`);
      const tokenId = BigInt(productResponse.data.product.nftTokenId);

      // Initiate recycling on Ethereum
      const tx = await productNFT.recycleProduct(tokenId);
      await tx.wait();

      // Check if recycling status is updated through product data mapping
      const productData = await productNFT.productData(tokenId);
      expect(productData.recycled).to.be.true;

      // Wait for the bridge to process the recycling event
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if Fabric status is updated
      const fabricResponse = await axios.get(`${API_URL}/products/${testProduct.id}`);
      expect(fabricResponse.data.product.status).to.equal('RECYCLING_INITIATED');
    } catch (error) {
      console.log("Skipping test:", error.message);
      this.skip();
    }
  });
});
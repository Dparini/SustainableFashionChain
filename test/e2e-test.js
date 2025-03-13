const axios = require('axios');
const { expect } = require('chai');
const { ethers } = require('ethers');

// Constants and configuration
const API_URL = 'http://localhost:3000/api';
const ETHEREUM_PROVIDER_URL = 'http://localhost:8545';
const COT_TOKEN_ADDRESS = require('../ethereum/contract-addresses.json').CotToken;
const PRODUCT_NFT_ADDRESS = require('../ethereum/contract-addresses.json').ProductNFT;

// ABI imports
const CotTokenABI = require('../ethereum/artifacts/contracts/CotToken.sol/CotToken.json').abi;
const ProductNFTABI = require('../ethereum/artifacts/contracts/ProductNFT.sol/ProductNFT.json').abi;

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

describe('End-to-End Test: Supply Chain and Tokenization', function() {
  this.timeout(30000); // 30 seconds timeout

  before(async () => {
    // Setup Ethereum connection
    provider = new ethers.providers.JsonRpcProvider(ETHEREUM_PROVIDER_URL);
    const accounts = await provider.listAccounts();
    wallet = provider.getSigner(accounts[0]);

    cotToken = new ethers.Contract(COT_TOKEN_ADDRESS, CotTokenABI, wallet);
    productNFT = new ethers.Contract(PRODUCT_NFT_ADDRESS, ProductNFTABI, wallet);
  });

  it('should register a product in Fabric', async () => {
    const response = await axios.post(`${API_URL}/products`, testProduct);

    expect(response.status).to.equal(201);
    expect(response.data.status).to.equal('success');
    expect(response.data.product).to.have.property('id').that.equals(testProduct.id);
    expect(response.data.product).to.have.property('status').that.equals('REGISTERED');
  });

  it('should retrieve the registered product', async () => {
    const response = await axios.get(`${API_URL}/products/${testProduct.id}`);

    expect(response.status).to.equal(200);
    expect(response.data.status).to.equal('success');
    expect(response.data.product).to.have.property('id').that.equals(testProduct.id);
    expect(response.data.product).to.have.property('type').that.equals(testProduct.type);
  });

  it('should update product status to CERTIFIED', async () => {
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
  });

  it('should automatically mint CotTokens after certification', async function() {
    // Wait for the bridge to process the certification event (3 seconds)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if tokens were minted in the Ethereum contract
    const fabricIdToBatchId = await cotToken.fabricIdToBatchId(testProduct.id);
    expect(fabricIdToBatchId).to.not.equal(0, 'Batch ID should be assigned');

    // Get owner's token balance
    const ownerAddress = await wallet.getAddress();
    const balance = await cotToken.balanceOf(ownerAddress);
    expect(balance).to.be.gt(0, 'Owner should have tokens');
  });

  it('should transfer product custody to manufacturer', async () => {
    const response = await axios.post(`${API_URL}/products/${testProduct.id}/transfer`, {
      newHolder: 'Manufacturer X',
      location: 'Factory 1, New York'
    });

    expect(response.status).to.equal(200);
    expect(response.data.product.custodyHistory).to.have.lengthOf(2);
    expect(response.data.product.custodyHistory[1].holder).to.equal('Manufacturer X');
  });

  it('should update product status to FINISHED', async () => {
    const response = await axios.post(`${API_URL}/products/${testProduct.id}/status`, {
      newStatus: 'FINISHED',
      additionalData: {
        completionDate: new Date().toISOString(),
        productSKU: 'ECO-SHIRT-001'
      }
    });

    expect(response.status).to.equal(200);
    expect(response.data.product).to.have.property('status').that.equals('FINISHED');
  });

  it('should mint an NFT for the finished product', async () => {
    const ownerAddress = await wallet.getAddress();

    const response = await axios.post(`${API_URL}/products/${testProduct.id}/mint-nft`, {
      ownerAddress,
      metadata: {
        name: `Eco T-Shirt ${testProduct.id}`,
        description: 'Sustainable cotton t-shirt with verified provenance',
        image: 'https://example.com/eco-shirt.jpg'
      }
    });

    expect(response.status).to.equal(200);
    expect(response.data).to.have.property('tokenId');

    // Check if NFT exists in the contract
    const tokenId = response.data.tokenId;
    const tokenOwner = await productNFT.ownerOf(tokenId);
    expect(tokenOwner).to.equal(ownerAddress);

    // Check if fabric ID is linked correctly
    const fabricId = await productNFT.getFabricId(tokenId);
    expect(fabricId).to.equal(testProduct.id);
  });

  it('should initiate recycling for the product', async () => {
    // Get the token ID from the product data
    const productResponse = await axios.get(`${API_URL}/products/${testProduct.id}`);
    const tokenId = productResponse.data.product.nftTokenId;

    // Initiate recycling on Ethereum
    const tx = await productNFT.recycleProduct(tokenId);
    await tx.wait();

    // Check if recycling status is updated
    const isRecycled = await productNFT.isRecycled(tokenId);
    expect(isRecycled).to.be.true;

    // Wait for the bridge to process the recycling event
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if Fabric status is updated
    const fabricResponse = await axios.get(`${API_URL}/products/${testProduct.id}`);
    expect(fabricResponse.data.product.status).to.equal('RECYCLING_INITIATED');
  });
});
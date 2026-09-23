const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Load contract addresses
let contractAddresses;
try {
  contractAddresses = require('../ethereum/contract-addresses.json');
  console.log('Using contract addresses from ethereum directory');
} catch (error) {
  try {
    contractAddresses = require('./contract-addresses.json');
    console.log('Using contract addresses from bridging directory');
  } catch (error) {
    console.error('Cannot find contract-addresses.json file');
    process.exit(1);
  }
}

// Minimal ABIs for basic functionality
const minimalERC20ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint)",
  "function transfer(address to, uint amount) returns (bool)",
  "function mint(address to, uint256 amount)",
  "function mintBatch(string memory batchId, uint256 amount, string memory warehouseId, address recipient)",
  "event Transfer(address indexed from, address indexed to, uint amount)"
];

const minimalERC721ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function mintProduct(address recipient, string memory fabricProductId, string memory productType, string memory manufacturer, string memory metadataURI, string memory tokenURI_, string[] memory cottonBatchIds)",
  "function recycleProduct(uint256 tokenId)",
  "function recordCircularAction(uint256 tokenId, string memory actionType, string memory details)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];

// Mock Fabric Contract Class
class MockFabricContract {
  constructor() {
    this.data = new Map();
    this.products = [
      { id: 'COTTON-001', status: 'CERTIFIED', type: 'cotton', origin: 'Organic Farm A' },
      { id: 'COTTON-002', status: 'REGISTERED', type: 'cotton', origin: 'Sustainable Farm B' }
    ];
    console.log('Created mock Fabric contract');
  }

  async submitTransaction(functionName, ...args) {
    console.log(`Mock Fabric transaction: ${functionName}`, args);

    if (functionName === 'completeTokenization') {
      const [requestId, txHash] = args;
      console.log(`Completed tokenization for request ${requestId} with txHash ${txHash}`);
      return JSON.stringify({ status: 'SUCCESS', txId: `mock-tx-${Date.now()}` });
    }

    if (functionName === 'mintNFT') {
      const [productId, tokenId] = args;
      console.log(`Minted NFT for product ${productId} with tokenId ${tokenId}`);
      return JSON.stringify({ status: 'SUCCESS', txId: `mock-tx-${Date.now()}` });
    }

    return JSON.stringify({ status: 'SUCCESS', txId: `mock-tx-${Date.now()}` });
  }

  async evaluateTransaction(functionName, ...args) {
    console.log(`Mock Fabric query: ${functionName}`, args);

    if (functionName === 'queryProductsByType') {
      const [type] = args;
      return JSON.stringify(this.products.filter(p => p.type === type));
    }

    if (functionName === 'getProduct') {
      const [id] = args;
      const product = this.products.find(p => p.id === id);
      return JSON.stringify(product || { error: 'Product not found' });
    }

    return JSON.stringify({ status: 'SUCCESS', result: 'mock data' });
  }
}

class MockFabricNetwork {
  constructor() {
    this.contract = new MockFabricContract();
    console.log('Created mock Fabric network');
  }

  getContract() {
    return this.contract;
  }

  addBlockListener(listenerId, callback) {
    console.log(`Added block listener: ${listenerId}`);
    // Simulate some events after a delay
    setTimeout(() => {
      const mockEvent = {
        getTransactionEvents: () => [{
          getEvents: () => [{
            eventName: 'TokenizationRequested',
            payload: Buffer.from(JSON.stringify({
              requestId: 'req-001',
              batchId: 'COTTON-001',
              quantity: '10',
              warehouseId: 'WH-001'
            }))
          }]
        }]
      };
      callback(mockEvent);
    }, 5000);
  }
}

class MockFabricGateway {
  constructor() {
    this.network = new MockFabricNetwork();
    console.log('Created mock Fabric gateway');
  }

  async getNetwork() {
    return this.network;
  }

  async disconnect() {
    console.log('Disconnected from mock Fabric gateway');
  }
}

async function main() {
  console.log('Starting mock bridge (Ethereum + Mock Fabric)...');

  try {
    // Print contract addresses for debugging
    console.log('Contract addresses found:');
    console.log(JSON.stringify(contractAddresses, null, 2));

    // Connect to Ethereum
    console.log('Connecting to Ethereum:', process.env.ETHEREUM_PROVIDER_URL);
    const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_PROVIDER_URL);

    // Get network info
    const network = await provider.getNetwork();
    console.log('Connected to network:', network.name, 'chainId:', network.chainId);

    // Get a signer
    const [signer] = await provider.listAccounts();
    const wallet = await provider.getSigner(signer);
    const walletAddress = await wallet.getAddress();
    console.log('Using wallet address:', walletAddress);

    // Initialize contract instances with minimal ABIs
    console.log('Initializing contracts with minimal ABIs...');

    const cotToken = new ethers.Contract(
      contractAddresses.CotToken,
      minimalERC20ABI,
      wallet
    );

    const productNFT = new ethers.Contract(
      contractAddresses.ProductNFT,
      minimalERC721ABI,
      wallet
    );

    // Get basic information from contracts
    console.log('Querying contract information...');
    try {
      const cotTokenName = await cotToken.name();
      const cotTokenSymbol = await cotToken.symbol();

      console.log('Contract information:');
      console.log(`- CotToken: ${cotTokenName} (${cotTokenSymbol})`);
    } catch (error) {
      console.log('Error getting CotToken info:', error.message);
    }

    try {
      const productNFTName = await productNFT.name();
      const productNFTSymbol = await productNFT.symbol();

      console.log(`- ProductNFT: ${productNFTName} (${productNFTSymbol})`);
    } catch (error) {
      console.log('Error getting ProductNFT info:', error.message);
    }

    // Set up Fabric mock
    console.log('Setting up mock Fabric connection...');
    const fabricGateway = new MockFabricGateway();
    const fabricNetwork = await fabricGateway.getNetwork();
    const fabricContract = fabricNetwork.getContract();

    // Set up event listeners
    console.log('Setting up event listeners...');

    cotToken.on('Transfer', (from, to, amount, event) => {
      console.log('CotToken Transfer event:');
      console.log('- From:', from);
      console.log('- To:', to);
      console.log('- Amount:', ethers.formatEther(amount));
      console.log('- Transaction:', event.log.transactionHash);
    });

    productNFT.on('Transfer', (from, to, tokenId, event) => {
      console.log('ProductNFT Transfer event:');
      console.log('- From:', from);
      console.log('- To:', to);
      console.log('- TokenId:', tokenId.toString());
      console.log('- Transaction:', event.log.transactionHash);
    });

    // Set up a simple demo of bridge functionality
    console.log('Setting up demo bridge functionality...');

    // Process the mock fabric event after it's triggered
    fabricNetwork.addBlockListener('bridge-demo', async (event) => {
      for (const tx of event.getTransactionEvents()) {
        for (const evt of tx.getEvents()) {
          if (evt.eventName === 'TokenizationRequested') {
            const payload = JSON.parse(evt.payload.toString());
            console.log('Received TokenizationRequested event from Fabric:', payload);

            // Process on Ethereum
            console.log('Processing tokenization on Ethereum...');
            try {
              const tx = await cotToken.mintBatch(
                payload.batchId,
                ethers.parseEther(payload.quantity),
                payload.warehouseId,
                walletAddress
              );
              console.log('Sent transaction:', tx.hash);

              const receipt = await tx.wait();
              console.log('Transaction confirmed in block:', receipt.blockNumber);

              // Update Fabric state
              await fabricContract.submitTransaction(
                'completeTokenization',
                payload.requestId,
                tx.hash
              );

              console.log('Bridge operation completed successfully!');
            } catch (error) {
              console.error('Error processing tokenization:', error);
            }
          }
        }
      }
    });

    console.log('Bridge is running. Listening for events...');
    console.log('A mock event will be generated in 5 seconds...');
    console.log('Press Ctrl+C to exit');
  } catch (error) {
    console.error('Error initializing bridge:', error);
  }
}

main();
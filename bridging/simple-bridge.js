const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Load contract addresses - use the most recent file
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
  "event Transfer(address indexed from, address indexed to, uint amount)"
];

const minimalERC721ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];

async function main() {
  console.log('Starting simplified bridge (Ethereum only)...');

  try {
    // Print contract addresses for debugging
    console.log('Contract addresses found:');
    console.log(JSON.stringify(contractAddresses, null, 2));

    // Connect to Ethereum
    console.log('Connecting to Ethereum:', process.env.ETHEREUM_PROVIDER_URL);
    const provider = new ethers.providers.JsonRpcProvider(process.env.ETHEREUM_PROVIDER_URL);

    // Get network info
    const network = await provider.getNetwork();
    console.log('Connected to network:', network.name, 'chainId:', network.chainId);

    // Check if the contracts are deployed at the addresses
    const cotTokenCode = await provider.getCode(contractAddresses.CotToken);
    const productNFTCode = await provider.getCode(contractAddresses.ProductNFT);

    console.log('CotToken code length:', cotTokenCode.length);
    console.log('ProductNFT code length:', productNFTCode.length);

    if (cotTokenCode.length <= 2 || productNFTCode.length <= 2) {
      console.log('One or more contracts are not deployed at the specified addresses.');
      console.log('Please deploy the contracts and update the addresses.');
      return;
    }

    // Initialize contract instances with minimal ABIs
    console.log('Initializing contracts with minimal ABIs...');

    const cotToken = new ethers.Contract(
      contractAddresses.CotToken,
      minimalERC20ABI,
      provider
    );

    const productNFT = new ethers.Contract(
      contractAddresses.ProductNFT,
      minimalERC721ABI,
      provider
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

    // Set up event listeners
    console.log('Setting up event listeners...');

    cotToken.on('Transfer', (from, to, amount, event) => {
      console.log('CotToken Transfer event:');
      console.log('- From:', from);
      console.log('- To:', to);
      console.log('- Amount:', ethers.utils.formatEther(amount));
      console.log('- Transaction:', event.transactionHash);
    });

    productNFT.on('Transfer', (from, to, tokenId, event) => {
      console.log('ProductNFT Transfer event:');
      console.log('- From:', from);
      console.log('- To:', to);
      console.log('- TokenId:', tokenId.toString());
      console.log('- Transaction:', event.transactionHash);
    });

    console.log('Bridge is running. Listening for events...');
    console.log('Press Ctrl+C to exit');
  } catch (error) {
    console.error('Error initializing bridge:', error);
  }
}

main();
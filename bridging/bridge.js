const { ethers } = require("ethers");
const { Gateway, Wallets } = require('fabric-network');
const fs = require("fs");
const path = require("path");
const winston = require("winston");
require("dotenv").config();

// ABI imports
const CotTokenABI = require('../ethereum/artifacts/contracts/CotToken.sol/CotToken.json').abi;
const ProductNFTABI = require('../ethereum/artifacts/contracts/ProductNFT.sol/ProductNFT.json').abi;

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
  ),
  transports: [new winston.transports.Console(), new winston.transports.File({ filename: 'bridge.log' })]
});

// Contract addresses
let cotTokenAddress;
let productNFTAddress;
let fabricGateway;
let fabricNetwork;
let fabricContract;
let ethProvider;
let ethWallet;
let cotTokenContract;
let productNFTContract;

async function initFabricConnection() {
  try {
    logger.info("Initializing Fabric connection...");

    // Load connection profile
    const ccpPath = process.env.FABRIC_CONNECTION_PROFILE_PATH;
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    // Load wallet from file system
    const walletPath = path.join(process.cwd(), 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    // Check if admin identity exists in wallet
    const identityLabel = process.env.FABRIC_IDENTITY_LABEL || 'admin';
    const identityExists = await wallet.get(identityLabel);
    if (!identityExists) {
      throw new Error(`Identity ${identityLabel} not found in wallet`);
    }

    // Setup gateway connection
    const gateway = new Gateway();
    await gateway.connect(ccp, {
      wallet,
      identity: identityLabel,
      discovery: { enabled: true, asLocalhost: true }
    });

    // Get network and contract
    const network = await gateway.getNetwork(process.env.FABRIC_CHANNEL_NAME);
    const contract = network.getContract(process.env.FABRIC_CHAINCODE_NAME);

    fabricGateway = gateway;
    fabricNetwork = network;
    fabricContract = contract;

    logger.info("Fabric connection initialized successfully");
    return contract;
  } catch (error) {
    logger.error(`Error initializing Fabric connection: ${error.message}`);
    throw error;
  }
}

async function initEthereumConnection() {
  try {
    logger.info("Initializing Ethereum connection...");

    // Setup provider
    const provider = new ethers.providers.JsonRpcProvider(process.env.ETHEREUM_PROVIDER_URL);

    // Setup wallet
    const privateKey = process.env.ETHEREUM_PRIVATE_KEY;
    const wallet = new ethers.Wallet(privateKey, provider);

    // Get contract instances
    cotTokenAddress = process.env.COT_TOKEN_ADDRESS;
    productNFTAddress = process.env.PRODUCT_NFT_ADDRESS;

    const cotToken = new ethers.Contract(cotTokenAddress, CotTokenABI, wallet);
    const productNFT = new ethers.Contract(productNFTAddress, ProductNFTABI, wallet);

    ethProvider = provider;
    ethWallet = wallet;
    cotTokenContract = cotToken;
    productNFTContract = productNFT;

    logger.info("Ethereum connection initialized successfully");
    return { provider, wallet, cotToken, productNFT };
  } catch (error) {
    logger.error(`Error initializing Ethereum connection: ${error.message}`);
    throw error;
  }
}

async function setupEventListeners() {
  try {
    logger.info("Setting up event listeners...");

    // Listen for Fabric events
    const fabricListener = await fabricNetwork.addBlockListener(async (event) => {
      const block = event;

      for (const tx of block.transactions || []) {
        // Process transactions looking for relevant events
        // This is a simplified example - in production you'd need to decode the transaction data
        try {
          if (tx.transactionData) {
            // Check if this is a product registration or update we need to handle
            // This would be a more complex check in a real implementation
            if (tx.chaincodeId === process.env.FABRIC_CHAINCODE_NAME &&
                (tx.transactionName === 'registerProduct' || tx.transactionName === 'updateStatus')) {
              // Process transaction data
              await processFabricTransaction(tx);
            }
          }
        } catch (txError) {
          logger.error(`Error processing transaction in block: ${txError.message}`);
        }
      }
    });

    // Listen for Ethereum events
    cotTokenContract.on("CottonRedeemed", async (batchId, amount, redeemer, event) => {
      logger.info(`Cotton redeemed: Batch ${batchId}, Amount: ${amount}, Redeemer: ${redeemer}`);
      await processEthereumCottonRedemption(batchId, amount, redeemer);
    });

    productNFTContract.on("RecycleInitiated", async (tokenId, recycler, timestamp, event) => {
      logger.info(`Recycling initiated: Token ${tokenId}, Recycler: ${recycler}, Time: ${timestamp}`);
      await processEthereumRecycleEvent(tokenId, recycler, timestamp);
    });

    logger.info("Event listeners set up successfully");
  } catch (error) {
    logger.error(`Error setting up event listeners: ${error.message}`);
    throw error;
  }
}

// Process a relevant Fabric transaction
async function processFabricTransaction(tx) {
  try {
    // This would involve more complex decoding logic in production
    logger.info(`Processing Fabric transaction: ${tx.transactionId}`);

    // For product registration, we might want to tokenize on Ethereum
    if (tx.transactionName === 'registerProduct' && tx.payload) {
      const product = JSON.parse(tx.payload);

      // If it's a cotton product, register it on Ethereum
      if (product.type === 'cotton' && product.status === 'CERTIFIED') {
        const amount = parseFloat(product.metadata.amount) || 1; // Default to 1 if not specified
        const metadata = JSON.stringify({
          origin: product.origin,
          certifications: product.certifications,
          timestamp: product.timestamp
        });

        // Call Ethereum contract to mint tokens
        const tx = await cotTokenContract.registerCertifiedCotton(
          product.id,
          ethers.utils.parseEther(amount.toString()),
          metadata
        );
        await tx.wait();
        logger.info(`Registered certified cotton on Ethereum: ${product.id}, Amount: ${amount}`);
      }
    }
  } catch (error) {
    logger.error(`Error processing Fabric transaction: ${error.message}`);
  }
}

// Process a cotton redemption event from Ethereum
async function processEthereumCottonRedemption(batchId, amount, redeemer) {
  try {
    // Get the fabric ID for this batch
    const fabricId = await cotTokenContract.getFabricId(batchId);

    // Update the status in Fabric
    await fabricContract.submitTransaction(
      'updateStatus',
      fabricId,
      'REDEEMED',
      Date.now().toString(),
      JSON.stringify({
        redeemedAmount: ethers.utils.formatEther(amount),
        redeemedBy: redeemer,
        redeemedOnEthereum: true
      })
    );

    logger.info(`Updated Fabric status for redeemed cotton: ${fabricId}`);
  } catch (error) {
    logger.error(`Error processing Ethereum cotton redemption: ${error.message}`);
  }
}

// Process a recycling event from Ethereum
async function processEthereumRecycleEvent(tokenId, recycler, timestamp) {
  try {
    // Get the fabric ID for this NFT
    const fabricId = await productNFTContract.getFabricId(tokenId);

    // Update the status in Fabric
    await fabricContract.submitTransaction(
      'updateStatus',
      fabricId,
      'RECYCLING_INITIATED',
      timestamp.toString(),
      JSON.stringify({
        recycledBy: recycler,
        recycledOnEthereum: true,
        nftTokenId: tokenId.toString()
      })
    );

    logger.info(`Updated Fabric status for recycled product: ${fabricId}`);
  } catch (error) {
    logger.error(`Error processing Ethereum recycle event: ${error.message}`);
  }
}

// Create NFT when a product is finished in Fabric
async function mintProductNFT(fabricId, ownerAddress, metadata) {
  try {
    logger.info(`Minting product NFT for Fabric ID: ${fabricId}`);

    // Convert metadata to IPFS URI (in production) or just use as a string for demo
    // You might want to upload this metadata to IPFS in a real application
    const tokenURI = metadata;

    // Call Ethereum contract to mint NFT
    const tx = await productNFTContract.mintProduct(
      ownerAddress,
      fabricId,
      tokenURI
    );
    const receipt = await tx.wait();

    // Extract tokenId from event logs
    const event = receipt.events.find(e => e.event === 'ProductMinted');
    const tokenId = event.args.tokenId;

    logger.info(`Minted NFT with token ID ${tokenId} for product ${fabricId}`);
    return tokenId;
  } catch (error) {
    logger.error(`Error minting product NFT: ${error.message}`);
    throw error;
  }
}

// API route handler to mint an NFT for a product
async function handleMintNFTRequest(fabricId, ownerAddress, metadata) {
  try {
    // First verify the product exists in Fabric
    const productData = await fabricContract.evaluateTransaction('queryProduct', fabricId);
    const product = JSON.parse(productData.toString());

    if (product.status !== 'FINISHED') {
      throw new Error('Product must be in FINISHED status to mint an NFT');
    }

    // Create metadata for the NFT
    const nftMetadata = JSON.stringify({
      name: `Sustainable Fashion Product ${fabricId}`,
      description: 'A sustainable fashion product with verified provenance',
      image: product.metadata.imageUrl || 'https://placeholder.com/product',
      attributes: [
        { trait_type: 'Product Type', value: product.type },
        { trait_type: 'Origin', value: product.origin },
        { trait_type: 'Manufacturer', value: product.custodyHistory[product.custodyHistory.length - 1].holder },
        ...product.certifications.map(cert => ({
          trait_type: 'Certification',
          value: `${cert.type} by ${cert.issuer}`
        }))
      ]
    });

    // Mint the NFT
    const tokenId = await mintProductNFT(fabricId, ownerAddress, nftMetadata);

    // Update the product in Fabric with the NFT information
    await fabricContract.submitTransaction(
      'updateStatus',
      fabricId,
      'TOKENIZED',
      Date.now().toString(),
      JSON.stringify({
        nftTokenId: tokenId.toString(),
        nftOwner: ownerAddress
      })
    );

    return { tokenId: tokenId.toString(), metadata: nftMetadata };
  } catch (error) {
    logger.error(`Error handling mint NFT request: ${error.message}`);
    throw error;
  }
}

async function initBridge() {
  try {
    logger.info("Initializing blockchain bridge...");

    // Initialize both connections
    await initFabricConnection();
    await initEthereumConnection();

    // Set up event listeners
    await setupEventListeners();

    logger.info("Bridge initialized successfully!");

  } catch (error) {
    logger.error(`Error initializing bridge: ${error.message}`);
    throw error;
  }
}

async function start() {
  try {
    await initBridge();
    logger.info("Bridge started successfully!");
  } catch (error) {
    logger.error(`Failed to start bridge: ${error.message}`);
  }
}

// Export functions for external use
module.exports = {
  start,
  handleMintNFTRequest,
  mintProductNFT,
  processEthereumRecycleEvent,
  processEthereumCottonRedemption
};

// Start bridge if this file is run directly
if (require.main === module) {
  start();
}
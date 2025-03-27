/*
 * SustainableFashionChain API Gateway
 *
 * This module provides external API endpoints for integrating with
 * the SustainableFashionChain blockchain system. It offers a RESTful API
 * with appropriate authentication and rate limiting.
 */

'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

// Create API router
const apiRouter = express.Router();

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Apply middleware
apiRouter.use(cors());
apiRouter.use(express.json());
apiRouter.use(limiter);

// Path to crypto materials
const ccpPath = path.resolve(__dirname, '..', 'network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
const walletPath = path.join(__dirname, 'wallet');

// API keys for authentication (in a real system, this would be in a database)
const apiKeys = {
    'test-api-key': {
        id: 'test-client',
        role: 'reader'
    },
    'admin-api-key': {
        id: 'admin-client',
        role: 'admin'
    }
};

// JWT secret (in a real system, this would be an environment variable)
const JWT_SECRET = 'sustainablefashionchain-jwt-secret';
const JWT_EXPIRY = '1h';

// Middleware for API key authentication
const authenticateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({ error: 'API key is required' });
    }

    const client = apiKeys[apiKey];
    if (!client) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    // Attach client info to request
    req.client = client;
    next();
};

// Middleware for JWT authentication
const authenticateJwt = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'JWT token is required' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.client = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// Middleware for role-based access control
const requireRole = (role) => {
    return (req, res, next) => {
        if (!req.client || req.client.role !== role) {
            return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
        }
        next();
    };
};

// Helper function to connect to Fabric network
const connectToFabric = async () => {
    try {
        // Load connection profile
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        // Create a new file system based wallet for managing identities
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        // Check if admin identity exists in wallet
        const identity = await wallet.get('admin');
        if (!identity) {
            throw new Error('Admin identity not found in wallet');
        }

        // Create a new gateway for connecting to the peer node
        const gateway = new Gateway();
        await gateway.connect(ccp, {
            wallet,
            identity: 'admin',
            discovery: { enabled: true, asLocalhost: true }
        });

        // Get the network (channel) our contract is deployed to
        const network = await gateway.getNetwork('sustainchannel');

        // Get the contract from the network
        const contract = network.getContract('supplychain');

        return { gateway, contract };
    } catch (error) {
        throw error;
    }
};

// API Token endpoint
apiRouter.post('/token', authenticateApiKey, (req, res) => {
    try {
        // Generate JWT token
        const token = jwt.sign(req.client, JWT_SECRET, { expiresIn: JWT_EXPIRY });

        // Return token
        res.status(200).json({
            token,
            expires_in: 3600, // 1 hour in seconds
            token_type: 'Bearer'
        });
    } catch (error) {
        console.error(`Error generating token: ${error}`);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

// Batches endpoints
apiRouter.get('/batches', authenticateJwt, async (req, res) => {
    try {
        const { contract, gateway } = await connectToFabric();

        // Query batches
        const result = await contract.evaluateTransaction('QueryAllBatches');
        const batches = JSON.parse(result.toString());

        // Disconnect from gateway
        gateway.disconnect();

        res.status(200).json(batches);
    } catch (error) {
        console.error(`Error querying batches: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

apiRouter.get('/batches/:id', authenticateJwt, async (req, res) => {
    try {
        const { contract, gateway } = await connectToFabric();

        // Get batch by ID
        const result = await contract.evaluateTransaction('GetBatch', req.params.id);
        const batch = JSON.parse(result.toString());

        // Disconnect from gateway
        gateway.disconnect();

        res.status(200).json(batch);
    } catch (error) {
        console.error(`Error getting batch: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

apiRouter.post('/batches', authenticateJwt, requireRole('admin'), async (req, res) => {
    try {
        const { contract, gateway } = await connectToFabric();
        const { id, farmID, quantity, organic, fairTrade, harvestDate, location } = req.body;

        // Create batch
        await contract.submitTransaction(
            'CreateCottonBatch',
            id,
            farmID,
            quantity.toString(),
            organic === true ? 'true' : 'false',
            fairTrade === true ? 'true' : 'false',
            harvestDate,
            location
        );

        // Disconnect from gateway
        gateway.disconnect();

        res.status(201).json({ message: 'Batch created successfully', id });
    } catch (error) {
        console.error(`Error creating batch: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

// Products endpoints
apiRouter.get('/products', authenticateJwt, async (req, res) => {
    try {
        const { contract, gateway } = await connectToFabric();

        // Query products (assuming a QueryAllProducts function exists)
        const result = await contract.evaluateTransaction('QueryAllProducts');
        const products = JSON.parse(result.toString());

        // Disconnect from gateway
        gateway.disconnect();

        res.status(200).json(products);
    } catch (error) {
        console.error(`Error querying products: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

apiRouter.get('/products/:id', authenticateJwt, async (req, res) => {
    try {
        const { contract, gateway } = await connectToFabric();

        // Get product by ID
        const result = await contract.evaluateTransaction('GetProduct', req.params.id);
        const product = JSON.parse(result.toString());

        // Disconnect from gateway
        gateway.disconnect();

        res.status(200).json(product);
    } catch (error) {
        console.error(`Error getting product: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

// Verification endpoint (public, no authentication required)
apiRouter.get('/verify/:id', async (req, res) => {
    try {
        const { contract, gateway } = await connectToFabric();

        // Get product by ID
        const result = await contract.evaluateTransaction('GetProduct', req.params.id);
        const product = JSON.parse(result.toString());

        // Disconnect from gateway
        gateway.disconnect();

        // Return simplified verification data
        res.status(200).json({
            verified: true,
            productId: product.id,
            type: product.type,
            manufacturer: product.manufacturer,
            productionDate: product.productDate,
            nftTokenId: product.nftTokenId,
            materials: product.materials.map(m => ({
                type: m.type,
                percentage: m.percentage,
                sustainable: m.sustainable
            }))
        });
    } catch (error) {
        console.error(`Error verifying product: ${error}`);
        res.status(404).json({ verified: false, error: 'Product not found or could not be verified' });
    }
});

// Tokenization endpoint
apiRouter.post('/tokenize', authenticateJwt, requireRole('admin'), async (req, res) => {
    try {
        const { contract, gateway } = await connectToFabric();
        const { batchID, quantity, warehouseID } = req.body;

        // Generate request ID
        const requestID = `req_${uuidv4()}`;

        // Request tokenization
        await contract.submitTransaction(
            'RequestTokenization',
            requestID,
            batchID,
            quantity.toString(),
            warehouseID
        );

        // Disconnect from gateway
        gateway.disconnect();

        res.status(201).json({ message: 'Tokenization requested successfully', requestID });
    } catch (error) {
        console.error(`Error requesting tokenization: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

// NFT minting endpoint
apiRouter.post('/mint-nft', authenticateJwt, requireRole('admin'), async (req, res) => {
    try {
        const { contract, gateway } = await connectToFabric();
        const { productId } = req.body;

        // Get product data
        const productResult = await contract.evaluateTransaction('GetProduct', productId);
        const product = JSON.parse(productResult.toString());

        // In a real system, this would call the bridge service to mint an NFT
        // For this demo, we'll simulate it by updating the product with a mock NFT token ID
        const nftTokenId = Math.floor(Math.random() * 1000000).toString();

        // Update product with NFT token ID
        await contract.submitTransaction('MintNFT', productId, nftTokenId);

        // Disconnect from gateway
        gateway.disconnect();

        res.status(200).json({ message: 'NFT minted successfully', productId, nftTokenId });
    } catch (error) {
        console.error(`Error minting NFT: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
apiRouter.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Documentation
apiRouter.get('/', (req, res) => {
    res.status(200).json({
        api: 'SustainableFashionChain API',
        version: '1.0.0',
        endpoints: {
            token: 'POST /api/v1/token - Get JWT token',
            batches: 'GET /api/v1/batches - List all batches',
            batch: 'GET /api/v1/batches/:id - Get batch by ID',
            createBatch: 'POST /api/v1/batches - Create a new batch',
            products: 'GET /api/v1/products - List all products',
            product: 'GET /api/v1/products/:id - Get product by ID',
            verify: 'GET /api/v1/verify/:id - Verify product authenticity (public)',
            tokenize: 'POST /api/v1/tokenize - Request tokenization',
            mintNft: 'POST /api/v1/mint-nft - Mint NFT for product',
            health: 'GET /api/v1/health - API health check'
        },
        documentation: 'For more information, see the API documentation at /api/docs'
    });
});

// Export the router
module.exports = apiRouter;
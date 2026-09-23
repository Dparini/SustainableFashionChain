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

    const client = Object.hasOwn(apiKeys, apiKey) ? apiKeys[apiKey] : null;
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
    let gateway;
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
        gateway = new Gateway();
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
        gateway?.disconnect();
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
    let connection;
    try {
        const { contract } = connection = await connectToFabric();

        // Query batches
        const result = await contract.evaluateTransaction('queryAllBatches');
        const batches = JSON.parse(result.toString());

        // Disconnect from gateway


        res.status(200).json(batches);
    } catch (error) {
        console.error(`Error querying batches: ${error}`);
        res.status(500).json({ error: error.message });
    } finally {
        connection?.gateway.disconnect();
    }
});

apiRouter.get('/batches/:id', authenticateJwt, async (req, res) => {
    let connection;
    try {
        const { contract } = connection = await connectToFabric();

        // Get batch by ID
        const result = await contract.evaluateTransaction('queryProduct', req.params.id);
        const batch = JSON.parse(result.toString());

        // Disconnect from gateway


        res.status(200).json(batch);
    } catch (error) {
        console.error(`Error getting batch: ${error}`);
        res.status(500).json({ error: error.message });
    } finally {
        connection?.gateway.disconnect();
    }
});

apiRouter.post('/batches', authenticateJwt, requireRole('admin'), async (req, res) => {
    let connection;
    try {
        const { contract } = connection = await connectToFabric();
        const { id, farmID, quantity, organic, fairTrade, harvestDate, location } = req.body;

        // Create batch
        await contract.submitTransaction(
            'registerCottonBatch',
            id,
            farmID,
            quantity.toString(),
            organic === true ? 'true' : 'false',
            fairTrade === true ? 'true' : 'false',
            harvestDate,
            location
        );

        // Disconnect from gateway


        res.status(201).json({ message: 'Batch created successfully', id });
    } catch (error) {
        console.error(`Error creating batch: ${error}`);
        res.status(500).json({ error: error.message });
    } finally {
        connection?.gateway.disconnect();
    }
});

// Product operations shared by the browser client.
const productOperation = (action, status = 200) => async (req, res) => {
    let connection;
    try {
        connection = await connectToFabric();
        res.status(status).json(await action(connection.contract, req));
    } catch (error) {
        res.status(error.status || 503).json({ error: error.message });
    } finally {
        if (connection) connection.gateway.disconnect();
    }
};
const requiredText = (...fields) => (req, res, next) => {
    if (fields.some(field => typeof req.body[field] !== 'string' || !req.body[field].trim())) {
        return res.status(400).json({ error: `Required fields: ${fields.join(', ')}` });
    }
    next();
};
const parseResult = result => JSON.parse(result.toString());

apiRouter.get('/products/type/:type', authenticateJwt, productOperation(async (contract, req) => ({
    products: parseResult(await contract.evaluateTransaction('queryProductsByType', req.params.type)),
})));
apiRouter.post('/products', authenticateJwt, requireRole('admin'), requiredText('id', 'type', 'origin'),
    (req, res, next) => {
        if (!['cotton', 'silk', 'finished'].includes(req.body.type) ||
            (req.body.certifications !== undefined && !Array.isArray(req.body.certifications)) ||
            (req.body.metadata !== undefined && (!req.body.metadata || typeof req.body.metadata !== 'object' || Array.isArray(req.body.metadata)))) {
            return res.status(400).json({ error: 'Invalid product type, certifications or metadata' });
        }
        next();
    }, productOperation(async (contract, req) => ({
        status: 'success', product: parseResult(await contract.submitTransaction('registerProduct',
            req.body.id, req.body.type, req.body.origin, Date.now().toString(),
            JSON.stringify(req.body.certifications || []), JSON.stringify(req.body.metadata || {}))),
    }), 201));
apiRouter.post('/products/:id/transfer', authenticateJwt, requireRole('admin'), requiredText('newHolder', 'location'),
    productOperation(async (contract, req) => ({ product: parseResult(await contract.submitTransaction(
        'transferCustody', req.params.id, req.body.newHolder, Date.now().toString(), req.body.location)),
    })));
apiRouter.post('/products/:id/status', authenticateJwt, requireRole('admin'), requiredText('newStatus'),
    productOperation(async (contract, req) => ({ product: parseResult(await contract.submitTransaction(
        'updateStatus', req.params.id, req.body.newStatus, Date.now().toString(), JSON.stringify(req.body.additionalData || {}))),
    })));
apiRouter.post('/products/:id/certifications', authenticateJwt, requireRole('admin'), requiredText('certType', 'certId', 'issuer'),
    productOperation(async (contract, req) => ({ product: parseResult(await contract.submitTransaction(
        'addCertification', req.params.id, req.body.certType, req.body.certId, req.body.issuer, Date.now().toString())),
    })));

// Products endpoints
apiRouter.get('/products', authenticateJwt, async (req, res) => {
    let connection;
    try {
        const { contract } = connection = await connectToFabric();

        // Query products (assuming a QueryAllProducts function exists)
        const result = await contract.evaluateTransaction('queryAllProducts');
        const products = JSON.parse(result.toString());

        // Disconnect from gateway


        res.status(200).json(products);
    } catch (error) {
        console.error(`Error querying products: ${error}`);
        res.status(500).json({ error: error.message });
    } finally {
        connection?.gateway.disconnect();
    }
});

apiRouter.get('/products/:id', authenticateJwt, async (req, res) => {
    let connection;
    try {
        const { contract } = connection = await connectToFabric();

        // Get product by ID
        const result = await contract.evaluateTransaction('queryProduct', req.params.id);
        const product = JSON.parse(result.toString());

        // Disconnect from gateway


        res.status(200).json(product);
    } catch (error) {
        console.error(`Error getting product: ${error}`);
        res.status(500).json({ error: error.message });
    } finally {
        connection?.gateway.disconnect();
    }
});

// Verification endpoint (public, no authentication required)
apiRouter.get('/verify/:id', async (req, res) => {
    let connection;
    try {
        const { contract } = connection = await connectToFabric();

        // Get product by ID
        const result = await contract.evaluateTransaction('queryProduct', req.params.id);
        const product = JSON.parse(result.toString());

        // Disconnect from gateway


        // Return simplified verification data
        res.status(200).json({
            verified: true,
            productId: product.id,
            type: product.type,
            manufacturer: product.manufacturer,
            productionDate: product.productDate,
            nftTokenId: product.nftTokenId,
            product,
            materials: (product.materials || []).map(m => ({
                type: m.type,
                percentage: m.percentage,
                sustainable: m.sustainable
            }))
        });
    } catch (error) {
        console.error(`Error verifying product: ${error}`);
        res.status(404).json({ verified: false, error: 'Product not found or could not be verified' });
    } finally {
        connection?.gateway.disconnect();
    }
});

// Tokenization endpoint
apiRouter.post('/tokenize', authenticateJwt, requireRole('admin'), async (req, res) => {
    let connection;
    try {
        const { contract } = connection = await connectToFabric();
        const { batchID, quantity, warehouseID } = req.body;

        // Generate request ID
        const requestID = `req_${uuidv4()}`;

        // Request tokenization
        await contract.submitTransaction(
            'requestTokenization',
            requestID,
            batchID,
            quantity.toString(),
            warehouseID
        );

        // Disconnect from gateway


        res.status(201).json({ message: 'Tokenization requested successfully', requestID });
    } catch (error) {
        console.error(`Error requesting tokenization: ${error}`);
        res.status(500).json({ error: error.message });
    } finally {
        connection?.gateway.disconnect();
    }
});

// NFT minting endpoint
apiRouter.post('/mint-nft', authenticateJwt, requireRole('admin'), async (req, res) => {
    let connection;
    try {
        const { contract } = connection = await connectToFabric();
        const { productId } = req.body;

        // Get product data
        const productResult = await contract.evaluateTransaction('queryProduct', productId);
        const product = JSON.parse(productResult.toString());

        // In a real system, this would call the bridge service to mint an NFT
        // For this demo, we'll simulate it by updating the product with a mock NFT token ID
        const nftTokenId = Math.floor(Math.random() * 1000000).toString();

        // Update product with NFT token ID
        await contract.submitTransaction('mintNFT', productId, nftTokenId);

        // Disconnect from gateway


        res.status(200).json({ message: 'NFT minted successfully', productId, nftTokenId });
    } catch (error) {
        console.error(`Error minting NFT: ${error}`);
        res.status(500).json({ error: error.message });
    } finally {
        connection?.gateway.disconnect();
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
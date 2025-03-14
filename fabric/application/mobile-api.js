/**
 * Mobile Application API Service
 *
 * This module provides RESTful endpoints specifically for the mobile application,
 * with product verification, user authentication, and wallet integration.
 */

'use strict';

const express = require('express');
const { Gateway, Wallets } = require('fabric-network');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const bridge = require('../../bridging/bridge');

// Create mobile API router
const mobileApiRouter = express.Router();

// Load environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'sustainablefashionchain-mobile-secret';
const JWT_EXPIRY = '7d'; // Mobile tokens last longer
const ETHEREUM_PROVIDER_URL = process.env.ETHEREUM_PROVIDER_URL || 'http://localhost:8545';

// Path to crypto materials
const ccpPath = path.resolve(__dirname, '..', 'network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
const walletPath = path.join(__dirname, 'wallet');

// In-memory user database (for demo purposes - should be a real database in production)
// In a production environment, you would use a database like MongoDB or PostgreSQL
const userDatabase = {};

// In-memory notification database (for demo purposes)
const userNotifications = {};

// Apply middleware
mobileApiRouter.use(express.json());

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit to 10 login attempts per IP in 15 minutes
    standardHeaders: true,
    message: 'Too many login attempts, please try again after 15 minutes'
});

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

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication token is required' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// ********** AUTH ENDPOINTS **********

// User registration endpoint
mobileApiRouter.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }

        // Check if user already exists
        if (userDatabase[email]) {
            return res.status(409).json({ error: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user object
        const userId = uuidv4();
        const user = {
            id: userId,
            email,
            name,
            password: hashedPassword,
            role: 'consumer',
            createdAt: new Date().toISOString()
        };

        // Save user to database
        userDatabase[email] = user;

        // Initialize notifications for user
        userNotifications[userId] = [];

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        // Return user info and token
        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        console.error(`Error registering user: ${error}`);
        res.status(500).json({ error: 'Failed to register user' });
    }
});

// Login endpoint
mobileApiRouter.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Check if user exists
        const user = userDatabase[email];
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        // Return user info and token
        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        console.error(`Error logging in: ${error}`);
        res.status(500).json({ error: 'Failed to login' });
    }
});

// ********** PRODUCT ENDPOINTS **********

// Scan product by ID (public endpoint, no auth required)
mobileApiRouter.get('/products/scan/:id', async (req, res) => {
    try {
        const { contract, gateway } = await connectToFabric();

        // Get product by ID
        const result = await contract.evaluateTransaction('queryProduct', req.params.id);
        const product = JSON.parse(result.toString());

        // Disconnect from gateway
        gateway.disconnect();

        if (!product) {
            return res.status(404).json({ verified: false, error: 'Product not found' });
        }

        // Return simplified verification data for display on mobile
        res.status(200).json({
            verified: true,
            productId: product.id,
            type: product.type,
            manufacturer: product.manufacturer,
            productionDate: product.productDate,
            nftTokenId: product.nftTokenId,
            status: product.status,
            materials: product.materials ? product.materials.map(m => ({
                type: m.type,
                percentage: m.percentage,
                sustainable: m.sustainable
            })) : [],
            // Calculate sustainability score based on materials
            sustainabilityScore: calculateSustainabilityScore(product),
            // Calculate certifications count
            certifications: product.certifications ? product.certifications.length : 0,
            // Generate QR verification URL
            verificationUrl: `${req.protocol}://${req.get('host')}/verify/${product.id}`
        });
    } catch (error) {
        console.error(`Error scanning product: ${error}`);
        res.status(500).json({ verified: false, error: 'Failed to verify product' });
    }
});

// Get product details (authenticated users get more info)
mobileApiRouter.get('/products/:id', authenticateToken, async (req, res) => {
    try {
        const { contract, gateway } = await connectToFabric();

        // Get product by ID
        const result = await contract.evaluateTransaction('queryProduct', req.params.id);
        const product = JSON.parse(result.toString());

        // Disconnect from gateway
        gateway.disconnect();

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Get Ethereum NFT data if available
        let nftData = null;
        if (product.nftTokenId) {
            try {
                // In a real application, this would call the Ethereum API or use ethers.js
                // For demo, we'll create mock NFT data
                nftData = {
                    tokenId: product.nftTokenId,
                    contractAddress: process.env.PRODUCT_NFT_ADDRESS || '0x1234567890abcdef',
                    metadata: {
                        name: `${product.type} #${product.nftTokenId}`,
                        description: `A sustainable ${product.type} manufactured by ${product.manufacturer}`,
                        image: `https://example.com/nft/${product.nftTokenId}.jpg`
                    },
                    openseaUrl: `https://opensea.io/assets/ethereum/${process.env.PRODUCT_NFT_ADDRESS || '0x1234567890abcdef'}/${product.nftTokenId}`
                };
            } catch (nftError) {
                console.error(`Error fetching NFT data: ${nftError}`);
                // Continue without NFT data
            }
        }

        // Return full product details
        res.status(200).json({
            product: {
                ...product,
                sustainabilityScore: calculateSustainabilityScore(product),
                carbonImpact: calculateCarbonImpact(product),
                waterSaved: calculateWaterSaved(product),
                nftData
            }
        });
    } catch (error) {
        console.error(`Error getting product: ${error}`);
        res.status(500).json({ error: 'Failed to get product details' });
    }
});

// Get recently scanned products for the user
mobileApiRouter.get('/products/recent', authenticateToken, async (req, res) => {
    try {
        // In a real application, this would fetch from a database
        // For demo, return mock data
        res.status(200).json({
            recentProducts: [
                {
                    id: 'PROD001',
                    type: 'Organic Cotton T-shirt',
                    manufacturer: 'EcoFashion',
                    scanDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                    sustainabilityScore: 92
                },
                {
                    id: 'PROD002',
                    type: 'Sustainable Denim Jeans',
                    manufacturer: 'GreenDenim',
                    scanDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                    sustainabilityScore: 87
                }
            ]
        });
    } catch (error) {
        console.error(`Error getting recent products: ${error}`);
        res.status(500).json({ error: 'Failed to get recent products' });
    }
});

// ********** WALLET ENDPOINTS **********

// Get user wallet balance
mobileApiRouter.get('/wallet/balance', authenticateToken, async (req, res) => {
    try {
        // In a real application, this would fetch the balance from Ethereum
        // For demo, return mock data
        res.status(200).json({
            walletAddress: '0x123...abc',  // This would be the user's actual wallet address
            balance: {
                cot: 238,  // Cotton tokens
                eth: 0.05  // Ethereum balance
            },
            tokenValue: {
                usd: 238 * 1.25  // Mock exchange rate: 1 COT = $1.25
            }
        });
    } catch (error) {
        console.error(`Error getting wallet balance: ${error}`);
        res.status(500).json({ error: 'Failed to get wallet balance' });
    }
});

// Get user's NFT collection
mobileApiRouter.get('/wallet/nfts', authenticateToken, async (req, res) => {
    try {
        // In a real application, this would fetch NFTs from Ethereum
        // For demo, return mock data
        res.status(200).json({
            nfts: [
                {
                    id: '1234',
                    name: 'Eco Hoodie #1234',
                    image: 'https://example.com/nft/1234.jpg',
                    contractAddress: process.env.PRODUCT_NFT_ADDRESS || '0x1234567890abcdef',
                    acquiredDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    id: '5678',
                    name: 'Sustainable Jeans #5678',
                    image: 'https://example.com/nft/5678.jpg',
                    contractAddress: process.env.PRODUCT_NFT_ADDRESS || '0x1234567890abcdef',
                    acquiredDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
                }
            ]
        });
    } catch (error) {
        console.error(`Error getting NFT collection: ${error}`);
        res.status(500).json({ error: 'Failed to get NFT collection' });
    }
});

// Get transaction history
mobileApiRouter.get('/wallet/transactions', authenticateToken, async (req, res) => {
    try {
        // In a real application, this would fetch transactions from Ethereum
        // For demo, return mock data
        res.status(200).json({
            transactions: [
                {
                    type: 'receive',
                    amount: 25,
                    token: 'COT',
                    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                    txHash: '0x123...',
                    from: '0xabc...'
                },
                {
                    type: 'send',
                    amount: 50,
                    token: 'COT',
                    date: new Date(Date.now() - 17 * 24 * 60 * 60 * 1000).toISOString(),
                    txHash: '0x456...',
                    to: '0xdef...'
                }
            ]
        });
    } catch (error) {
        console.error(`Error getting transaction history: ${error}`);
        res.status(500).json({ error: 'Failed to get transaction history' });
    }
});

// ********** CIRCULAR ECONOMY ENDPOINTS **********

// Record a circular economy action (recycling, repair, or resale)
mobileApiRouter.post('/actions/record', authenticateToken, async (req, res) => {
    try {
        const { productId, actionType, details } = req.body;

        if (!productId || !actionType) {
            return res.status(400).json({ error: 'Product ID and action type are required' });
        }

        // Validate action type
        if (!['recycle', 'repair', 'resell'].includes(actionType.toLowerCase())) {
            return res.status(400).json({ error: 'Invalid action type. Must be recycle, repair, or resell' });
        }

        // In a real application, this would be recorded on the blockchain
        // For demo, we'll just return success
        res.status(200).json({
            success: true,
            message: `${actionType} action recorded for product ${productId}`,
            rewardPoints: actionType.toLowerCase() === 'recycle' ? 50 :
                          actionType.toLowerCase() === 'repair' ? 20 :
                          actionType.toLowerCase() === 'resell' ? 15 : 0,
            actionDate: new Date().toISOString()
        });
    } catch (error) {
        console.error(`Error recording circular action: ${error}`);
        res.status(500).json({ error: 'Failed to record circular action' });
    }
});

// Get user's circular economy actions
mobileApiRouter.get('/actions/history', authenticateToken, async (req, res) => {
    try {
        // In a real application, this would fetch from blockchain
        // For demo, return mock data
        res.status(200).json({
            actions: [
                {
                    productId: 'PROD003',
                    productType: 'Organic Cotton Hoodie',
                    actionType: 'recycle',
                    actionDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                    rewardPoints: 50,
                    impact: {
                        co2Saved: '5.2 kg',
                        waterSaved: '2100 liters'
                    }
                },
                {
                    productId: 'PROD004',
                    productType: 'Sustainable Denim Jeans',
                    actionType: 'repair',
                    actionDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    rewardPoints: 20,
                    impact: {
                        co2Saved: '3.8 kg',
                        waterSaved: '1800 liters'
                    }
                }
            ]
        });
    } catch (error) {
        console.error(`Error getting action history: ${error}`);
        res.status(500).json({ error: 'Failed to get action history' });
    }
});

// ********** MARKETPLACE ENDPOINTS **********

// Get marketplace listings
mobileApiRouter.get('/marketplace', authenticateToken, async (req, res) => {
    try {
        // In a real application, this would fetch from a marketplace smart contract
        // For demo, return mock data
        res.status(200).json({
            listings: [
                {
                    id: 'listing1',
                    productType: 'Vintage Eco Dress',
                    price: 75,
                    currency: 'COT',
                    seller: '@greenfashion',
                    sellerId: 'user123',
                    image: 'https://example.com/marketplace/dress.jpg',
                    description: 'Beautiful vintage dress made from organic cotton',
                    listedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    id: 'listing2',
                    productType: 'Upcycled Denim Jacket',
                    price: 120,
                    currency: 'COT',
                    seller: '@sustainablestyles',
                    sellerId: 'user456',
                    image: 'https://example.com/marketplace/jacket.jpg',
                    description: 'Unique jacket made from upcycled denim',
                    listedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
                }
            ]
        });
    } catch (error) {
        console.error(`Error getting marketplace listings: ${error}`);
        res.status(500).json({ error: 'Failed to get marketplace listings' });
    }
});

// Get user's marketplace listings
mobileApiRouter.get('/marketplace/mylistings', authenticateToken, async (req, res) => {
    try {
        // In a real application, this would fetch the user's listings
        // For demo, return mock data
        res.status(200).json({
            listings: [
                {
                    id: 'mylisting1',
                    productType: 'Organic T-shirt',
                    price: 40,
                    currency: 'COT',
                    image: 'https://example.com/marketplace/tshirt.jpg',
                    description: 'Lightly worn organic cotton t-shirt',
                    listedDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
                    status: 'active'
                }
            ]
        });
    } catch (error) {
        console.error(`Error getting user listings: ${error}`);
        res.status(500).json({ error: 'Failed to get user listings' });
    }
});

// Create a new marketplace listing
mobileApiRouter.post('/marketplace/list', authenticateToken, async (req, res) => {
    try {
        const { productType, price, description, nftTokenId } = req.body;

        if (!productType || !price) {
            return res.status(400).json({ error: 'Product type and price are required' });
        }

        // In a real application, this would create a listing on a marketplace smart contract
        // For demo, just return success
        res.status(201).json({
            success: true,
            message: 'Listing created successfully',
            listingId: `listing-${uuidv4().substring(0, 8)}`,
            listedDate: new Date().toISOString()
        });
    } catch (error) {
        console.error(`Error creating listing: ${error}`);
        res.status(500).json({ error: 'Failed to create listing' });
    }
});

// ********** NOTIFICATION ENDPOINTS **********

// Get user notifications
mobileApiRouter.get('/notifications', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get notifications for the user
        const notifications = userNotifications[userId] || [];

        res.status(200).json({ notifications });
    } catch (error) {
        console.error(`Error getting notifications: ${error}`);
        res.status(500).json({ error: 'Failed to get notifications' });
    }
});

// Mark notification as read
mobileApiRouter.post('/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const notificationId = req.params.id;

        // Get notifications for the user
        const notifications = userNotifications[userId] || [];

        // Find and update the notification
        const notificationIndex = notifications.findIndex(n => n.id === notificationId);
        if (notificationIndex !== -1) {
            notifications[notificationIndex].read = true;
            userNotifications[userId] = notifications;
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(`Error marking notification as read: ${error}`);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// ********** USER PROFILE ENDPOINTS **********

// Get user profile
mobileApiRouter.get('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = Object.values(userDatabase).find(u => u.id === userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Return user profile without sensitive information
        res.status(200).json({
            profile: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt,
                stats: {
                    productsScanned: 15,
                    circularActions: 6,
                    rewardPoints: 170,
                    sustainabilityScore: 85
                }
            }
        });
    } catch (error) {
        console.error(`Error getting user profile: ${error}`);
        res.status(500).json({ error: 'Failed to get user profile' });
    }
});

// Update user profile
mobileApiRouter.put('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { name } = req.body;

        // Find user
        const user = Object.values(userDatabase).find(u => u.id === userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update user information
        if (name) {
            user.name = name;
        }

        // Return updated profile
        res.status(200).json({
            message: 'Profile updated successfully',
            profile: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error(`Error updating profile: ${error}`);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ********** UTILITY FUNCTIONS **********

// Calculate sustainability score based on product materials
function calculateSustainabilityScore(product) {
    if (!product.materials || !Array.isArray(product.materials) || product.materials.length === 0) {
        return 50; // Default score
    }

    // Calculate percentage of sustainable materials
    const sustainableMaterials = product.materials.filter(m => m.sustainable);
    const sustainablePercentage = (sustainableMaterials.length / product.materials.length) * 100;

    // Calculate score based on sustainable percentage (scale 0-100)
    // 0% sustainable materials = 40 points
    // 100% sustainable materials = 100 points
    const baseScore = 40 + (sustainablePercentage * 0.6);

    // Add points for certifications (up to 10 extra points)
    const certBonus = product.certifications ? Math.min(10, product.certifications.length * 2) : 0;

    // Return total score (capped at 100)
    return Math.min(100, Math.round(baseScore + certBonus));
}

// Calculate carbon impact in kg
function calculateCarbonImpact(product) {
    // In a real application, this would use actual carbon impact data
    // For demo, calculate based on product type and sustainable materials

    let baseImpact = 0;
    switch (product.type.toLowerCase()) {
        case 't-shirt':
        case 'shirt':
            baseImpact = 5.0;
            break;
        case 'jeans':
        case 'pants':
            baseImpact = 8.0;
            break;
        case 'dress':
            baseImpact = 7.5;
            break;
        case 'hoodie':
        case 'sweatshirt':
            baseImpact = 6.5;
            break;
        default:
            baseImpact = 6.0;
    }

    // Calculate reduction based on sustainable materials
    const sustainabilityScore = calculateSustainabilityScore(product);
    const reduction = (sustainabilityScore - 40) / 60; // Map 40-100 score to 0-100% reduction

    // Calculate final impact
    const impact = baseImpact * (1 - (reduction * 0.7)); // Maximum 70% reduction from base

    return {
        baselineImpact: baseImpact.toFixed(1),
        actualImpact: impact.toFixed(1),
        savedImpact: (baseImpact - impact).toFixed(1),
        unit: 'kg CO2e'
    };
}

// Calculate water saved in liters
function calculateWaterSaved(product) {
    // In a real application, this would use actual water usage data
    // For demo, calculate based on product type and sustainable materials

    let baseUsage = 0;
    switch (product.type.toLowerCase()) {
        case 't-shirt':
        case 'shirt':
            baseUsage = 2700;
            break;
        case 'jeans':
        case 'pants':
            baseUsage = 7000;
            break;
        case 'dress':
            baseUsage = 4000;
            break;
        case 'hoodie':
        case 'sweatshirt':
            baseUsage = 3500;
            break;
        default:
            baseUsage = 3000;
    }

    // Calculate reduction based on sustainable materials
    const sustainabilityScore = calculateSustainabilityScore(product);
    const reduction = (sustainabilityScore - 40) / 60; // Map 40-100 score to 0-100% reduction

    // Calculate water saved
    const savedWater = baseUsage * (reduction * 0.6); // Maximum 60% saved from base

    return {
        baselineUsage: baseUsage,
        savedWater: Math.round(savedWater),
        unit: 'liters'
    };
}

// Export router
module.exports = mobileApiRouter;
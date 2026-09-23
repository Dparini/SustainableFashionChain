require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const { Gateway, Wallets } = require('fabric-network');
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const morgan = require("morgan");
const WebSocket = require('ws');

// Import middleware
const { authenticateToken } = require('./middleware/auth');

// Import API routers
const apiRouter = require('./api-gateway');
const mobileApiRouter = require('./mobile-api');

// Import services
const { createConfiguredBridge } = require("../../bridging/runtime");
const http = require('http');
let bridge = null;
const notificationService = require('./notification-service');

const app = express();
// Set this only for the trusted reverse proxy in front of the API.
if (process.env.TRUST_PROXY) {
    app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY)
        ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
}
const port = process.env.API_PORT || 3001;
// Configure middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(helmet({ contentSecurityPolicy: false })); // Disable CSP for development
app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('dev')); // Logging

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'sustainablefashionchain-session-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    message: 'Too many requests, please try again after 15 minutes'
});
app.use(limiter);

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Fabric connection setup
let gateway = null;
let network = null;
let contract = null;

async function connectToFabric() {
    try {
        // Load connection profile
        const ccpPath = path.resolve(__dirname, "..", "network", "organizations", "peerOrganizations", "org1.example.com", "connection-org1.json");
        const ccp = JSON.parse(fs.readFileSync(ccpPath, "utf8"));

        // Create a new wallet for identity
        const walletPath = path.join(__dirname, "wallet");
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        // Check if admin identity exists
        const identity = await wallet.get("admin");
        if (!identity) {
            console.log("Admin identity not found in wallet. Run enrollAdmin.js first");
            return false;
        }

        // Create a new gateway instance
        gateway = new Gateway();
        await gateway.connect(ccp, {
            wallet,
            identity: "admin",
            discovery: { enabled: true, asLocalhost: true }
        });

        // Get the network and contract
        network = await gateway.getNetwork("sustainchannel");
        contract = network.getContract("supplychain");

        console.log("Connected to Fabric network");
        return true;
    } catch (error) {
        console.error(`Failed to connect to Fabric: ${error}`);
        return false;
    }
}

// Root route
app.get("/", (req, res) => {
    res.render('index', {
        title: 'SustainableFashionChain',
        user: req.session.user || null
    });
});

// API routes
app.use("/api/v1", apiRouter);
app.use("/api", apiRouter);
app.use("/mobile-api", mobileApiRouter);

// Authentication routes
app.get("/login", (req, res) => {
    res.render('login', {
        title: 'Login - SustainableFashionChain',
        error: null
    });
});

app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        // In a real application, this would authenticate against a database
        // For demo purposes, we'll use a simple hardcoded check
        if (username === 'admin' && password === 'password') {
            req.session.user = {
                id: 'admin-user',
                username: 'admin',
                role: 'admin',
                name: 'Administrator'
            };
            return res.redirect('/dashboard');
        }

        // Authentication failed
        res.render('login', {
            title: 'Login - SustainableFashionChain',
            error: 'Invalid username or password'
        });
    } catch (error) {
        console.error(`Login error: ${error}`);
        res.render('login', {
            title: 'Login - SustainableFashionChain',
            error: 'An error occurred during login'
        });
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Dashboard route (requires authentication)
app.get("/dashboard", (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('dashboard', {
        title: 'Dashboard - SustainableFashionChain',
        user: req.session.user
    });
});

// Analytics route
app.get("/analytics", (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('analytics', {
        title: 'Analytics - SustainableFashionChain',
        user: req.session.user
    });
});

// Admin panel route
app.get("/admin", (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/login');
    }
    res.render('admin-panel', {
        title: 'Admin Panel - SustainableFashionChain',
        user: req.session.user
    });
});

// Batches route
app.get("/batches", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        if (!contract) {
            const connected = await connectToFabric();
            if (!connected) {
                return res.render('error', {
                    title: 'Error - SustainableFashionChain',
                    message: 'Failed to connect to blockchain network',
                    error: { status: 500 }
                });
            }
        }

        // Query batches
        const result = await contract.evaluateTransaction('queryAllBatches');
        const batches = JSON.parse(result.toString());

        res.render('batches', {
            title: 'Cotton Batches - SustainableFashionChain',
            user: req.session.user,
            batches: batches
        });
    } catch (error) {
        console.error(`Error loading batches: ${error}`);
        res.render('error', {
            title: 'Error - SustainableFashionChain',
            message: 'Error loading batches',
            error: error
        });
    }
});

// Batch detail route
app.get("/batches/:id", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        if (!contract) {
            const connected = await connectToFabric();
            if (!connected) {
                return res.render('error', {
                    title: 'Error - SustainableFashionChain',
                    message: 'Failed to connect to blockchain network',
                    error: { status: 500 }
                });
            }
        }

        // Query batch
        const result = await contract.evaluateTransaction('queryProduct', req.params.id);
        const batch = JSON.parse(result.toString());

        // Get certifications
        const certifications = batch.certifications || [];

        // Get products made from this batch (in a real app, this would query based on the batch ID)
        const products = [];

        res.render('batch-details', {
            title: `Batch ${req.params.id} - SustainableFashionChain`,
            user: req.session.user,
            batch: batch,
            certifications: certifications,
            products: products
        });
    } catch (error) {
        console.error(`Error loading batch details: ${error}`);
        res.render('error', {
            title: 'Error - SustainableFashionChain',
            message: 'Error loading batch details',
            error: error
        });
    }
});

// Products route
app.get("/products", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        if (!contract) {
            const connected = await connectToFabric();
            if (!connected) {
                return res.render('error', {
                    title: 'Error - SustainableFashionChain',
                    message: 'Failed to connect to blockchain network',
                    error: { status: 500 }
                });
            }
        }

        // Query products
        const result = await contract.evaluateTransaction('queryAllProducts');
        const products = JSON.parse(result.toString());

        res.render('products', {
            title: 'Products - SustainableFashionChain',
            user: req.session.user,
            products: products
        });
    } catch (error) {
        console.error(`Error loading products: ${error}`);
        res.render('error', {
            title: 'Error - SustainableFashionChain',
            message: 'Error loading products',
            error: error
        });
    }
});

// Product detail route
app.get("/products/:id", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        if (!contract) {
            const connected = await connectToFabric();
            if (!connected) {
                return res.render('error', {
                    title: 'Error - SustainableFashionChain',
                    message: 'Failed to connect to blockchain network',
                    error: { status: 500 }
                });
            }
        }

        // Query product
        const result = await contract.evaluateTransaction('queryProduct', req.params.id);
        const product = JSON.parse(result.toString());

        res.render('product-details', {
            title: `Product ${req.params.id} - SustainableFashionChain`,
            user: req.session.user,
            product: product
        });
    } catch (error) {
        console.error(`Error loading product details: ${error}`);
        res.render('error', {
            title: 'Error - SustainableFashionChain',
            message: 'Error loading product details',
            error: error
        });
    }
});

// Product verification route (public)
app.get("/verify/:id", async (req, res) => {
    try {
        if (!contract) {
            const connected = await connectToFabric();
            if (!connected) {
                return res.render('error', {
                    title: 'Error - SustainableFashionChain',
                    message: 'Failed to connect to blockchain network',
                    error: { status: 500 }
                });
            }
        }

        // Query product
        const result = await contract.evaluateTransaction('queryProduct', req.params.id);
        const product = JSON.parse(result.toString());

        if (!product) {
            return res.render('error', {
                title: 'Product Not Found - SustainableFashionChain',
                message: 'The product you are looking for does not exist or could not be verified.',
                error: { status: 404 }
            });
        }

        // Calculate materials breakdown
        if (!product.materials) {
            product.materials = [];
        }

        // Generate mock material breakdown data if missing
        if (product.materials.length === 0) {
            product.materials = [
                { type: 'Organic Cotton', percentage: 95, sustainable: true },
                { type: 'Elastane', percentage: 5, sustainable: false }
            ];
        }

        res.render('verify', {
            title: 'Verify Product - SustainableFashionChain',
            product: product
        });
    } catch (error) {
        console.error(`Error verifying product: ${error}`);
        res.render('error', {
            title: 'Error - SustainableFashionChain',
            message: 'Error verifying product',
            error: error
        });
    }
});

// API Documentation route
app.get("/api-docs", (req, res) => {
    res.render('api-docs', {
        title: 'API Documentation - SustainableFashionChain',
        user: req.session.user || null
    });
});

// Business Intelligence Dashboard route
app.get("/bi-dashboard", (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/login');
    }
    res.render('bi-dashboard', {
        title: 'Business Intelligence - SustainableFashionChain',
        user: req.session.user
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        title: 'Error - SustainableFashionChain',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err : { status: 500 }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', {
        title: 'Not Found - SustainableFashionChain',
        message: 'The page you are looking for does not exist',
        error: { status: 404 }
    });
});

// Create one HTTP server and one WebSocket server, only when explicitly started.
let server;
async function startServer({ listenPort = port, connectFabric = true } = {}) {
    if (server) return server;
    if (connectFabric) await connectToFabric();
    if (process.env.START_BRIDGE === 'true') {
        bridge = createConfiguredBridge();
        await bridge.initialize();
    }
    const listener = http.createServer(app);
    await new Promise((resolve, reject) => {
        listener.once('error', reject);
        listener.listen(listenPort, () => { listener.removeListener('error', reject); resolve(); });
    });
    server = listener;
    notificationService.initialize(server);
    console.log(`App listening at http://localhost:${server.address().port}`);
    return server;
}

async function stopServer() {
    if (gateway) { gateway.disconnect(); gateway = null; network = null; contract = null; }
    if (bridge) { await bridge.stop(); bridge = null; }
    if (notificationService.wss) {
        for (const client of notificationService.wss.clients) client.terminate();
        await new Promise(resolve => notificationService.wss.close(resolve));
        notificationService.wss = null;
    }
    if (server) {
        const listener = server; server = null;
        await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    }
}

if (require.main === module) {
    startServer().catch(error => { console.error(error.message); process.exitCode = 1; });
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, () => stopServer().then(() => process.exit(0)).catch(error => {
            console.error(error); process.exit(1);
        }));
    }
}
module.exports = { app, startServer, stopServer };

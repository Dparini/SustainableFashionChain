const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Gateway, Wallets } = require('fabric-network');
const fs = require("fs");
const path = require("path");
const rateLimit = require("express-rate-limit");
const bridge = require("../../../bridging/bridge");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

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
    const walletPath = path.join(process.cwd(), "wallet");
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
    network = await gateway.getNetwork("mychannel");
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
  res.json({
    status: "success",
    message: "Sustainable Fashion Supply Chain API",
    version: "1.0.0"
  });
});

// API health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "success",
    timestamp: new Date(),
    fabric: gateway && network && contract ? "connected" : "disconnected"
  });
});

// Register a new product
app.post("/api/products", async (req, res) => {
  try {
    const { id, type, origin, certifications, metadata } = req.body;

    if (!id || !type || !origin) {
      return res.status(400).json({
        status: "error",
        message: "Missing required fields: id, type, origin"
      });
    }

    // Connect to Fabric if not connected
    if (!contract) {
      const connected = await connectToFabric();
      if (!connected) {
        return res.status(500).json({
          status: "error",
          message: "Failed to connect to blockchain network"
        });
      }
    }

    const timestamp = Date.now().toString();
    const result = await contract.submitTransaction(
      "registerProduct",
      id,
      type,
      origin,
      timestamp,
      JSON.stringify(certifications || []),
      JSON.stringify(metadata || {})
    );

    res.status(201).json({
      status: "success",
      message: "Product registered successfully",
      product: JSON.parse(result.toString())
    });
  } catch (error) {
    console.error(`Failed to register product: ${error}`);
    res.status(500).json({
      status: "error",
      message: `Failed to register product: ${error.message}`
    });
  }
});

// Transfer custody of a product
app.post("/api/products/:id/transfer", async (req, res) => {
  try {
    const { id } = req.params;
    const { newHolder, location } = req.body;

    if (!newHolder) {
      return res.status(400).json({
        status: "error",
        message: "Missing required field: newHolder"
      });
    }

    // Connect to Fabric if not connected
    if (!contract) {
      const connected = await connectToFabric();
      if (!connected) {
        return res.status(500).json({
          status: "error",
          message: "Failed to connect to blockchain network"
          });
      }
    }

    const timestamp = Date.now().toString();
    const result = await contract.submitTransaction(
      "transferCustody",
      id,
      newHolder,
      timestamp,
      location || ""
    );

    res.json({
      status: "success",
      message: "Custody transferred successfully",
      product: JSON.parse(result.toString())
    });
  } catch (error) {
    console.error(`Failed to transfer custody: ${error}`);
    res.status(500).json({
      status: "error",
      message: `Failed to transfer custody: ${error.message}`
    });
  }
});

// Update product status
app.post("/api/products/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus, additionalData } = req.body;

    if (!newStatus) {
      return res.status(400).json({
        status: "error",
        message: "Missing required field: newStatus"
      });
    }

    // Connect to Fabric if not connected
    if (!contract) {
      const connected = await connectToFabric();
      if (!connected) {
        return res.status(500).json({
          status: "error",
          message: "Failed to connect to blockchain network"
        });
      }
    }

    const timestamp = Date.now().toString();
    const result = await contract.submitTransaction(
      "updateStatus",
      id,
      newStatus,
      timestamp,
      JSON.stringify(additionalData || {})
    );

    res.json({
      status: "success",
      message: "Status updated successfully",
      product: JSON.parse(result.toString())
    });
  } catch (error) {
    console.error(`Failed to update status: ${error}`);
    res.status(500).json({
      status: "error",
      message: `Failed to update status: ${error.message}`
    });
  }
});

// Add certification to a product
app.post("/api/products/:id/certifications", async (req, res) => {
  try {
    const { id } = req.params;
    const { certType, certId, issuer } = req.body;

    if (!certType || !certId || !issuer) {
      return res.status(400).json({
        status: "error",
        message: "Missing required fields: certType, certId, issuer"
      });
    }

    // Connect to Fabric if not connected
    if (!contract) {
      const connected = await connectToFabric();
      if (!connected) {
        return res.status(500).json({
          status: "error",
          message: "Failed to connect to blockchain network"
        });
      }
    }

    const timestamp = Date.now().toString();
    const result = await contract.submitTransaction(
      "addCertification",
      id,
      certType,
      certId,
      issuer,
      timestamp
    );

    res.json({
      status: "success",
      message: "Certification added successfully",
      product: JSON.parse(result.toString())
    });
  } catch (error) {
    console.error(`Failed to add certification: ${error}`);
    res.status(500).json({
      status: "error",
      message: `Failed to add certification: ${error.message}`
    });
  }
});

// Get product details
app.get("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Connect to Fabric if not connected
    if (!contract) {
      const connected = await connectToFabric();
      if (!connected) {
        return res.status(500).json({
          status: "error",
          message: "Failed to connect to blockchain network"
        });
      }
    }

    const result = await contract.evaluateTransaction("queryProduct", id);

    res.json({
      status: "success",
      product: JSON.parse(result.toString())
    });
  } catch (error) {
    console.error(`Failed to query product: ${error}`);
    res.status(500).json({
      status: "error",
      message: `Failed to query product: ${error.message}`
    });
  }
});

// Get products by type
app.get("/api/products/type/:type", async (req, res) => {
  try {
    const { type } = req.params;

    // Connect to Fabric if not connected
    if (!contract) {
      const connected = await connectToFabric();
      if (!connected) {
        return res.status(500).json({
          status: "error",
          message: "Failed to connect to blockchain network"
        });
      }
    }

    const result = await contract.evaluateTransaction("queryProductsByType", type);

    res.json({
      status: "success",
      products: JSON.parse(result.toString())
    });
  } catch (error) {
    console.error(`Failed to query products by type: ${error}`);
    res.status(500).json({
      status: "error",
      message: `Failed to query products by type: ${error.message}`
    });
  }
});

// Bridge routes for Ethereum integration

// Mint NFT for a product
app.post("/api/products/:id/mint-nft", async (req, res) => {
  try {
    const { id } = req.params;
    const { ownerAddress, metadata } = req.body;

    if (!ownerAddress) {
      return res.status(400).json({
        status: "error",
        message: "Missing required field: ownerAddress"
      });
    }

    // Connect to Fabric if not connected
    if (!contract) {
      const connected = await connectToFabric();
      if (!connected) {
        return res.status(500).json({
          status: "error",
          message: "Failed to connect to blockchain network"
        });
      }
    }

    // Use bridge to mint NFT
    const result = await bridge.handleMintNFTRequest(id, ownerAddress, metadata);

    res.json({
      status: "success",
      message: "NFT minted successfully",
      tokenId: result.tokenId,
      metadata: result.metadata
    });
  } catch (error) {
    console.error(`Failed to mint NFT: ${error}`);
    res.status(500).json({
      status: "error",
      message: `Failed to mint NFT: ${error.message}`
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: "error",
    message: "Internal server error"
  });
});

// Connect to Fabric and start the server
async function startServer() {
  const connected = await connectToFabric();
  if (!connected) {
    console.log("Warning: Starting server without connection to Fabric network");
  }

  app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`);
  });
}

startServer();
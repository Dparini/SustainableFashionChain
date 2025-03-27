cat > setup-new.sh << 'EOF'
#!/bin/bash

# SustainableFashionChain Setup Script (New Structure)
echo "Setting up SustainableFashionChain using packages structure..."

# Check prerequisites
echo "Checking prerequisites..."
command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed. Aborting." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed. Aborting." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required but not installed. Aborting." >&2; exit 1; }

# Install Fabric binaries
echo "Installing Hyperledger Fabric binaries..."
curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.2.5 1.5.2

# Setup environment
echo "Setting up environment..."
cp packages/bridging/.env.example packages/bridging/.env

# Install Node dependencies
echo "Installing Node.js dependencies..."
npm install --prefix packages/bridging/
npm install --prefix packages/network/application/
npm install --prefix packages/network/chaincode/supplychain/
npm install --prefix packages/ethereum/
npm install --prefix packages/frontend/

# Build frontend
echo "Building frontend..."
npm run build --prefix packages/frontend/

# Setup Ethereum development environment
echo "Setting up Ethereum development environment..."
cd packages/ethereum
npx hardhat compile
cd ../..

# Setup Fabric network
echo "Setting up Hyperledger Fabric network..."
cd packages/network/network
./network.sh up createChannel
./network.sh deployCC -ccn supplychain -ccp ../chaincode/supplychain
cd ../../..

# Enroll admin
echo "Enrolling admin in Fabric network..."
cd packages/network/application
node enrollAdmin.js
cd ../../..

# Deploy Ethereum contracts
echo "Deploying Ethereum contracts..."
cd packages/ethereum
npx hardhat run scripts/deploy-contracts.js --network localhost
cp contract-addresses.json ../bridging/
cd ../..

# Start bridge in background
echo "Starting blockchain bridge..."
cd packages/bridging
node bridge.js &
BRIDGE_PID=$!
cd ../..

# Start backend
echo "Starting backend API..."
cd packages/network/application
node app.js &
BACKEND_PID=$!
cd ../../..

echo "======================================================"
echo "SustainableFashionChain Setup Complete!"
echo "======================================================"
echo "Backend API: http://localhost:3000"
echo "Frontend: http://localhost:3001"
echo ""
echo "Bridge PID: $BRIDGE_PID"
echo "Backend PID: $BACKEND_PID"
echo ""
echo "To stop the services, run: ./stop-new.sh"
EOF

chmod +x setup-new.sh
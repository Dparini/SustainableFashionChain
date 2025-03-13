#!/bin/bash

# Stop backend and bridge
echo "Stopping backend and bridge services..."
pkill -f "node app.js"
pkill -f "node bridge.js"

# Stop Ethereum network
echo "Stopping Ethereum network..."
cd ethereum
npx hardhat node --kill
cd ..

# Stop Fabric network
echo "Stopping Fabric network..."
cd fabric/network
./network.sh down
cd ../..

echo "All services stopped successfully"
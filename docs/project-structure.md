# SustainableFashionChain - Project Structure

This document provides an overview of the SustainableFashionChain project, a hybrid blockchain platform that combines Hyperledger Fabric for private supply chain management with Ethereum for public tokenization of sustainable commodities.

## Project Overview

The project consists of four main components:

1. **Hyperledger Fabric Network**: Private blockchain for tracking cotton/silk from farm to final product
2. **Ethereum Smart Contracts**: Public blockchain for tokenization and circular economy incentives
3. **Blockchain Bridge**: Middleware that connects the two blockchain networks
4. **Documentation**: Architecture diagrams and sequence flows

## Directory Structure

```
SustainableFashionChain/
├─ README.md                 # Project overview
├─ .gitignore                # Git ignore file
├─ fabric/                   # Hyperledger Fabric implementation
│   ├─ chaincode/            # Smart contracts for supply chain tracking
│   │   └─ supplychain/      
│   │       ├─ go.mod        # Go module configuration
│   │       └─ chaincode.go  # Supply chain chaincode implementation
│   ├─ network/              # Network configuration
│   │   ├─ docker-compose.yaml  # Network services definition
│   │   └─ network.sh        # Network management script
├─ ethereum/                 # Ethereum implementation
│   ├─ contracts/            # Solidity smart contracts
│   │   ├─ CotToken.sol      # ERC-20 token for cotton commodities
│   │   ├─ ProductNFT.sol    # ERC-721 NFT for finished products
│   │   └─ CircularRewards.sol  # Reward system for circular economy
│   ├─ scripts/              # Deployment and interaction scripts
│   │   └─ deploy.js         # Contract deployment script
│   └─ hardhat.config.js     # Hardhat configuration
├─ bridging/                 # Connection between Fabric and Ethereum
│   ├─ bridge.js             # Bridge implementation
│   ├─ package.json          # Node.js dependencies
│   └─ .env.example          # Environment variables template
└─ docs/                     # Documentation
    ├─ architecture-diagram.mmd  # Overall system architecture
    ├─ tokenization-sequence.mmd # Cotton tokenization flow
    ├─ circular-economy-sequence.mmd # Circular economy process
    └─ project-structure.md  # This document
```

## Component Details

### Hyperledger Fabric

The Fabric implementation tracks the entire supply chain of cotton/silk commodities:

- **chaincode.go**: Smart contract for recording batch creation, certifications, custody transfers, tokenization requests, and finished products
- **network.sh**: Script to manage the Fabric network (start/stop, create channels, deploy chaincode)
- **docker-compose.yaml**: Configuration for peer nodes, orderer, and certificate authorities

### Ethereum

The Ethereum implementation provides tokenization and public trading capabilities:

- **CotToken.sol**: ERC-20 token representing 1kg of certified cotton/silk stored in a warehouse
- **ProductNFT.sol**: ERC-721 NFT representing finished fashion products with their full supply chain provenance
- **CircularRewards.sol**: Contract to reward sustainable behaviors (recycling, repairing, reselling) with tokens

### Blockchain Bridge

The bridge connects the private Fabric network with the public Ethereum network:

- **bridge.js**: Node.js service that listens for events on both blockchains and synchronizes state
- **API endpoints**: RESTful API for manual interaction with the bridge

### Documentation

- **Architecture diagram**: Visual representation of the overall system
- **Sequence diagrams**: Step-by-step flows for tokenization and circular economy processes

## Getting Started

1. Set up the Hyperledger Fabric network (see README.md)
2. Deploy the Ethereum contracts to your chosen network
3. Configure and start the blockchain bridge
4. Use the API to interact with the system

## Key Workflows

1. **Cotton Tokenization**:
   - Register cotton batch on Fabric
   - Add certifications and transfer to warehouse
   - Request tokenization
   - Mint ERC-20 tokens on Ethereum

2. **Product Creation and NFT Minting**:
   - Create product from cotton batches on Fabric
   - Bridge mints NFT on Ethereum
   - NFT contains full provenance data

3. **Circular Economy**:
   - Consumer recycles/repairs/resells product
   - Action recorded on Ethereum
   - Consumer receives reward tokens

## Security Considerations

- Fabric network requires proper MSP setup for organizations
- Ethereum contracts use role-based access control
- Bridge requires secure key management for both networks
- Environment variables should be properly secured in production

## Future Enhancements

1. Add parametric weather insurance using Chainlink oracles
2. Create a mobile app for consumers to scan products and view provenance
3. Integrate carbon footprint tracking throughout the supply chain
4. Add DeFi integrations for cotton token lending and yield farming
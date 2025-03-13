# SustainableFashionChain Architecture

## System Components

### Hyperledger Fabric Layer
- **Organizations**: 
  - Org1 (Producers/Farmers)
  - Org2 (Manufacturers/Brands)
  - Orderer Organization
- **Nodes**:
  - Peer Nodes (for each organization)
  - Orderer Nodes
  - Certificate Authority
- **Chaincode**:
  - Supply Chain Tracking Chaincode
    - Batch Management
    - Certification Verification
    - Custody Transfer
    - Product Creation
    - Tokenization Requests

### Ethereum Layer
- **Smart Contracts**:
  - CotToken (ERC-20)
    - Represents 1kg of certified cotton/silk
    - Batch-linked tokenization
    - Trading capabilities
  - ProductNFT (ERC-721)
    - Digital twin of physical products
    - Supply chain provenance data
    - Ownership tracking
  - CircularRewards
    - Incentives for sustainable actions
    - Token distribution for recycling/reuse
- **Oracles**:
  - Price Oracle (Chainlink)
  - Weather Data (optional)

### Bridge Layer
- **Components**:
  - Bridge API Service
  - Event Listeners
  - Transaction Queue
  - State Synchronization
- **Functions**:
  - Detect events in Fabric
  - Trigger actions in Ethereum
  - Handle token minting
  - Record NFT creation
  - Sync state between chains

### User Interactions
- **Actors**:
  - Cotton Farmers
  - Certification Bodies
  - Manufacturers
  - Retailers
  - Consumers
- **Workflows**:
  - Supply Chain Recording
  - Commodity Tokenization
  - Product Creation & NFT Minting
  - Token Trading
  - Circular Economy Actions

## Data Flow

1. Cotton batch registered on Fabric by farmer
2. Certifications added by certification bodies
3. Batch custody transferred through supply chain
4. Tokenization requested when stored in warehouse
5. Bridge detects request and mints tokens on Ethereum
6. Manufacturer creates product from batch on Fabric
7. Bridge mints NFT on Ethereum with provenance data
8. Consumer purchases product and NFT
9. Consumer may recycle/resell/repair product
10. Circular actions recorded on Ethereum
11. Rewards issued to consumer in tokens

## Technical Connections

- Fabric chaincode emits events captured by bridge
- Bridge maintains transaction queue for reliable processing
- Ethereum contracts use role-based access control
- Bridge has admin privileges on both networks
- Oracle provides real-world data to smart contracts
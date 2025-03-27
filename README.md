# SustainableFashionChain

A hybrid blockchain platform for sustainable commodity trading and circular fashion, combining Hyperledger Fabric for supply chain traceability with Ethereum for tokenization.

## Project Overview

This project creates an end-to-end solution for tracking cotton and silk from farm to finished product, with tokenization enabling transparent trading and incentivizing circular economy practices.

### Key Components

1. **Hyperledger Fabric Network**: Private consortium blockchain for tracking supply chain data
2. **Ethereum Contracts**: Public blockchain implementation for tokenization
   - CotToken (ERC-20): Represents 1kg of certified cotton
   - ProductNFT (ERC-721): Represents finished garments with full provenance
3. **Blockchain Bridge**: Connects the Fabric and Ethereum networks
4. **Oracle Integration**: Uses Chainlink for price data and weather information

## Architecture

The platform uses a hybrid architecture:
- **Hyperledger Fabric**: Handles sensitive supply chain data, certifications, and custody transfers
- **Ethereum**: Manages tokenization, public verification, and integration with DeFi ecosystem

## Project Structure

```
SustainableFashionChain/
├─ README.md                 # Project overview and documentation
├─ .gitignore                # Git ignore file
├─ fabric/                   # Hyperledger Fabric implementation
│   ├─ chaincode/            # Smart contracts for Fabric
│   │   └─ supplychain/      # Main supply chain tracking chaincode
│   ├─ network/              # Network configuration
│   └─ application/          # Client application
├─ ethereum/                 # Ethereum implementation
│   ├─ contracts/            # Solidity smart contracts
│   ├─ scripts/              # Deployment and interaction scripts
│   └─ test/                 # Contract tests
├─ bridging/                 # Connection between Fabric and Ethereum
└─ docs/                     # Documentation and diagrams
```

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js (v14+)
- Go (v1.16+)
- Hardhat
- Hyperledger Fabric binaries

### Setup Instructions

1. **Clone the repository**
   ```
   git clone https://github.com/your-username/SustainableFashionChain.git
   cd SustainableFashionChain
   ```

2. **Set up the Fabric network**
   ```
   cd fabric/network
   ./network.sh up
   ```

3. **Deploy the chaincode**
   ```
   ./network.sh deployCC -ccn supplychain -ccp ../chaincode/supplychain
   ```

4. **Deploy Ethereum contracts**
   ```
   cd ../../ethereum
   npx hardhat run scripts/deploy.js --network <network>
   ```

5. **Start the bridge service**
   ```
   cd ../bridging
   npm install
   npm start
   ```

## Features

- Track cotton/silk from farm through production to finished products
- Tokenize certified commodities as ERC-20 tokens
- Create unique NFTs for finished garments with full provenance data
- Incentivize recycling and circular economy practices
- Integration with price oracles for market data

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contact

For questions or collaboration opportunities, please reach out to [your contact information].

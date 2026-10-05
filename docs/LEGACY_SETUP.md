# Archived project documentation

Historical setup and experiments retained for reference. Commands below describe
the original prototype and are not the supported quick start. Use the root README
for the tested local demo and live Fabric integration runner. State-channel and
sidechain issuance are disabled because they lack verified backing. Weather and
carbon oracle adapters require configuration and fail closed.

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
- Node.js (v22.14+; Node 22 LTS recommended)
- Go (v1.16+)
- Hardhat
- Hyperledger Fabric binaries

### Setup Instructions

1. **Clone the repository**
   ```
   git clone https://github.com/Dparini/SustainableFashionChain.git
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

## Dependency maintenance

Use Node 22.14 or newer and `npm ci` in each npm project to install the
committed lockfile. Run `node scripts/audit-dependencies.cjs` from the repository
root to audit all six projects, including development dependencies. The command
returns a failure if any vulnerability remains; no advisories are suppressed.

The frontend uses Vite and Vitest. `npm start` still uses port 3000,
`npm run build` still writes `frontend/build`, and `REACT_APP_API_URL` remains
supported. Bridge and browser wallet integrations use Ethers 6. Fabric clients
use Fabric Gateway, and the Ethereum project uses Hardhat 3.

Dependency overrides are declared in the individual package manifests. Revisit
them when updating their parent packages.

Compatibility checks:

```sh
node --test scripts/dependency-compat.test.cjs
cd ethereum
npx hardhat test test/CotToken.test.js test/ProductNFT.test.js test/CircularRewards.test.js
cd ../fabric/chaincode/supplychain
npm test
cd ../../../frontend
npm test
```

The separate Ethereum end-to-end suite needs running Fabric/API and Ethereum
services and is not covered by the offline checks above.

The frontend entry point is split into separate pages, and the development server
proxies `/api` to `http://127.0.0.1:3001`. Override `API_PROXY_TARGET` for a different
backend or `REACT_APP_API_URL` for a different public API URL. Start the backend
with `npm start` in `fabric/application`, then the frontend with `npm start` in
`frontend`. Use the Sign in page with an API access key before accessing protected
ledger endpoints. The public verification endpoint does not require a key.

The backend can serve its health endpoint and login pages without Fabric.
Ledger operations still require the connection profile, wallet identity and a
running Fabric network. The bridge is opt-in in the backend (`START_BRIDGE=true`)
or can be run separately with `npm start` in `bridging`. Set `BRIDGE_CONFIG` to a
JSON configuration file containing `ethereumRpcUrl`, an Ethereum signing key or
mnemonic, `sidechainBridgeAddress`, `cotTokenAddress`, `productNFTAddress`, `abiDir`,
`fabricConnectionProfilePath` and `fabricWalletPath`. Contract addresses and ABI
files must match the deployed contracts. Do not commit private keys.

Optional queue, cache and proof services need RabbitMQ, Redis and the compiled
circuits/proving keys respectively. Their compatibility entry points in
`services/` delegate to the canonical implementations. Importing queue/cache
services no longer requires a connection to have been initialized already, and
importing the mail service no longer opens an external connection.

Additional verification commands:

```sh
npm test --prefix frontend
npm run build --prefix frontend
npm test --prefix fabric/application -- --runInBand
npm run lint --prefix fabric/application
npm test --prefix bridging
```

`npm test` in `ethereum` runs the offline contract suite. The live suite covers
cotton registration, storage, approval, ERC-20 minting, finished product creation,
NFT minting and recycling across Fabric, the API, the bridge and Ethereum. Start
those services and deploy the contracts before running:

```sh
API_KEY=admin-api-key \
CONTRACT_ADDRESSES_FILE=/path/to/deployed-contract-addresses.json \
ETHEREUM_SIGNER_INDEX=1 \
TOKEN_RECIPIENT_ADDRESS=<bridge-ethereum-address> \
npm run test:e2e --prefix ethereum
```

`API_TOKEN` can replace `API_KEY`. The API key shown above is the repository's
local demonstration key. `TOKEN_RECIPIENT_ADDRESS` is needed when the bridge
mints CotTokens to its own account; use a separate Ethereum signer for the NFT
owner and recycler. Set `API_URL` and `ETHEREUM_PROVIDER_URL` if the services do
not use ports 3001 and 8545. A `BRIDGE_CONFIG` file takes precedence over values
in the bridge's `.env` file.

Container builds use different contexts:

```sh
docker build -f fabric/application/Dockerfile -t sfc-api .
docker build -t sfc-web frontend
```

Run both containers on the same Docker network with the backend named `api`, or
set `API_UPSTREAM` on the frontend container to its backend URL (default
`http://api:3001`). Mount the Fabric connection profile and wallet at the paths
expected by the backend; they are intentionally excluded from the image. The
frontend uses the official Nginx image's environment-template support to forward
`/api/` requests while preserving client-side page routing.
For the single Nginx proxy on that private network, set `TRUST_PROXY=1` on the
backend and expose only the frontend port to clients. This allows the API rate
limiters to use the forwarded client IP. Direct API deployments should leave
`TRUST_PROXY` unset.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

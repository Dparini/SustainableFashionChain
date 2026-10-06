# Development and dependency notes

The root README presents the verified asset lifecycle. Use this page for
contribution setup, dependency audits, API configuration and optional services.
The supported quick start is the root Docker Compose demo; historical commands
are retained in [archived setup](LEGACY_SETUP.md).

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
`frontend`. Configure separate `API_READ_KEY` and `API_ADMIN_KEY` values (at least 16 characters),
and `JWT_SECRET` (at least 32 bytes). Generate random values with `openssl rand -hex 32`.
Without configured API keys, token issuance grants no access. Without a JWT secret,
tokens use an ephemeral key and expire on restart. Token keys are separated by API domain.
HTML admin login additionally requires `ADMIN_USERNAME` and `ADMIN_PASSWORD`; it has no default credentials.
Use the Sign in page with a configured API access key before accessing protected
ledger endpoints. The public verification endpoint does not require a key.

The backend can serve its health endpoint and login pages without Fabric.
Ledger operations still require the connection profile, wallet identity and a
running Fabric network. The bridge is opt-in in the backend (`START_BRIDGE=true`)
or can be run separately with `npm start` in `bridging`. Set `BRIDGE_CONFIG` to a
JSON configuration file containing `ethereumRpcUrl`, an Ethereum signing key or
mnemonic, `cotTokenAddress`, `productNFTAddress`, `abiDir`,
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

`npm test` in `ethereum` runs the offline contract suite. The separately configured API suite covers
cotton registration, storage, approval, ERC-20 minting, finished product creation,
NFT minting and recycling across Fabric, the API, the bridge and Ethereum.
The API suite certifies and attests its batch before issuance. Configure the API
certifier identity and an Ethereum signer with registry attestor authority. Start
those services and deploy the contracts before running:

```sh
API_KEY=admin-api-key \
CONTRACT_ADDRESSES_FILE=/path/to/deployed-contract-addresses.json \
ETHEREUM_SIGNER_INDEX=1 \
SFC_E2E_ATTESTOR_INDEX=0 \
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


## Live Fabric demo prerequisites

The automated runner needs Docker, Git, tar, Node 22+, the four JavaScript packages
listed in the root README, and the agent environment. It downloads pinned official
Fabric/CA binaries and container images into ignored generated state. Keep ports
7050–9051, 18546 and 18547 free. It refuses existing standard Fabric containers.
The public API E2E suite additionally needs a continuously running API and bridge;
it is separate from the fixture and Gateway integration harnesses in CI.

## Targeted dependency compatibility

The backend scopes a `js-yaml` 4 override to `@istanbuljs/load-nyc-config`.
That loader uses the supported `load()` API; the newer parser removes the older
argparse/sprintf-js dependency chain. A compatibility test loads a real YAML
coverage configuration. This addresses [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
without downgrading Jest or suppressing advisories. Frontend lockfiles include
source-map-js 1.2.2 for [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

FROM node:22-bookworm-slim
WORKDIR /app
COPY ethereum/package*.json ethereum/
COPY bridging/package*.json bridging/
COPY fabric/chaincode/supplychain/package*.json fabric/chaincode/supplychain/
RUN npm ci --prefix ethereum && npm ci --omit=dev --prefix bridging && npm ci --omit=dev --prefix fabric/chaincode/supplychain
COPY ethereum ethereum/
COPY bridging bridging/
COPY fabric/chaincode/supplychain fabric/chaincode/supplychain/
WORKDIR /app/ethereum
RUN npx hardhat compile
EXPOSE 8545
CMD ["npx", "hardhat", "node", "--hostname", "0.0.0.0"]

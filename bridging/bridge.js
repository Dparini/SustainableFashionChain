"use strict";

const { connectToFabric } = require('./fabric-client');
const { VerifiedRelay } = require('./verified-relay');
const { ethers } = require('ethers');
const fs = require('node:fs');
const path = require('node:path');
const EventEmitter = require('node:events');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info', format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'verified-bridge' }, transports: [new winston.transports.Console()],
});

// The queue groups work locally. Each issuance is a separately verified transaction;
// no fabricated validator signatures, sidechain settlement or gas-saving estimates.
class VerifiedBridge extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = { batchSize: 50, batchTimeoutMs: 5000, requiredConfirmations: 12, ...config };
    for (const key of ['batchSize', 'batchTimeoutMs', 'requiredConfirmations']) {
      if (!Number.isSafeInteger(this.config[key]) || this.config[key] <= 0) throw new Error(`INVALID_BRIDGE_CONFIG: ${key}`);
    }
    if (config.sidechainRpcUrl || config.stateChannelThreshold) throw new Error('UNVERIFIED_ISSUANCE_PATH_DISABLED');
    this.pendingActions = [];
    this.stats = { successfulFabricToEthereumTx: 0, failedFabricToEthereumTx: 0, totalBatches: 0 };
    this.stopping = false;
  }

  async initialize() {
    try {
      await this.connectToEthereum();
      await this.connectToFabric();
      await this.setupEventListeners();
      this.startBatchTimer();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async connectToEthereum() {
    this.provider = new ethers.JsonRpcProvider(this.config.ethereumRpcUrl);
    if (this.config.ethereumPrivateKey) this.wallet = new ethers.Wallet(this.config.ethereumPrivateKey, this.provider);
    else if (this.config.ethereumMnemonic) this.wallet = ethers.Wallet.fromPhrase(this.config.ethereumMnemonic).connect(this.provider);
    else throw new Error('BRIDGE_SIGNER_REQUIRED');
    this.transactionSigner = new ethers.NonceManager(this.wallet);
    for (const [name, field] of [['CotToken', 'cotToken'], ['ProductNFT', 'productNFT']]) {
      const { abi } = JSON.parse(fs.readFileSync(path.join(this.config.abiDir, `${name}.json`), 'utf8'));
      const address = this.config[`${field}Address`];
      if (!ethers.isAddress(address) || await this.provider.getCode(address) === '0x') throw new Error(`MISSING_BRIDGE_CONTRACT: ${name}`);
      this[field] = new ethers.Contract(address, abi, this.transactionSigner);
    }
  }

  async connectToFabric() {
    const connection = await connectToFabric({
      profilePath: this.config.fabricConnectionProfilePath, walletPath: this.config.fabricWalletPath,
      identity: this.config.fabricUserName, channel: this.config.fabricChannelName,
      chaincode: this.config.fabricContractName, asLocalhost: this.config.fabricAsLocalhost,
    });
    this.fabricGateway = connection.gateway;
    this.fabricNetwork = connection.network;
    this.fabricContract = connection.contract;
  }

  async setupEventListeners() {
    await this.productNFT.on('ProductRecycled', tokenId => {
      // Persisted Ethereum logs are the recovery source; processing uses the same retry queue.
      this.queueFabricToEthereumTransaction({ type: 'recycling', tokenId: tokenId.toString() });
    });
    // Reconcile historical recycling on restart as well as new notifications.
    for (const event of await this.productNFT.queryFilter(this.productNFT.filters.ProductRecycled())) {
      this.queueFabricToEthereumTransaction({ type: 'recycling', tokenId: event.args.tokenId.toString() });
    }
    // Replay committed Fabric events on restart; COT/NFT acknowledgments are idempotent.
    this.fabricEvents = await this.fabricNetwork.getChaincodeEvents(this.config.fabricContractName || 'supplychain', { startBlock: 0n });
    this.fabricEventTask = (async () => {
      for await (const event of this.fabricEvents) {
        if (this.stopping) break;
        const payload = JSON.parse(Buffer.from(event.payload).toString());
        if (event.eventName === 'TokenizationRequested') await this.handleFabricTokenizationRequest({ ...payload, fabricTxId: event.transactionId });
        else if (event.eventName === 'NFTMintingRequested') await this.handleFabricNFTMintingRequest(payload);
      }
    })().catch(error => {
      if (!this.stopping) {
        this.streamError = error;
        logger.error('Fabric event stream stopped', { message: error.message });
        this.emit('streamFailed', error);
      }
    });
  }

  startBatchTimer() {
    if (this.stopping || this.batchTimerId) return;
    this.batchTimerId = setTimeout(async () => {
      this.batchTimerId = null;
      await this.processBatch();
      this.startBatchTimer();
    }, this.config.batchTimeoutMs);
  }

  queueFabricToEthereumTransaction(transaction) {
    if (this.stopping) throw new Error('BRIDGE_STOPPING');
    if (!['tokenization', 'nftMinting', 'recycling'].includes(transaction.type)) throw new Error('UNKNOWN_BRIDGE_ACTION');
    this.pendingActions.push(transaction);
    if (this.pendingActions.length >= this.config.batchSize) void this.processBatch();
  }

  async processBatch() {
    if (this.processingBatch) return this.processingBatch;
    if (!this.pendingActions.length) return;
    this.processingBatch = this.processQueuedTransactions();
    try { await this.processingBatch; } finally { this.processingBatch = null; }
  }

  async processQueuedTransactions() {
    const transactions = this.pendingActions.splice(0, this.config.batchSize);
    let failedTransactions = 0;
    for (const transaction of transactions) {
      try {
        if (transaction.type === 'tokenization') await this.processTokenizationTransaction(transaction);
        else if (transaction.type === 'nftMinting') await this.processNFTMintingTransaction(transaction);
        else if (transaction.type === 'recycling') await this.handleProductRecycled(BigInt(transaction.tokenId));
        else throw new Error('UNKNOWN_BRIDGE_ACTION');
        this.stats.successfulFabricToEthereumTx++;
      } catch (error) {
        if (error.code === 'NONCE_EXPIRED') this.transactionSigner?.reset();
        this.pendingActions.push(transaction);
        this.stats.failedFabricToEthereumTx++;
        failedTransactions++;
        logger.error('Bridge action failed; retained for retry', { type: transaction.type, message: error.shortMessage || error.message });
      }
    }
    this.stats.totalBatches++;
    this.emit(failedTransactions ? 'batchProcessingFailed' : 'batchProcessed', { transactionCount: transactions.length, failedTransactions });
  }

  async processTokenizationTransaction(transaction) {
    return new VerifiedRelay({ token: this.cotToken, fabric: this.fabricContract,
      confirmations: this.config.requiredConfirmations }).relay(transaction, transaction.recipient || this.wallet.address);
  }

  async processNFTMintingTransaction(transaction) {
    const productId = transaction.fabricProductId || transaction.productId;
    if (!productId || productId !== transaction.productId || !ethers.isAddress(transaction.recipient)) throw new Error('INVALID_NFT_EVENT');
    let tokenId = await this.productNFT.fabricToTokenId(productId);
    if (tokenId === 0n) {
      const tx = await this.productNFT.mintProduct(transaction.recipient, productId, transaction.productType,
        transaction.manufacturer, transaction.metadataURI, transaction.metadataURI, transaction.cottonBatchIds);
      const receipt = await tx.wait(this.config.requiredConfirmations);
      if (!receipt || receipt.status !== 1) throw new Error('NFT_MINT_NOT_CONFIRMED');
      tokenId = await this.productNFT.fabricToTokenId(productId);
    }
    // Validate the immutable mint, not the current owner (the NFT may have been transferred).
    const mints = await this.productNFT.queryFilter(this.productNFT.filters.Transfer(ethers.ZeroAddress, transaction.recipient, tokenId));
    if (tokenId === 0n || mints.length !== 1 || await this.productNFT.tokenURI(tokenId) !== transaction.metadataURI) throw new Error('NFT_RECONCILIATION_MISMATCH');
    const data = await this.productNFT.productData(tokenId);
    if (data.fabricProductId !== productId || data.productType !== transaction.productType || data.manufacturer !== transaction.manufacturer) throw new Error('NFT_RECONCILIATION_MISMATCH');
    const receipt = await mints[0].getTransactionReceipt();
    if (!receipt || receipt.status !== 1) throw new Error('NFT_MINT_NOT_CONFIRMED');
    await this.productNFT.runner.provider.waitForTransaction(receipt.hash, this.config.requiredConfirmations);
    await this.fabricContract.submitTransaction('mintNFT', transaction.productId, tokenId.toString());
    return { tokenId: tokenId.toString(), transactionHash: receipt.hash };
  }

  async handleFabricTokenizationRequest(payload) {
    this.queueFabricToEthereumTransaction({ ...payload, type: 'tokenization' });
  }

  async handleFabricNFTMintingRequest(payload) {
    this.queueFabricToEthereumTransaction({ ...payload, fabricProductId: payload.productId, type: 'nftMinting' });
  }

  async handleProductRecycled(tokenId) {
    const product = await this.productNFT.productData(tokenId);
    if (!product.recycled) throw new Error('PRODUCT_NOT_RECYCLED');
    const logs = await this.productNFT.queryFilter(this.productNFT.filters.ProductRecycled(tokenId));
    if (logs.length !== 1) throw new Error('RECYCLING_RECEIPT_MISMATCH');
    const receipt = await logs[0].getTransactionReceipt();
    if (!receipt || receipt.status !== 1) throw new Error('RECYCLING_NOT_CONFIRMED');
    await this.productNFT.runner.provider.waitForTransaction(receipt.hash, this.config.requiredConfirmations);
    await this.fabricContract.submitTransaction('recordRecycling', product.fabricProductId, tokenId.toString(), receipt.hash);
  }

  getStats() {
    return { ...this.stats, pendingTransactions: this.pendingActions.length, healthy: !this.streamError && !this.stopping };
  }

  async stop() {
    this.stopping = true;
    clearTimeout(this.batchTimerId);
    this.fabricEvents?.close();
    await this.fabricEventTask;
    await this.processingBatch;
    // Unprocessed work is reconstructed from committed ledger events on restart.
    await this.fabricGateway?.disconnect();
    await this.productNFT?.removeAllListeners();
    this.provider?.destroy();
  }
}

module.exports = VerifiedBridge;

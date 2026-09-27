const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');

const from = (dir) => createRequire(path.resolve(__dirname, '..', dir, 'package.json'));

test('backend: bcrypt hashes remain compatible with bcryptjs', async () => {
  const requirePackage = from('fabric/application');
  const bcrypt = requirePackage('bcrypt');
  const bcryptjs = requirePackage('bcryptjs');
  const password = 'local-test-password';
  assert.equal(await bcryptjs.compare(password, await bcrypt.hash(password, 4)), true);
  assert.equal(await bcrypt.compare(password, await bcryptjs.hash(password, 4)), true);
  assert.equal(await bcrypt.compare('wrong', await bcrypt.hash(password, 4)), false);
});

test('backend: Nodemailer renders mail without contacting an SMTP server', async () => {
  const requirePackage = from('fabric/application');
  const transporter = requirePackage('nodemailer').createTransport({ streamTransport: true, buffer: true });
  const mail = await transporter.sendMail({
    from: 'sender@example.test', to: 'recipient@example.test',
    subject: 'Compatibility test', text: 'Local message', html: '<p>Local message</p>',
  });
  assert.match(mail.message.toString(), /Subject: Compatibility test/);
  assert.match(mail.message.toString(), /Local message/);
});

test('bridge: Ethers 6 signs validator hashes and records receipt hashes', async () => {
  const requirePackage = from('bridging');
  const { ethers } = requirePackage('ethers');
  const Bridge = require('../bridging/bridge');
  const bridge = new Bridge();
  const wallet = ethers.Wallet.createRandom();
  bridge.validators = [{ privateKey: wallet.privateKey }];
  const hash = ethers.id('local validator test');
  const [signature] = await bridge.getValidatorSignatures(hash);
  assert.equal(ethers.verifyMessage(ethers.getBytes(hash), signature), wallet.address);
  bridge.wallet = wallet;
  let submitted;
  bridge.fabricContract = { async submitTransaction(...args) { submitted = args; } };
  bridge.cotToken = {
    async mintBatch(id, quantity, warehouse, recipient) {
      assert.equal(quantity, 1500000000000000000n);
      assert.equal(recipient, wallet.address);
      return { async wait() { return { hash }; } };
    },
  };
  await bridge.processTokenizationOnMainnet({ batchId: 'batch', quantity: '1.5', warehouseId: 'warehouse', requestId: 'request' });
  assert.deepEqual(submitted, ['completeTokenization', 'request', hash]);

  const iface = new ethers.Interface(['event ProductMinted(uint256 tokenId)']);
  const encoded = iface.encodeEventLog(iface.getEvent('ProductMinted'), [42n]);
  const event = iface.parseLog(encoded);
  bridge.productNFT = { async mintProduct(...args) {
    assert.deepEqual(args, [wallet.address, 'product', 'finished', 'maker',
      'ipfs://product', 'ipfs://product', []]);
    return { async wait() { return { hash, logs: [event] }; } };
  } };
  await bridge.processNFTMintingTransaction({ productId: 'product', fabricProductId: 'product',
    productType: 'finished', manufacturer: 'maker', metadataURI: 'ipfs://product', cottonBatchIds: [] }, 1, []);
  assert.deepEqual(submitted, ['mintNFT', 'product', '42']);

  bridge.queueEthereumToFabricTransaction = (transaction) => { submitted = transaction; };
  await bridge.handleTokensLocked(wallet.address, ethers.parseEther('1.5'), hash, { log: { transactionHash: hash } });
  assert.equal(submitted.amount, '1.5');
  assert.equal(submitted.ethereumTxHash, hash);
});

test('bridge: a failed batch restores its transactions and preserves new arrivals', async () => {
  const Bridge = require('../bridging/bridge');
  const bridge = new Bridge();
  const original = { id: 'original', type: 'tokenization' };
  const arriving = { id: 'arriving', type: 'tokenization' };
  bridge.fabricToEthereumQueue.push(original);
  bridge.sidechainBridge = { async submitBatch() {
    bridge.fabricToEthereumQueue.push(arriving);
    throw new Error('RPC unavailable');
  } };
  await bridge.processBatch();
  assert.deepEqual(bridge.fabricToEthereumQueue, [original, arriving]);
  assert.equal(bridge.processingBatch, false);
  assert.equal(bridge.stats.totalBatches, 0);
});

test('bridge: stale Ethereum nonces reset before retrying a queued batch', async () => {
  const Bridge = require('../bridging/bridge');
  const bridge = new Bridge();
  const transaction = { id: 'retry', type: 'tokenization' };
  bridge.fabricToEthereumQueue.push(transaction);
  let resets = 0;
  bridge.transactionSigner = { reset() { resets++; } };
  bridge.sidechainBridge = { async submitBatch() {
    throw Object.assign(new Error('nonce too low'), { code: 'NONCE_EXPIRED' });
  } };
  await bridge.processBatch();
  assert.equal(resets, 1);
  assert.deepEqual(bridge.fabricToEthereumQueue, [transaction]);
});

test('bridge: a submitted batch reports failed transactions without claiming success', async () => {
  const Bridge = require('../bridging/bridge');
  const bridge = new Bridge();
  const transaction = { id: 'failed-mint', type: 'tokenization' };
  bridge.fabricToEthereumQueue.push(transaction);
  bridge.sidechainBridge = { async submitBatch() {
    return { async wait() { return { hash: '0x1234', gasUsed: 100000n }; } };
  } };
  bridge.processTokenizationTransaction = async () => { throw new Error('mint failed'); };
  let success = false;
  let failed;
  bridge.on('batchProcessed', () => { success = true; });
  bridge.on('batchProcessingFailed', event => { failed = event; });
  await bridge.processBatch();
  assert.equal(success, false);
  assert.equal(failed.failedTransactions, 1);
  assert.deepEqual(bridge.fabricToEthereumQueue, [transaction]);
});

test('bridge: Gateway chaincode events await processing and decode Uint8Array payloads', async () => {
  const Bridge = require('../bridging/bridge');
  const bridge = new Bridge();
  bridge.sidechainBridge = { async on() {} };
  bridge.productNFT = { async on() {} };
  bridge.fabricNetwork = { async getChaincodeEvents(name) {
    assert.equal(name, 'supplychain');
    return (async function* () {
      yield { eventName: 'TokenizationRequested', payload: new TextEncoder().encode('{"requestId":"request"}') };
    })();
  } };
  let received;
  bridge.handleFabricTokenizationRequest = async data => { await Promise.resolve(); received = data; };
  await bridge.setupEventListeners();
  await bridge.fabricEventTask;
  assert.deepEqual(received, { requestId: 'request' });
});

test('bridge: gas statistics use bigint and report zero before any batch', () => {
  const Bridge = require('../bridging/bridge');
  const bridge = new Bridge();
  assert.equal(bridge.getStats().gasSavedInETH, '0.0');
  bridge.stats.totalGasSaved = 3000000;
  assert.equal(bridge.getStats().gasSavedInETH, '0.15');
});

test('bridge: recycling events update the matching Fabric product', async () => {
  const Bridge = require('../bridging/bridge');
  const bridge = new Bridge();
  bridge.productNFT = { async productData(tokenId) {
    assert.equal(tokenId, 42n);
    return { fabricProductId: 'SHIRT-42' };
  } };
  let submitted;
  bridge.fabricContract = { async submitTransaction(...args) { submitted = args; } };
  await bridge.handleProductRecycled(42n);
  assert.equal(submitted[0], 'updateStatus');
  assert.equal(submitted[1], 'SHIRT-42');
  assert.equal(submitted[2], 'RECYCLING_INITIATED');
});

test('bridge: explicit configuration wins over local environment defaults', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sfc-bridge-config-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'bridge.json');
  const config = {
    ethereumRpcUrl: 'http://127.0.0.1:8545', ethereumPrivateKey: 'configured-key',
    sidechainBridgeAddress: 'configured-bridge', cotTokenAddress: 'configured-token',
    productNFTAddress: 'configured-nft', abiDir: directory,
    fabricConnectionProfilePath: 'configured-profile', fabricWalletPath: 'configured-wallet',
  };
  await fs.writeFile(file, JSON.stringify(config));
  const previous = {
    BRIDGE_CONFIG: process.env.BRIDGE_CONFIG,
    ETHEREUM_PRIVATE_KEY: process.env.ETHEREUM_PRIVATE_KEY,
    COT_TOKEN_ADDRESS: process.env.COT_TOKEN_ADDRESS,
  };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  process.env.BRIDGE_CONFIG = file;
  process.env.ETHEREUM_PRIVATE_KEY = 'stale-key';
  process.env.COT_TOKEN_ADDRESS = 'stale-token';
  const { createConfiguredBridge } = require('../bridging/runtime');
  const bridge = createConfiguredBridge();
  assert.equal(bridge.config.ethereumPrivateKey, 'configured-key');
  assert.equal(bridge.config.cotTokenAddress, 'configured-token');
});

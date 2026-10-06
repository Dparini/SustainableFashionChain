const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');

const from = (dir) => createRequire(path.resolve(__dirname, '..', dir, 'package.json'));

test('backend: coverage YAML config loads through the supported parser', async (t) => {
  const rootRequire = from('fabric/application');
  const jestRequire = createRequire(rootRequire.resolve('jest/package.json'));
  const transformRequire = createRequire(jestRequire.resolve('@jest/core/package.json'));
  const instrumentationRequire = createRequire(transformRequire.resolve('@jest/transform/package.json'));
  const babelRequire = createRequire(instrumentationRequire.resolve('babel-plugin-istanbul'));
  const { loadNycConfig } = babelRequire('@istanbuljs/load-nyc-config');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sfc-nyc-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'package.json'), '{}');
  await fs.writeFile(path.join(directory, '.nycrc.yml'), 'all: true\nreporter:\n  - text\n  - lcov\nexclude:\n  - test/**\n');
  const config = await loadNycConfig({ cwd: directory });
  assert.equal(config.all, true);
  assert.deepEqual(config.reporter, ['text', 'lcov']);
  assert.deepEqual(config.exclude, ['test/**']);
});

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

test('bridge: retries failed work without losing concurrent arrivals or claiming success', async () => {
  const Bridge = require('../bridging/bridge');
  const bridge = new Bridge();
  const original = { type: 'tokenization', requestId: 'original' };
  const arriving = { type: 'tokenization', requestId: 'arriving' };
  bridge.pendingActions.push(original);
  let resets = 0, failed;
  bridge.transactionSigner = { reset() { resets++; } };
  bridge.processTokenizationTransaction = async () => {
    bridge.pendingActions.push(arriving);
    throw Object.assign(new Error('nonce too low'), { code: 'NONCE_EXPIRED' });
  };
  bridge.on('batchProcessingFailed', event => { failed = event; });
  await bridge.processBatch();
  assert.deepEqual(bridge.pendingActions, [arriving, original]);
  assert.equal(resets, 1);
  assert.equal(failed.failedTransactions, 1);
  assert.equal(bridge.stats.successfulFabricToEthereumTx, 0);
  assert.equal(bridge.processingBatch, null);
});

test('bridge: concurrent batch calls never process the same work twice', async () => {
  const Bridge = require('../bridging/bridge');
  const bridge = new Bridge();
  bridge.pendingActions.push({ type: 'tokenization' });
  let processed = 0;
  bridge.processTokenizationTransaction = async () => { await Promise.resolve(); processed++; };
  await Promise.all([bridge.processBatch(), bridge.processBatch()]);
  assert.equal(processed, 1);
  assert.equal(bridge.getStats().pendingTransactions, 0);
  assert.throws(() => bridge.queueFabricToEthereumTransaction({ type: 'unknown' }), /UNKNOWN_BRIDGE_ACTION/);
});

test('bridge: committed event identity overrides untrusted payload identity', async () => {
  const Bridge = require('../bridging/bridge');
  const bridge = new Bridge();
  bridge.productNFT = { async on() {}, filters: { ProductRecycled() {} }, async queryFilter() { return []; } };
  bridge.fabricNetwork = { async getChaincodeEvents(name, options) {
    assert.equal(options.startBlock, 0n);
    return (async function* () {
      yield { eventName: 'TokenizationRequested', transactionId: 'a'.repeat(64), payload: new TextEncoder().encode('{"requestId":"request","fabricTxId":"forged"}') };
    })();
  } };
  let received;
  bridge.handleFabricTokenizationRequest = async data => { received = data; };
  await bridge.setupEventListeners();
  await bridge.fabricEventTask;
  assert.deepEqual(received, { requestId: 'request', fabricTxId: 'a'.repeat(64) });
});

test('bridge: event stream failure marks the bridge unhealthy and notifies its runtime', async () => {
  const Bridge = require('../bridging/bridge');
  const bridge = new Bridge();
  bridge.productNFT = { async on() {}, filters: { ProductRecycled() {} }, async queryFilter() { return []; } };
  bridge.fabricNetwork = { async getChaincodeEvents() { return (async function* () { throw new Error('disconnected'); })(); } };
  let reported;
  bridge.on('streamFailed', error => { reported = error; });
  await bridge.setupEventListeners(); await bridge.fabricEventTask;
  assert.equal(reported.message, 'disconnected');
  assert.equal(bridge.getStats().healthy, false);
});

test('bridge: recycling failures propagate and successful receipts use the restricted acknowledgment', async () => {
  const Bridge = require('../bridging/bridge');
  const bridge = new Bridge();
  const hash = '0x' + 'a'.repeat(64);
  bridge.productNFT = {
    async productData() { return { fabricProductId: 'SHIRT-42', recycled: true }; },
    filters: { ProductRecycled() {} },
    async queryFilter() { return [{ async getTransactionReceipt() { return { status: 1, hash }; } }]; },
    runner: { provider: { async waitForTransaction() {} } },
  };
  bridge.fabricContract = { async submitTransaction() { throw new Error('Fabric unavailable'); } };
  await assert.rejects(bridge.handleProductRecycled(42n), /Fabric unavailable/);
  let submitted;
  bridge.fabricContract.submitTransaction = async (...args) => { submitted = args; };
  await bridge.handleProductRecycled(42n);
  assert.deepEqual(submitted, ['recordRecycling', 'SHIRT-42', '42', hash]);
});

test('bridge: lost NFT acknowledgment recovers the original mint without minting twice', async () => {
  const Bridge = require('../bridging/bridge');
  const bridge = new Bridge();
  const hash = '0x' + 'a'.repeat(64);
  let mints = 0, tokenId = 0n, unavailable = true;
  const proposal = { productId: 'shirt', recipient: '0x' + '1'.repeat(40), productType: 'finished', manufacturer: 'maker', metadataURI: 'ipfs://shirt', cottonBatchIds: ['batch'] };
  bridge.productNFT = {
    async fabricToTokenId() { return tokenId; },
    async mintProduct() { mints++; tokenId = 42n; return { async wait() { return { status: 1, hash }; } }; },
    async tokenURI() { return 'ipfs://shirt'; },
    async productData() { return { fabricProductId: 'shirt', productType: 'finished', manufacturer: 'maker' }; },
    filters: { Transfer(from, to) { return to; } },
    async queryFilter(recipient) { return recipient === proposal.recipient ? [{ async getTransactionReceipt() { return { status: 1, hash }; } }] : []; },
    runner: { provider: { async waitForTransaction() {} } },
  };
  bridge.fabricContract = { async submitTransaction(...args) {
    if (unavailable) throw new Error('Fabric unavailable');
    assert.deepEqual(args, ['mintNFT', 'shirt', '42']);
  } };
  await assert.rejects(bridge.processNFTMintingTransaction(proposal), /Fabric unavailable/);
  unavailable = false;
  await bridge.processNFTMintingTransaction(proposal);
  assert.equal(mints, 1);
  await assert.rejects(bridge.processNFTMintingTransaction({ ...proposal, recipient: '0x' + '2'.repeat(40) }), /NFT_RECONCILIATION_MISMATCH/);
});

test('bridge: explicit configuration wins over local environment defaults', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sfc-bridge-config-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'bridge.json');
  const config = {
    ethereumRpcUrl: 'http://127.0.0.1:8545', ethereumPrivateKey: 'configured-key',
    cotTokenAddress: 'configured-token',
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

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const crypto = require('node:crypto');

const from = (dir) => createRequire(path.resolve(__dirname, '..', dir, 'package.json'));

for (const dir of ['bridging', 'fabric/application', 'fabric/network/fabric/application']) {
  test(`${dir}: Fabric enrollment crypto works with jsrsasign 11`, async () => {
    const requirePackage = from(dir);
    const FabricCA = requirePackage('fabric-ca-client');
    const { Wallets, Gateway } = requirePackage('fabric-network');
    const ca = new FabricCA('https://localhost:7054');
    const suite = ca.getCryptoSuite();
    const key = suite.generateEphemeralKey();
    const csr = key.generateCSR('CN=dependency-test');
    const { KJUR } = requirePackage('jsrsasign');
    assert.equal(KJUR.asn1.csr.CSRUtil.verifySignature(csr), true);
    const pem = key.generateX509Certificate('/CN=dependency-test');
    const cert = new crypto.X509Certificate(pem);
    assert.equal(cert.verify(cert.publicKey), true);
    const message = Buffer.from('dependency compatibility');
    const signature = suite.sign(key, suite.hash(message));
    assert.equal(crypto.verify('sha256', message, cert.publicKey, signature), true);
    assert.equal(crypto.verify('sha256', Buffer.from('tampered'), cert.publicKey, signature), false);
    const wallet = await Wallets.newInMemoryWallet();
    await wallet.put('test', {
      credentials: { certificate: pem, privateKey: key.toBytes() },
      mspId: 'Org1MSP', type: 'X.509',
    });
    assert.equal((await wallet.get('test')).credentials.certificate, pem);
    assert.equal(typeof new Gateway().connect, 'function');
  });
}

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
  bridge.productNFT = { async mintProduct() {
    return { async wait() { return { hash, logs: [event] }; } };
  } };
  await bridge.processNFTMintingTransaction({ productId: 'product', cottonBatchIds: [] }, 1, []);
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

test('bridge: Fabric 2 listeners await event processing', async () => {
  const Bridge = require('../bridging/bridge');
  const bridge = new Bridge();
  bridge.sidechainBridge = { async on() {} };
  let listener;
  bridge.fabricNetwork = { async addBlockListener(callback) { listener = callback; } };
  let received;
  bridge.handleFabricTokenizationRequest = async data => {
    await Promise.resolve();
    received = data;
  };
  await bridge.setupEventListeners();
  assert.equal(typeof listener, 'function');
  await listener({ getTransactionEvents: () => [{ getEvents: () => [{
    eventName: 'TokenizationRequested', payload: Buffer.from('{"requestId":"request"}'),
  }] }] });
  assert.deepEqual(received, { requestId: 'request' });
});

test('bridge: gas statistics use bigint and report zero before any batch', () => {
  const Bridge = require('../bridging/bridge');
  const bridge = new Bridge();
  assert.equal(bridge.getStats().gasSavedInETH, '0.0');
  bridge.stats.totalGasSaved = 3000000;
  assert.equal(bridge.getStats().gasSavedInETH, '0.15');
});

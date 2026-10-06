process.env.JWT_SECRET = 'isolated-api-test-secret-at-least-32-bytes';
process.env.API_READ_KEY = 'isolated-test-reader-key';
process.env.API_ADMIN_KEY = 'isolated-test-admin-key';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'isolated-login-password';
const request = require('supertest');
// Load EJS before the scoped filesystem spy; it captures fs.readFileSync at import.
require('ejs');
const { app, startServer, stopServer } = require('../app');
const jwt = require('jsonwebtoken');
const { connectToFabric } = require('../../../bridging/fabric-client');
const fs = require('fs');

jest.mock('../../../bridging/fabric-client', () => ({ connectToFabric: jest.fn() }));
const mockContract = { evaluateTransaction: jest.fn(), submitTransaction: jest.fn() };
const mockGateway = { connect: jest.fn(), getNetwork: jest.fn(), disconnect: jest.fn() };
let profileRead;
const token = role => jwt.sign({ id: 'test', role }, require('../config/auth').jwtSecret('ledger'));
beforeEach(() => {
  jest.clearAllMocks();
  connectToFabric.mockResolvedValue({ gateway: mockGateway, contract: mockContract });
  const read = fs.readFileSync;
  profileRead = jest.spyOn(fs, 'readFileSync').mockImplementation((file, ...args) => String(file).endsWith('connection-org1.json') ? '{}' : read(file, ...args));
});
afterEach(() => { profileRead.mockRestore(); });
afterAll(stopServer);

test('health and HTML home work without starting Fabric', async () => {
  await request(app).get('/api/v1/health').expect(200).expect(response => expect(response.body.status).toBe('OK'));
  await request(app).get('/').expect(200).expect(/SustainableFashionChain/);
});
test('one HTTP listener owns one WebSocket upgrade handler', async () => {
  const server = await startServer({ listenPort: 0, connectFabric: false });
  expect(await startServer({ listenPort: 0, connectFabric: false })).toBe(server);
  expect(server.listenerCount('upgrade')).toBe(1);
  await stopServer();
});
test('product reads and writes enforce authentication and roles', async () => {
  await request(app).get('/api/v1/products/type/cotton').expect(401);
  await request(app).post('/api/v1/products').set('Authorization', `Bearer ${token('reader')}`).send({}).expect(403);
  expect(mockContract.submitTransaction).not.toHaveBeenCalled();
});
test('invalid products are rejected before opening a Fabric connection', async () => {
  await request(app).post('/api/v1/products').set('Authorization', `Bearer ${token('admin')}`).send({ id: 'p' }).expect(400);
  expect(connectToFabric).not.toHaveBeenCalled();
});
test('product registration calls the existing chaincode signature', async () => {
  const product = { id: 'p', type: 'cotton', origin: 'farm' };
  mockContract.submitTransaction.mockResolvedValue(Buffer.from(JSON.stringify(product)));
  const response = await request(app).post('/api/v1/products').set('Authorization', `Bearer ${token('admin')}`).send(product).expect(201);
  expect(response.body.product).toEqual(product);
  expect(mockContract.submitTransaction).toHaveBeenCalledWith('registerProduct', 'p', 'cotton', 'farm', expect.any(String), '[]', '{}');
  expect(mockGateway.disconnect).toHaveBeenCalledTimes(1);
});
test('failed chaincode requests release the gateway', async () => {
  mockContract.evaluateTransaction.mockRejectedValue(new Error('Ledger unavailable'));
  await request(app).get('/api/v1/products/type/cotton').set('Authorization', `Bearer ${token('reader')}`).expect(503);
  expect(mockGateway.disconnect).toHaveBeenCalledTimes(1);
});
test('public verification handles products without a materials array', async () => {
  mockContract.evaluateTransaction.mockResolvedValue(Buffer.from(JSON.stringify({ id: 'p', type: 'cotton' })));
  const response = await request(app).get('/api/v1/verify/p').expect(200);
  expect(response.body.materials).toEqual([]);
  expect(response.body.product.id).toBe('p');
  expect(mockContract.evaluateTransaction).toHaveBeenCalledWith('queryProduct', 'p');
});

test('login and authenticated dashboard templates render', async () => {
  const agent = request.agent(app);
  await agent.get('/login').expect(200).expect(/Username/);
  await agent.post('/login').type('form').send({ username: 'admin', password: 'isolated-login-password' }).expect(302).expect('Location', '/dashboard');
  await agent.get('/dashboard').expect(200).expect(/Administrator/);
});

test('product lookup failure also releases its gateway', async () => {
  mockContract.evaluateTransaction.mockRejectedValue(new Error('PRODUCT_NOT_FOUND'));
  await request(app).get('/api/v1/products/missing').set('Authorization', `Bearer ${token('reader')}`).expect(404);
  expect(mockGateway.disconnect).toHaveBeenCalledTimes(1);
});

test('inherited object properties cannot be used as API keys', async () => {
  await request(app).post('/api/v1/token').set('x-api-key', 'toString').expect(401);
});

test('product flow persists through the real chaincode and API routes', async () => {
  const SupplyChainContract = require('../../chaincode/supplychain');
  const chaincode = new SupplyChainContract();
  const state = new Map();
  const context = {
    stub: {
      getState: async key => state.get(key) || Buffer.alloc(0),
      putState: async (key, value) => { state.set(key, value); },
    },
  };
  const contract = {
    submitTransaction: async (name, ...args) => Buffer.from(await chaincode[name](context, ...args)),
    evaluateTransaction: async (name, ...args) => Buffer.from(await chaincode[name](context, ...args)),
  };
  connectToFabric.mockResolvedValue({ gateway: mockGateway, contract });
  const auth = { Authorization: `Bearer ${token('admin')}` };
  const product = { id: 'FLOW-001', type: 'cotton', origin: 'Test Farm', metadata: { quality: 'organic' } };

  const created = await request(app).post('/api/v1/products').set(auth).send(product).expect(201);
  expect(created.body.product).toMatchObject({ id: product.id, status: 'REGISTERED', metadata: product.metadata });

  const certified = await request(app).post(`/api/v1/products/${product.id}/status`).set(auth)
    .send({ newStatus: 'CERTIFIED', additionalData: { inspector: 'Test Inspector' } }).expect(200);
  expect(certified.body.product).toMatchObject({ status: 'CERTIFIED', inspector: 'Test Inspector' });

  const transferred = await request(app).post(`/api/v1/products/${product.id}/transfer`).set(auth)
    .send({ newHolder: 'Test Manufacturer', location: 'Test Factory' }).expect(200);
  expect(transferred.body.product.custodyHistory).toHaveLength(2);
  expect(transferred.body.product.custodyHistory[1]).toMatchObject({ holder: 'Test Manufacturer', location: 'Test Factory' });

  const read = await request(app).get(`/api/v1/products/${product.id}`).set(auth).expect(200);
  expect(read.body).toMatchObject({ id: product.id, status: 'CERTIFIED', inspector: 'Test Inspector' });

  const verified = await request(app).get(`/api/v1/verify/${product.id}`).expect(200);
  expect(verified.body).toMatchObject({ verified: true, productId: product.id, product: read.body });
  expect(mockGateway.disconnect).toHaveBeenCalledTimes(5);
});

test('approved cotton tokenization emits a bridge event with stored batch data', async () => {
  const SupplyChainContract = require('../../chaincode/supplychain');
  const chaincode = new SupplyChainContract();
  const state = new Map();
  const setEvent = jest.fn();
  const context = {
    stub: {
      getState: async key => state.get(key) || Buffer.alloc(0),
      putState: async (key, value) => { state.set(key, value); },
      setEvent,
      getTxTimestamp: () => ({ seconds: 1790531000, nanos: 123000000 }),
      getTxID: () => 'a'.repeat(64),
    },
    clientIdentity: { getID: () => 'test-admin', assertAttributeValue: (name, role) => role === 'certifier' },
  };
  const contract = {
    submitTransaction: async (name, ...args) => Buffer.from(await chaincode[name](context, ...args)),
    evaluateTransaction: async (name, ...args) => Buffer.from(await chaincode[name](context, ...args)),
  };
  connectToFabric.mockResolvedValue({ gateway: mockGateway, contract });
  const auth = { Authorization: `Bearer ${token('admin')}` };
  const batchId = 'BATCH-FLOW-001';

  await request(app).post('/api/v1/batches').set(auth).send({
    id: batchId, farmID: 'Test Farm', quantity: 10, organic: true, fairTrade: true,
    harvestDate: '2026-09-27', location: 'Farm',
  }).expect(201);
  const stored = await request(app).post(`/api/v1/batches/${batchId}/store`).set(auth)
    .send({ warehouseId: 'WH-1' }).expect(200);
  expect(stored.body.batch).toMatchObject({ status: 'STORED', location: 'WH-1' });

  await request(app).post(`/api/v1/batches/${batchId}/verify`).set(auth)
    .send({ certificationHash: '0x' + 'b'.repeat(64) }).expect(200);
  setEvent.mockClear();

  const requested = await request(app).post('/api/v1/tokenize').set(auth)
    .send({ batchID: batchId, quantity: 3, warehouseID: 'WH-1' }).expect(201);
  expect(setEvent).not.toHaveBeenCalled();
  const approved = await request(app).post(`/api/v1/tokenize/${requested.body.requestID}/approve`).set(auth).expect(200);
  expect(approved.body.request.status).toBe('APPROVED');
  expect(setEvent).toHaveBeenCalledTimes(1);
  expect(setEvent.mock.calls[0][0]).toBe('TokenizationRequested');
  expect(JSON.parse(setEvent.mock.calls[0][1].toString())).toEqual({
    requestId: requested.body.requestID, batchId, quantity: 3, warehouseId: 'WH-1',
  });
  await request(app).post(`/api/v1/tokenize/${requested.body.requestID}/approve`).set(auth).expect(409);
  expect(setEvent).toHaveBeenCalledTimes(1);
});

test('finished product requests an NFT and records its Ethereum token ID', async () => {
  const SupplyChainContract = require('../../chaincode/supplychain');
  const chaincode = new SupplyChainContract();
  const state = new Map([['COTTON-NFT', Buffer.from(JSON.stringify({
    id: 'COTTON-NFT', type: 'cotton', organic: true, status: 'TOKENIZED',
  }))]]);
  const setEvent = jest.fn();
  const context = {
    stub: {
      getState: async key => state.get(key) || Buffer.alloc(0),
      putState: async (key, value) => { state.set(key, value); },
      getTxTimestamp: () => ({ seconds: 1790531000, nanos: 0 }),
      setEvent,
    },
    clientIdentity: { getID: () => 'test-admin', assertAttributeValue: (name, role) => role === 'certifier' },
  };
  const contract = {
    submitTransaction: async (name, ...args) => Buffer.from(await chaincode[name](context, ...args)),
    evaluateTransaction: async (name, ...args) => Buffer.from(await chaincode[name](context, ...args)),
  };
  connectToFabric.mockResolvedValue({ gateway: mockGateway, contract });
  const auth = { Authorization: `Bearer ${token('admin')}` };

  const created = await request(app).post('/api/v1/finished-products').set(auth).send({
    id: 'SHIRT-NFT', type: 'finished', manufacturer: 'Test Maker',
    batchIds: ['COTTON-NFT'], productDate: '2026-09-27',
  }).expect(201);
  expect(created.body.product).toMatchObject({ status: 'FINISHED', batchIDs: ['COTTON-NFT'] });

  const ownerAddress = '0x1234567890123456789012345678901234567890';
  const requested = await request(app).post('/api/v1/products/SHIRT-NFT/mint-nft').set(auth)
    .send({ ownerAddress, metadata: { name: 'Test Shirt' } }).expect(202);
  expect(requested.body.product.status).toBe('NFT_MINT_PENDING');
  expect(setEvent).toHaveBeenCalledTimes(1);
  const [name, payload] = setEvent.mock.calls[0];
  expect(name).toBe('NFTMintingRequested');
  expect(JSON.parse(payload.toString())).toMatchObject({
    productId: 'SHIRT-NFT', recipient: ownerAddress, cottonBatchIds: ['COTTON-NFT'],
  });

  await expect(contract.submitTransaction('mintNFT', 'SHIRT-NFT', '42')).rejects.toThrow('BRIDGE_REQUIRED');
  // A separate bridge identity acknowledges the confirmed Ethereum mint.
  context.clientIdentity = { getID: () => 'test-bridge', assertAttributeValue: (name, role) => role === 'bridge' };
  await contract.submitTransaction('mintNFT', 'SHIRT-NFT', '42');
  const product = await request(app).get('/api/v1/products/SHIRT-NFT').set(auth).expect(200);
  expect(product.body).toMatchObject({ status: 'TOKENIZED', nftTokenId: '42' });
});


test('published prototype keys and tokens cannot grant administrative access', async () => {
  for (const key of ['test-api-key', 'admin-api-key']) {
    await request(app).post('/api/v1/token').set('x-api-key', key).expect(401);
  }
  const forged = jwt.sign({ id: 'attacker', role: 'admin' }, 'sustainablefashionchain-jwt-secret');
  await request(app).post('/api/v1/products').set('Authorization', `Bearer ${forged}`).send({}).expect(401);
  const mobile = jwt.sign({ id: 'attacker', role: 'admin' }, require('../config/auth').jwtSecret('mobile'));
  await request(app).post('/api/v1/products').set('Authorization', `Bearer ${mobile}`).send({}).expect(401);
  await request(app).post('/api/v1/token').set('x-api-key', process.env.API_READ_KEY).expect(200);
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ username: 'admin', password: 'password' }).expect(200);
  await agent.get('/dashboard').expect(302).expect('Location', '/login');
});

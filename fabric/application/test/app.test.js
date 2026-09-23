const request = require('supertest');
// Load EJS before the scoped filesystem spy; it captures fs.readFileSync at import.
require('ejs');
const { app, startServer, stopServer } = require('../app');
const jwt = require('jsonwebtoken');
const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');

jest.mock('fabric-network', () => ({ Gateway: jest.fn(), Wallets: { newFileSystemWallet: jest.fn() } }));
const mockContract = { evaluateTransaction: jest.fn(), submitTransaction: jest.fn() };
const mockGateway = { connect: jest.fn(), getNetwork: jest.fn(), disconnect: jest.fn() };
let profileRead;
const token = role => jwt.sign({ id: 'test', role }, 'sustainablefashionchain-jwt-secret');
beforeEach(() => {
  jest.clearAllMocks();
  Gateway.mockImplementation(() => mockGateway);
  mockGateway.getNetwork.mockResolvedValue({ getContract: () => mockContract });
  Wallets.newFileSystemWallet.mockResolvedValue({ get: async () => ({ type: 'X.509' }) });
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
  expect(Gateway).not.toHaveBeenCalled();
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
  await agent.post('/login').type('form').send({ username: 'admin', password: 'password' }).expect(302).expect('Location', '/dashboard');
  await agent.get('/dashboard').expect(200).expect(/Administrator/);
});

test('product lookup failure also releases its gateway', async () => {
  mockContract.evaluateTransaction.mockRejectedValue(new Error('Product missing'));
  await request(app).get('/api/v1/products/missing').set('Authorization', `Bearer ${token('reader')}`).expect(500);
  expect(mockGateway.disconnect).toHaveBeenCalledTimes(1);
});

test('inherited object properties cannot be used as API keys', async () => {
  await request(app).post('/api/v1/token').set('x-api-key', 'toString').expect(401);
});

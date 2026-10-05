import { network } from 'hardhat';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const SupplyChain = require('../../fabric/chaincode/supplychain');
const { VerifiedRelay } = require('../../bridging/verified-relay');
const { ethers } = await network.create();

const [attestor, relaySigner, executor] = await ethers.getSigners();
const output = resolve(process.env.SFC_DEMO_DIR || '../.runtime');
mkdirSync(output, { recursive: true });
const deployed = {};
async function deploy(name, ...args) {
  const contract = await (await ethers.getContractFactory(name)).deploy(...args);
  await contract.waitForDeployment();
  deployed[name] = contract;
  return contract;
}

const cot = await deploy('CotToken', attestor.address);
const registry = await ethers.getContractAt('CottonReserveRegistry', await cot.reserveRegistry());
deployed.CottonReserveRegistry = registry;
await deploy('ProductNFT', attestor.address);
const usd = await deploy('DemoUSD');
const feed = await deploy('DemoPriceFeed');
const market = await deploy('DemoCotMarket', await cot.getAddress(), await usd.getAddress(), await feed.getAddress());
await (await feed.setPrice(172000000n, (await ethers.provider.getBlock('latest')).timestamp)).wait();
await (await cot.grantRole(await cot.BRIDGE_ROLE(), relaySigner.address)).wait();

// Real chaincode functions, with an explicitly labelled in-memory ledger fixture.
// This proves cross-component behavior, not Fabric consensus or endorsement.
const cc = new SupplyChain();
const ledger = new Map();
let nonce = 0, txId, role = 'producer', tokenizationEvent;
const ctx = {
  stub: {
    getState: async id => ledger.get(id) || Buffer.alloc(0),
    putState: async (id, data) => ledger.set(id, data),
    getTxTimestamp: () => ({ seconds: Math.floor(Date.now() / 1000), nanos: 0 }),
    getTxID: () => txId,
    setEvent: (name, data) => { if (name === 'TokenizationRequested') tokenizationEvent = { ...JSON.parse(data), fabricTxId: txId }; },
  },
  clientIdentity: { getID: () => role, assertAttributeValue: (name, expected) => role === expected },
};
async function submit(name, ...args) {
  txId = createHash('sha256').update(`local-fabric-fixture:${++nonce}:${name}:${JSON.stringify(args)}`).digest('hex');
  return cc[name](ctx, ...args);
}
let liveConnections, liveEvents, liveEvent;
const liveConfig = process.env.SFC_LIVE_FABRIC_CONFIG
  ? JSON.parse(readFileSync(process.env.SFC_LIVE_FABRIC_CONFIG)) : null;
if (liveConfig) {
  const { connectToFabric } = require('../../bridging/fabric-client');
  liveConnections = {};
  for (const identity of ['producer', 'certifier', 'bridge']) {
    liveConnections[identity] = await connectToFabric({ ...liveConfig, identity });
  }
  liveEvents = await liveConnections.certifier.network.getChaincodeEvents('supplychain', { startBlock: 0n });
  liveEvent = (async () => {
    for await (const event of liveEvents) {
      if (event.eventName === 'TokenizationRequested' && JSON.parse(Buffer.from(event.payload)).requestId === 'DEMO-REQUEST-001') return event;
    }
    throw new Error('MISSING_FABRIC_EVENT');
  })();
  submit = async (name, ...args) => {
    const receipt = await liveConnections[role].contract.submitWithReceipt(name, ...args);
    txId = receipt.transactionId;
    return receipt.result.toString();
  };
}
const batchId = 'DEMO-COTTON-001';
await submit('registerCottonBatch', batchId, 'Demo farm', '42000', 'true', 'true', '2026-10-05', 'Demo origin');
await submit('storeCottonBatch', batchId, 'DEMO-WH');
role = 'certifier';
const verified = JSON.parse(await submit('verifyCottonBatch', batchId, ethers.id('demo-inspection-report')));
await (await registry.attestReserve(ethers.id(batchId), ethers.parseEther('42000'),
  verified.certificationHash, '0x' + verified.fabricVerificationTxId)).wait();
await submit('requestTokenization', 'DEMO-REQUEST-001', batchId, '35000', 'DEMO-WH');
await submit('approveTokenizationRequest', 'DEMO-REQUEST-001');
if (liveConfig) {
  const event = await liveEvent;
  if (event.transactionId !== txId) throw new Error('FABRIC_EVENT_RECEIPT_MISMATCH');
  tokenizationEvent = { ...JSON.parse(Buffer.from(event.payload)), fabricTxId: event.transactionId };
  liveEvents.close();
}
role = 'bridge';
const relay = new VerifiedRelay({ token: cot.connect(relaySigner), fabric: { submitTransaction: submit } });
await relay.relay(tokenizationEvent, attestor.address);
const reconciled = await relay.relay(tokenizationEvent, attestor.address);
if (!reconciled.reconciled || await cot.totalSupply() !== ethers.parseEther('35000')) throw new Error('REPLAY_RECOVERY_FAILED');
try {
  await cot.connect(relaySigner).mintVerifiedBatch('0x' + tokenizationEvent.fabricTxId,
    batchId, ethers.parseEther('35000'), 'DEMO-WH', attestor.address);
  throw new Error('REPLAY_NOT_REJECTED');
} catch (error) {
  if (!String(error).includes('EVENT_ALREADY_PROCESSED')) throw error;
}
await (await cot.transfer(await market.getAddress(), ethers.parseEther('34000'))).wait();
await (await cot.transfer(executor.address, ethers.parseEther('1000'))).wait();
await (await usd.mint(executor.address, 8280n * 10n**6n)).wait();
await (await usd.mint(await market.getAddress(), 100000n * 10n**6n)).wait();
// Bounded local demo allowances. The executor never auto-approves unlimited funds.
await (await usd.connect(executor).approve(await market.getAddress(), 1000n * 10n**6n)).wait();
await (await cot.connect(executor).approve(await market.getAddress(), ethers.parseEther('1000'))).wait();

const completedBatch = liveConfig
  ? JSON.parse((await liveConnections.producer.contract.evaluateTransaction('queryProduct', batchId)).toString())
  : JSON.parse(ledger.get(batchId));
writeFileSync(resolve(output, 'fabric-fixture.json'), JSON.stringify({
  kind: liveConfig ? 'live Fabric snapshot' : 'in-memory Fabric chaincode fixture', batches: [completedBatch],
  delayed_shipments: 3, rejected_batches: 1, supplier_name: 'Demo cotton cooperative',
}, null, 2));
const config = {
  rpc_url: process.env.SFC_RPC_URL || 'http://127.0.0.1:8545',
  artifacts_dir: 'abi',
  ...(liveConfig ? { fabric_api_url: liveConfig.apiUrl, fabric_batch_ids: [batchId] } : { fabric_fixture: 'fabric-fixture.json' }),
  executor_address: executor.address, enable_execution: true, allow_local_unlocked_signer: true,
  code_hashes: {},
};
for (const [name, contract] of Object.entries(deployed)) {
  config[name] = await contract.getAddress();
  config.code_hashes[name] = ethers.keccak256(await ethers.provider.getCode(config[name])).slice(2);
  const dir = resolve(output, 'abi', name.startsWith('Demo') ? 'demo' : '', `${name}.sol`);
  mkdirSync(dir, { recursive: true });
  const source = resolve('artifacts/contracts', name.startsWith('Demo') ? 'demo' : '', `${name}.sol`, `${name}.json`);
  writeFileSync(resolve(dir, `${name}.json`), readFileSync(source));
}
writeFileSync(resolve(output, 'local.json'), JSON.stringify(config, null, 2));
console.log(liveConfig ? 'Fabric: LIVE two-organization network; committed verification, approval and acknowledgment'
  : 'Fabric: real chaincode using an in-memory fixture (no live Fabric network)');
if (liveConnections) for (const connection of Object.values(liveConnections)) connection.gateway.disconnect();
console.log('Ethereum: 42,000 verified kg; 35,000 COT minted via VerifiedRelay');
console.log('Bridge replay: EVENT_ALREADY_PROCESSED; acknowledgment retry reconciled');
console.log(`Local demo configuration: ${resolve(output, 'local.json')}`);

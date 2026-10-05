const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const { VerifiedRelay } = require('../bridging/verified-relay');
const { validateRound } = require('../bridging/oracle-validation');
const requireBridge = createRequire(path.resolve(__dirname, '../bridging/package.json'));
const { ethers } = requireBridge('ethers');

const fresh = { answer: 172000000n, roundId: 8n, answeredInRound: 8n, updatedAt: 10000n };
test('oracle: freshness boundary, missing, future, nonpositive and incomplete rounds', () => {
  assert.equal(validateRound(fresh, { now: 13600 }).ageSeconds, 3600);
  assert.throws(() => validateRound(fresh, { now: 13601 }), /STALE_ORACLE/);
  assert.throws(() => validateRound(null), /MISSING_ORACLE/);
  assert.throws(() => validateRound(fresh, { now: 9999 }), /FUTURE_ORACLE/);
  assert.throws(() => validateRound({ ...fresh, answer: 0n }, { now: 10000 }), /INVALID_ORACLE_PRICE/);
  assert.throws(() => validateRound({ ...fresh, answeredInRound: 7n }, { now: 10000 }), /INCOMPLETE_ORACLE_ROUND/);
});

test('bridge: retries reconcile mined mint after failed Fabric acknowledgment', async () => {
  const recipient = '0x' + '1'.repeat(40);
  const hash = '0x' + '2'.repeat(64);
  let minted = 0, acknowledgments = 0, confirmations = 0;
  const event = { fabricTxId: 'a'.repeat(64), requestId: 'request', batchId: 'batch', quantity: '2.5', warehouseId: 'WH' };
  const token = {
    async eventIdFor(tx, batch, amount) {
      return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'bytes32', 'uint256', 'string'], [tx, ethers.id(batch), amount, 'MINT_COT']));
    },
    async processedEvents() { return minted > 0; },
    async mintVerifiedBatch() { minted++; return { async wait() { return { hash, status: 1 }; } }; },
    filters: { VerifiedEventMinted: eventId => eventId },
    async queryFilter() { return [{ args: { recipient }, async getTransactionReceipt() { return { hash, status: 1 }; } }]; },
    runner: { provider: { async waitForTransaction() { confirmations++; } } },
  };
  const fabric = { async submitTransaction(name, requestId, tx) {
    assert.deepEqual([name, requestId, tx], ['completeTokenization', 'request', hash]);
    if (++acknowledgments === 1) throw new Error('Fabric unavailable');
  } };
  await assert.rejects(new VerifiedRelay({ token, fabric }).relay(event, recipient), /Fabric unavailable/);
  const result = await new VerifiedRelay({ token, fabric }).relay(event, recipient);
  assert.equal(result.reconciled, true);
  assert.equal(minted, 1);
  assert.equal(confirmations, 1);
  await assert.rejects(new VerifiedRelay({ token, fabric }).relay(event, '0x' + '3'.repeat(40)), /REPLAY_RECONCILIATION_MISMATCH/);
});

test('bridge: missing Fabric identity and invalid quantities never call mint', async () => {
  const relay = new VerifiedRelay({ token: {}, fabric: {} });
  await assert.rejects(relay.relay({ fabricTxId: 'random' }, ''), /MISSING_FABRIC_TX/);
  await assert.rejects(relay.relay({ fabricTxId: 'a'.repeat(64), requestId: 'r', batchId: 'b', warehouseId: 'w', quantity: '-1' }, ''), /INVALID_BRIDGE_AMOUNT/);
});

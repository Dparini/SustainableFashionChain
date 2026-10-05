const assert = require('node:assert/strict');
const SupplyChainContract = require('../index');

describe('Fabric RWA verification boundary', () => {
  let cc, ctx, ledger, events, role;
  beforeEach(() => {
    cc = new SupplyChainContract(); ledger = new Map(); events = []; role = 'producer';
    ctx = { stub: {
      getState: async id => ledger.get(id) || Buffer.alloc(0),
      putState: async (id, data) => ledger.set(id, data),
      getTxTimestamp: () => ({ seconds: 1700000000, nanos: 0 }),
      getTxID: () => 'a'.repeat(64),
      setEvent: (name, data) => events.push({ name, data: JSON.parse(data) }),
    }, clientIdentity: { getID: () => role, assertAttributeValue: (name, expected) => role === expected } };
  });
  async function stored() {
    await cc.registerCottonBatch(ctx, 'b', 'farm', '100', 'true', 'true', '2026-10-05', 'farm');
    await cc.storeCottonBatch(ctx, 'b', 'WH');
  }
  async function verified() {
    await stored(); role = 'certifier';
    await cc.verifyCottonBatch(ctx, 'b', '0x' + 'b'.repeat(64));
  }
  it('rejects nonfinite quantities and duplicate batch registration', async () => {
    for (const q of ['NaN', 'Infinity', '-1', '0', '2kg']) {
      await assert.rejects(cc.registerCottonBatch(ctx, 'b', 'farm', q, 'true', 'true', '', ''), /INVALID_COTTON_BATCH/);
    }
    await stored();
    await assert.rejects(cc.registerCottonBatch(ctx, 'b', 'farm', '1', '', '', '', ''), /BATCH_ALREADY_EXISTS/);
    await assert.rejects(cc.registerProduct(ctx, 'b', 'cotton', '', '', '[]', '{}'), /RECORD_ALREADY_EXISTS/);
  });
  it('requires certified backing and organizational identity', async () => {
    await stored();
    await assert.rejects(cc.requestTokenization(ctx, 'r', 'b', '10', 'WH'), /VERIFIED_BACKING_REQUIRED/);
    await assert.rejects(cc.verifyCottonBatch(ctx, 'b', '0x' + 'b'.repeat(64)), /CERTIFIER_REQUIRED/);
    role = 'certifier';
    await assert.rejects(cc.verifyCottonBatch(ctx, 'b', 'invalid'), /INVALID_CERTIFICATION_HASH/);
    const batch = JSON.parse(await cc.verifyCottonBatch(ctx, 'b', '0x' + 'b'.repeat(64)));
    assert.equal(batch.rwaStatus, 'VERIFIED');
    assert.equal(batch.fabricVerificationTxId, 'a'.repeat(64));
  });
  it('rejects concurrent requests and warehouse mismatch', async () => {
    await verified();
    await assert.rejects(cc.requestTokenization(ctx, 'r', 'b', '10', 'other'), /WAREHOUSE_MISMATCH/);
    await assert.rejects(cc.requestTokenization(ctx, 'r', 'b', 'NaN', 'WH'), /Invalid tokenization quantity/);
    await cc.requestTokenization(ctx, 'r', 'b', '10', 'WH');
    await assert.rejects(cc.requestTokenization(ctx, 'r2', 'b', '10', 'WH'), /TOKENIZATION_ALREADY_PENDING/);
  });
  it('generic metadata updates cannot forge verified backing', async () => {
    await stored();
    await assert.rejects(cc.updateStatus(ctx, 'b', 'STORED', '', '{"rwaStatus":"VERIFIED"}'), /USE_COTTON_STATE_MACHINE/);
    await assert.rejects(cc.transferCustody(ctx, 'b', 'other', '', ''), /USE_COTTON_STATE_MACHINE/);
  });
  it('approval and acknowledgment require separate roles; same receipt is idempotent', async () => {
    await verified();
    await cc.requestTokenization(ctx, 'r', 'b', '10', 'WH');
    role = 'producer';
    await assert.rejects(cc.approveTokenizationRequest(ctx, 'r'), /CERTIFIER_REQUIRED/);
    role = 'certifier'; await cc.approveTokenizationRequest(ctx, 'r');
    assert.equal(events.at(-1).name, 'TokenizationRequested');
    const tx = '0x' + 'c'.repeat(64);
    await assert.rejects(cc.completeTokenization(ctx, 'r', tx), /BRIDGE_REQUIRED/);
    role = 'bridge';
    const completed = await cc.completeTokenization(ctx, 'r', tx);
    assert.equal(await cc.completeTokenization(ctx, 'r', tx), completed);
    await assert.rejects(cc.completeTokenization(ctx, 'r', '0x' + 'd'.repeat(64)), /not in APPROVED/);
  });
});

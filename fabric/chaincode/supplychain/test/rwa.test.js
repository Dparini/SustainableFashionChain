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
  it('NFT and recycling acknowledgments require a bridge and cannot overwrite provenance', async () => {
    await verified(); role = 'producer';
    await cc.createFinishedProduct(ctx, 'shirt', 'finished', 'maker', '["b"]', '2026-10-06');
    await assert.rejects(cc.mintNFT(ctx, 'shirt', '42'), /BRIDGE_REQUIRED/);
    await assert.rejects(cc.updateStatus(ctx, 'shirt', 'TOKENIZED', '', '{"nftTokenId":"42"}'), /USE_PRODUCT_STATE_MACHINE/);
    role = 'bridge';
    await assert.rejects(cc.mintNFT(ctx, 'shirt', '42'), /NFT_ACKNOWLEDGMENT_MISMATCH/);
    role = 'producer';
    await cc.requestNFTMinting(ctx, 'shirt', '0x' + '1'.repeat(40), 'ipfs://shirt');
    role = 'bridge';
    const minted = await cc.mintNFT(ctx, 'shirt', '42');
    assert.equal(await cc.mintNFT(ctx, 'shirt', '42'), minted);
    await assert.rejects(cc.mintNFT(ctx, 'shirt', '43'), /NFT_ACKNOWLEDGMENT_MISMATCH/);
    role = 'producer';
    const tx = '0x' + 'c'.repeat(64);
    await assert.rejects(cc.recordRecycling(ctx, 'shirt', '42', tx), /BRIDGE_REQUIRED/);
    role = 'bridge';
    await assert.rejects(cc.recordRecycling(ctx, 'shirt', '43', tx), /NFT_ACKNOWLEDGMENT_MISMATCH/);
    const recycled = await cc.recordRecycling(ctx, 'shirt', '42', tx);
    assert.equal(await cc.recordRecycling(ctx, 'shirt', '42', tx), recycled);
    assert.equal(JSON.parse(recycled).status, 'RECYCLING_INITIATED');
    // A late mint acknowledgment must preserve a later recycling transition.
    assert.equal(await cc.mintNFT(ctx, 'shirt', '42'), recycled);
  });

  it('ledger queries close iterators, exclude requests from products and reject corrupt records', async () => {
    let closed = 0;
    const entries = [{ type: 'finished', id: 'shirt' }, { id: 'request', status: 'APPROVED', batchId: 'b' }];
    ctx.stub.getStateByRange = async () => {
      let index = 0;
      return { next: async () => index < entries.length
        ? { done: false, value: { key: String(index), value: Buffer.from(JSON.stringify(entries[index++])) } }
        : { done: true }, close: async () => { closed++; } };
    };
    assert.deepEqual(JSON.parse(await cc.queryAllProducts(ctx)), [entries[0]]);
    assert.deepEqual(JSON.parse(await cc.queryApprovedTokenizationRequests(ctx)), [entries[1]]);
    ctx.stub.getStateByRange = async () => ({
      next: async () => ({ done: false, value: { key: 'corrupt', value: Buffer.from('{broken') } }),
      close: async () => { closed++; },
    });
    await assert.rejects(cc.queryAllProducts(ctx), /INVALID_LEDGER_RECORD: corrupt/);
    assert.equal(closed, 3);
  });

});

import { expect } from 'chai';
import { network } from 'hardhat';
const { ethers } = await network.create();
const kg = ethers.parseEther;

describe('RWA backing and replay boundary', function () {
  let token, registry, admin, bridge, attacker;
  const batch = 'COTTON-VERIFIED-001';
  const cert = ethers.id('signed-inspection');
  const verification = ethers.id('fabric-verification-tx');

  beforeEach(async () => {
    [admin, bridge, attacker] = await ethers.getSigners();
    token = await (await ethers.getContractFactory('CotToken')).deploy(admin.address);
    registry = await ethers.getContractAt('CottonReserveRegistry', await token.reserveRegistry());
    await token.grantRole(await token.BRIDGE_ROLE(), bridge.address);
    await registry.attestReserve(ethers.id(batch), kg('8000'), cert, verification);
  });

  const mint = (token, bridge, tx, amount, id = batch) =>
    token.connect(bridge).mintVerifiedBatch(ethers.id(tx), id, kg(amount), 'WH-001', bridge.address);

  it('rejects 10,000 COT against 8,000 verified kg and rolls back event consumption', async () => {
    await expect(mint(token, bridge, 'tx-1', '10000')).to.be.revertedWith('INSUFFICIENT_BACKING');
    expect(await token.totalSupply()).to.equal(0n);
    expect(await token.processedEvents(await token.eventIdFor(ethers.id('tx-1'), batch, kg('10000')))).to.equal(false);
  });

  it('rejects a stable event replay and leaves balances unchanged', async () => {
    await mint(token, bridge, 'tx-1', '1000');
    await expect(mint(token, bridge, 'tx-1', '1000')).to.be.revertedWith('EVENT_ALREADY_PROCESSED');
    expect(await token.totalSupply()).to.equal(kg('1000'));
  });

  it('rejects reuse of a Fabric transaction with changed amount', async () => {
    await mint(token, bridge, 'tx-1', '1000');
    await expect(mint(token, bridge, 'tx-1', '2000')).to.be.revertedWith('FABRIC_TX_ALREADY_PROCESSED');
  });

  it('caps multiple distinct events at the batch backing', async () => {
    await mint(token, bridge, 'tx-1', '3000');
    await mint(token, bridge, 'tx-2', '5000');
    await expect(mint(token, bridge, 'tx-3', '0.000000000000000001')).to.be.revertedWith('INSUFFICIENT_BACKING');
    expect(await token.totalSupply()).to.equal(await registry.totalVerifiedKg());
  });

  it('does not allow privileged generic reward minting to bypass backing', async () => {
    await expect(token.mintTo(admin.address, kg('1'))).to.be.revertedWith('BATCH_BACKING_REQUIRED');
  });

  it('enforces backing on the legacy batch issuance entry point', async () => {
    await expect(token.mintBatch(batch, kg('10000'), 'WH', admin.address)).to.be.revertedWith('INSUFFICIENT_BACKING');
    await expect(token.mintBatch('invented', kg('1'), 'WH', admin.address)).to.be.revertedWith('UNVERIFIED_RESERVE');
  });

  it('a relay cannot attest, reduce, deactivate or consume reserves directly', async () => {
    await expect(registry.connect(bridge).attestReserve(ethers.id(batch), kg('9000'), cert, verification)).to.be.revert(ethers);
    await expect(registry.connect(bridge).consume(ethers.id(batch), kg('1'))).to.be.revertedWith('ONLY_TOKEN');
    await expect(mint(token, attacker, 'tx-a', '1')).to.be.revert(ethers);
  });

  it('rejects missing provenance and changing a batch identity', async () => {
    await expect(registry.attestReserve(ethers.id('new'), kg('1'), ethers.ZeroHash, verification)).to.be.revertedWith('MISSING_PROVENANCE');
    await expect(registry.attestReserve(ethers.id(batch), kg('9000'), ethers.id('different-cert'), verification)).to.be.revertedWith('PROVENANCE_MISMATCH');
  });

  it('cannot withdraw backing that supports issued claims', async () => {
    await mint(token, bridge, 'tx-1', '3000');
    await expect(registry.attestReserve(ethers.id(batch), kg('2999'), cert, verification)).to.be.revertedWith('BACKING_BELOW_ISSUANCE');
    await expect(registry.deactivateReserve(ethers.id(batch))).to.be.revertedWith('RESERVE_HAS_CLAIMS');
  });

  it('generic burns do not release batch capacity for double claims', async () => {
    await mint(token, bridge, 'tx-1', '8000');
    await token.connect(bridge).burn(kg('8000'));
    await expect(mint(token, bridge, 'tx-2', '1')).to.be.revertedWith('INSUFFICIENT_BACKING');
    expect(await registry.totalTokenizedKg()).to.equal(kg('8000'));
  });

  it('deactivation/reactivation does not double count unused capacity', async () => {
    await registry.deactivateReserve(ethers.id(batch));
    expect(await registry.totalVerifiedKg()).to.equal(0n);
    await registry.attestReserve(ethers.id(batch), kg('8000'), cert, verification);
    expect(await registry.totalVerifiedKg()).to.equal(kg('8000'));
  });

  it('rejects zero mint, invalid warehouse and zero Fabric transaction', async () => {
    await expect(mint(token, bridge, 'zero', '0')).to.be.revertedWith('INSUFFICIENT_BACKING');
    await expect(token.connect(bridge).mintVerifiedBatch(ethers.ZeroHash, batch, kg('1'), 'WH', bridge.address)).to.be.revertedWith('MISSING_FABRIC_TX');
    await expect(token.connect(bridge).mintVerifiedBatch(ethers.id('tx'), batch, kg('1'), '', bridge.address)).to.be.revertedWith('INVALID_BATCH');
  });

  it('randomized bounded issuance preserves global and per-batch invariants', async () => {
    let state = 42;
    for (let i = 0; i < 24; i++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const amount = kg(String(state % 900 + 1));
      const reserve = await registry.reserves(ethers.id(batch));
      const call = token.connect(bridge).mintVerifiedBatch(ethers.id(`property-${i}`), batch, amount, 'WH', bridge.address);
      if (reserve.tokenizedKg + amount > reserve.verifiedKg) await expect(call).to.be.revertedWith('INSUFFICIENT_BACKING');
      else await call;
      expect(await token.totalSupply()).to.be.at.most(await registry.totalVerifiedKg());
      const updated = await registry.reserves(ethers.id(batch));
      expect(updated.tokenizedKg).to.be.at.most(updated.verifiedKg);
    }
  });
});
